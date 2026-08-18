package expo.modules.kighmuvpnnative

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.ConnectivityManager
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.io.File
import java.net.InetAddress
import java.net.Socket
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/** Android VPN host for two isolated modes: legacy UDP-ZIVPN and one SSH/SlowDNS session. */
class KighmuVpnService : VpnService() {
  private val lifecycleLock = Any()
  private var tunFd = -1
  private var zivpnProcess: Process? = null
  private var slowDnsTunnel: SlowDnsSshTunnel? = null
  private var activeMode = "zivpn"
  private var attemptGeneration = 0L

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> stopVpn()
      ACTION_START -> {
        val generation = beginStart() ?: return START_NOT_STICKY
        thread(isDaemon = true, name = "kighmu-vpn-start") { startTunnel(intent, generation) }
      }
    }
    return START_NOT_STICKY
  }

  private fun beginStart(): Long? = synchronized(lifecycleLock) {
    if (currentStatus == STATUS_CONNECTED || currentStatus == STATUS_CONNECTING) return@synchronized null
    attemptGeneration += 1
    currentStatus = STATUS_CONNECTING
    stateSink?.invoke(STATUS_CONNECTING)
    attemptGeneration
  }

  private fun isActive(generation: Long): Boolean = synchronized(lifecycleLock) {
    generation == attemptGeneration && currentStatus == STATUS_CONNECTING
  }

  private fun startTunnel(intent: Intent, generation: Long) {
    try {
      val root = JSONObject(intent.getStringExtra(EXTRA_CONFIG_JSON).orEmpty())
      when (root.optString("mode", "zivpn")) {
        "slowdns" -> startSlowDns(root, generation)
        else -> startZivpn(root, generation)
      }
    } catch (error: Throwable) {
      fail(generation, error.message ?: error::class.java.simpleName)
    }
  }

  private fun startZivpn(root: JSONObject, generation: Long) {
    val host = root.optString("host").trim()
    val port = root.optString("port").trim().replace(Regex("\\s+"), "")
    val obfs = root.optString("obfs").trim()
    val password = root.optString("password").trim()
    if (host.isBlank() || port.isBlank() || obfs.isBlank() || password.isBlank()) {
      error("Host, port, Obfs et mot de passe sont obligatoires")
    }
    activeMode = "zivpn"
    createNotificationChannel()
    startForeground(NOTIFICATION_ID, notification("Préparation UDP-ZIVPN"))
    val physicalNetwork = physicalNetwork()
    val resolvedHost = try { InetAddress.getByName(host).hostAddress ?: host } catch (_: Throwable) { host }
    val fd = establishVpn("UDP-ZIVPN", physicalNetwork)
    bindToPhysicalNetwork(physicalNetwork, "ZIVPN")
    val nativeDir = applicationInfo.nativeLibraryDir
    val binary = File(nativeDir, "libuz_core.so")
    if (!binary.exists() || binary.length() == 0L || !binary.canExecute()) error("libuz_core.so absent ou non exécutable")
    if (!ZivpnTun2Socks.init()) error("hev_jni indisponible dans l’APK")
    val config = File(cacheDir, "zivpn-client.json")
    config.writeText(buildUzConfig(resolvedHost, port, password, obfs))
    val process = ProcessBuilder(binary.absolutePath, "-s", obfs, "--config", config.readText())
      .directory(filesDir)
      .apply {
        environment()["LD_LIBRARY_PATH"] = nativeDir
        environment()["HOME"] = cacheDir.absolutePath
        environment()["TMPDIR"] = cacheDir.absolutePath
        redirectErrorStream(true)
      }
      .start()
    synchronized(lifecycleLock) { zivpnProcess = process }
    emitLog("info", "ZIVPN", "libuz_core.so démarré, ABI armeabi-v7a, serveur=$resolvedHost:$port")
    thread(isDaemon = true, name = "zivpn-native-log") { readNativeLogs(process, "ZIVPN") }
    if (!waitForLocalPort(process, 7778, 3500L)) error("Le relais SOCKS5 ZIVPN n’est pas apparu sur 127.0.0.1:7778")
    if (!isActive(generation)) return
    ZivpnTun2Socks.start(this, fd, 7778, 1400)
    emitLog("info", "ZIVPN", "Relais TUN→SOCKS5 actif sur 127.0.0.1:7778")
    markConnected(generation, "UDP-ZIVPN connecté à $resolvedHost:$port")
  }

  private fun startSlowDns(root: JSONObject, generation: Long) {
    activeMode = "slowdns"
    createNotificationChannel()
    startForeground(NOTIFICATION_ID, notification("Préparation SSH/SlowDNS"))
    val settings = SlowDnsSshTunnel.Settings.fromJson(root)
    settings.validate()
    val physicalNetwork = physicalNetwork()
    val fd = establishVpn("SSH/SlowDNS", physicalNetwork)
    bindToPhysicalNetwork(physicalNetwork, "SLOWDNS")
    emitLog("info", "SLOWDNS", "Profil validé ; démarrage d’une session unique sans balancer")
    val tunnel = SlowDnsSshTunnel(this, this) { level, component, message -> emitLog(level, component, message) }
    synchronized(lifecycleLock) { slowDnsTunnel = tunnel }
    val socksPort = tunnel.start(settings)
    if (!isActive(generation)) return
    if (!ZivpnTun2Socks.init()) error("hev_jni indisponible pour le relais SlowDNS")
    ZivpnTun2Socks.start(this, fd, socksPort, 1400)
    emitLog("info", "SLOWDNS", "Relais TUN→SOCKS5 actif ; session SSH/SlowDNS mono-tunnel prête")
    markConnected(generation, "SSH/SlowDNS connecté")
  }

  private fun physicalNetwork() = (getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager).activeNetwork
    ?: error("Aucun réseau physique disponible")

  private fun establishVpn(session: String, network: android.net.Network): Int {
    val builder = Builder()
      .setSession(session)
      .setMtu(1400)
      .addAddress("10.0.0.2", 24)
      .addRoute("0.0.0.0", 0)
      .addDnsServer("8.8.8.8")
      .setUnderlyingNetworks(arrayOf(network))
    builder.addDisallowedApplication(packageName)
    val fd = builder.establish()?.detachFd() ?: error("Android n’a pas fourni l’interface VPN")
    synchronized(lifecycleLock) { tunFd = fd }
    return fd
  }

  private fun bindToPhysicalNetwork(network: android.net.Network, component: String) {
    val connectivity = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
    if (!connectivity.bindProcessToNetwork(network)) error("Impossible de lier le processus au réseau physique")
    emitLog("info", component, "Application exclue du TUN et processus lié au réseau physique")
  }

  private fun markConnected(generation: Long, text: String) {
    synchronized(lifecycleLock) {
      if (!isActive(generation)) return
      currentStatus = STATUS_CONNECTED
      stateSink?.invoke(STATUS_CONNECTED)
    }
    startForeground(NOTIFICATION_ID, notification(text))
  }

  private fun buildUzConfig(host: String, port: String, password: String, obfs: String): String =
    """{"server":"${json(host + ":" + port)}","obfs":"${json(obfs)}","auth":"${json(password)}","socks5":{"listen":"127.0.0.1:7778"},"insecure":true,"recvwindowconn":65536,"recvwindow":262144,"disable_mtu_discovery":true,"down_mbps":50,"up_mbps":10}"""

  private fun json(value: String): String = value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r")

  private fun waitForLocalPort(process: Process, port: Int, timeoutMs: Long): Boolean {
    val deadline = System.nanoTime() + timeoutMs * 1_000_000L
    while (System.nanoTime() < deadline && process.isAlive) {
      try { Socket("127.0.0.1", port).use { return true } } catch (_: Throwable) { Thread.sleep(50) }
    }
    return false
  }

  private fun readNativeLogs(process: Process, component: String) {
    try { process.inputStream.bufferedReader().useLines { lines -> lines.forEach { line -> if (line.isNotBlank()) emitLog("info", component, line.take(500)) } } }
    catch (_: Throwable) { emitLog("warning", component, "Lecture du journal natif interrompue") }
  }

  private fun fail(generation: Long, message: String) {
    if (!isActive(generation)) return
    emitLog("error", if (activeMode == "slowdns") "SLOWDNS" else "ZIVPN", "Échec du tunnel : $message")
    stopVpn(STATUS_ERROR)
  }

  private fun emitLog(level: String, component: String, message: String) { logSink?.invoke(level, component, message) }

  private fun stopVpn(finalStatus: String = STATUS_DISCONNECTED) {
    val zivpn: Process?
    val slowDns: SlowDnsSshTunnel?
    val fd: Int
    synchronized(lifecycleLock) {
      attemptGeneration += 1
      zivpn = zivpnProcess; zivpnProcess = null
      slowDns = slowDnsTunnel; slowDnsTunnel = null
      fd = tunFd; tunFd = -1
      currentStatus = finalStatus
      stateSink?.invoke(finalStatus)
    }
    if (fd >= 0) try { ParcelFileDescriptor.adoptFd(fd).close() } catch (_: Throwable) {}
    try { (getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager).bindProcessToNetwork(null) } catch (_: Throwable) {}
    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
    thread(isDaemon = true, name = "vpn-stop") {
      try { ZivpnTun2Socks.stop() } catch (_: Throwable) {}
      try { slowDns?.stop() } catch (_: Throwable) {}
      try { zivpn?.waitFor(700, TimeUnit.MILLISECONDS) } catch (_: Throwable) {}
      try { if (zivpn?.isAlive == true) zivpn.destroyForcibly() } catch (_: Throwable) {}
      File(cacheDir, "zivpn-client.json").delete()
      emitLog("info", if (activeMode == "slowdns") "SLOWDNS" else "ZIVPN", "Arrêt complet du tunnel")
    }
    stopSelf()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= 26) getSystemService(NotificationManager::class.java).createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "KIGHMU VPN", NotificationManager.IMPORTANCE_LOW),
    )
  }

  private fun notification(text: String): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pending = launchIntent?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
    val stopPending = PendingIntent.getService(this, NOTIFICATION_ID, Intent(this, KighmuVpnService::class.java).apply { action = ACTION_STOP }, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_warning)
      .setContentTitle("KIGHMU VPN")
      .setContentText(text)
      .setOngoing(true)
      .setContentIntent(pending)
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Arrêter", stopPending)
      .build()
  }

  override fun onRevoke() { stopVpn(); super.onRevoke() }
  override fun onDestroy() { stopVpn(); super.onDestroy() }
  override fun onBind(intent: Intent?) = super.onBind(intent)

  companion object {
    const val ACTION_START = "expo.modules.kighmuvpnnative.START"
    const val ACTION_STOP = "expo.modules.kighmuvpnnative.STOP"
    const val EXTRA_CONFIG_JSON = "config_json"
    const val PREPARE_REQUEST_CODE = 4007
    const val STATUS_DISCONNECTED = "disconnected"
    const val STATUS_CONNECTING = "connecting"
    const val STATUS_CONNECTED = "connected"
    const val STATUS_ERROR = "error"
    const val CHANNEL_ID = "kighmu-vpn"
    const val NOTIFICATION_ID = 4008
    @Volatile var currentStatus = STATUS_DISCONNECTED
    @Volatile var logSink: ((String, String, String) -> Unit)? = null
    @Volatile var stateSink: ((String) -> Unit)? = null
  }
}
