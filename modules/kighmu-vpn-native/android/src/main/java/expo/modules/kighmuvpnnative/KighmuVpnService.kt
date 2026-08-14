package expo.modules.kighmuvpnnative

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat
import java.io.File
import java.net.InetAddress
import java.net.Socket
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * Temporary diagnostic client based on the UDP-ZIVPN engine from Zamois-tun.
 * KIGHMU's libkighmu.so is intentionally not referenced in this test service.
 */
class KighmuVpnService : VpnService() {
  private val lifecycleLock = Any()
  private var tunFd = -1
  private var zivpnProcess: Process? = null
  private var attemptGeneration = 0L

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> stopVpn()
      ACTION_START -> {
        val generation = beginStart() ?: return START_NOT_STICKY
        thread(isDaemon = true, name = "zivpn-test-start") {
          startZivpn(intent, generation)
        }
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

  private fun startZivpn(intent: Intent, generation: Long) {
    val host = intent.getStringExtra(EXTRA_HOST).orEmpty().trim()
    val port = intent.getStringExtra(EXTRA_PORT).orEmpty().trim().replace(Regex("\\s+"), "")
    val obfs = intent.getStringExtra(EXTRA_OBFS).orEmpty().trim()
    val password = intent.getStringExtra(EXTRA_PASSWORD).orEmpty().trim()
    if (host.isBlank() || port.isBlank() || obfs.isBlank() || password.isBlank()) {
      fail(generation, "Host, port, Obfs et mot de passe sont obligatoires")
      return
    }

    try {
      createNotificationChannel()
      startForeground(NOTIFICATION_ID, notification("Préparation du test UDP-ZIVPN"))
      val physicalNetwork = (getSystemService(CONNECTIVITY_SERVICE) as android.net.ConnectivityManager).activeNetwork
        ?: error("Aucun réseau physique disponible")
      val resolvedHost = try { InetAddress.getByName(host).hostAddress ?: host } catch (_: Throwable) { host }
      if (!isActive(generation)) return

      val builder = Builder()
        .setSession("UDP-ZIVPN test")
        .setMtu(1400)
        .addAddress("10.0.0.2", 24)
        .addRoute("0.0.0.0", 0)
        .addDnsServer("8.8.8.8")
        .setUnderlyingNetworks(arrayOf(physicalNetwork))
      builder.addDisallowedApplication(packageName)
      val established = builder.establish() ?: error("Android n’a pas fourni l’interface VPN")
      val fd = established.detachFd()
      synchronized(lifecycleLock) {
        if (!isActive(generation)) {
          ParcelFileDescriptor.adoptFd(fd).close()
          return
        }
        tunFd = fd
      }

      val connectivity = getSystemService(CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
      if (!connectivity.bindProcessToNetwork(physicalNetwork)) {
        error("Impossible de lier ZIVPN au réseau physique")
      }
      emitLog("info", "ZIVPN", "Application exclue du TUN et processus lié au réseau physique")

      val nativeDir = applicationInfo.nativeLibraryDir
      val binary = File(nativeDir, "libuz_core.so")
      if (!binary.exists() || binary.length() == 0L || !binary.canExecute()) {
        error("libuz_core.so absent ou non exécutable dans nativeLibraryDir")
      }
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
      synchronized(lifecycleLock) {
        if (!isActive(generation)) {
          process.destroyForcibly()
          ParcelFileDescriptor.adoptFd(fd).close()
          config.delete()
          return
        }
        zivpnProcess = process
      }
      emitLog("info", "ZIVPN", "libuz_core.so démarré, ABI armeabi-v7a, serveur=$resolvedHost:$port")
      thread(isDaemon = true, name = "zivpn-native-log") { readNativeLogs(process) }

      val socksReady = waitForLocalPort(process, 7778, 3500L)
      if (!socksReady) error("Le relais SOCKS5 ZIVPN n’est pas apparu sur 127.0.0.1:7778")
      if (!isActive(generation)) return
      ZivpnTun2Socks.start(this, fd, 7778, 1400)
      emitLog("info", "ZIVPN", "Relais TUN→SOCKS5 actif sur 127.0.0.1:7778")
      synchronized(lifecycleLock) {
        if (!isActive(generation)) return
        currentStatus = STATUS_CONNECTED
        stateSink?.invoke(STATUS_CONNECTED)
      }
      startForeground(NOTIFICATION_ID, notification("UDP-ZIVPN connecté à $resolvedHost:$port"))
    } catch (error: Throwable) {
      fail(generation, error.message ?: error::class.java.simpleName)
    }
  }

  private fun buildUzConfig(host: String, port: String, password: String, obfs: String): String {
    return """{"server":"${json(host + ":" + port)}","obfs":"${json(obfs)}","auth":"${json(password)}","socks5":{"listen":"127.0.0.1:7778"},"insecure":true,"recvwindowconn":65536,"recvwindow":262144,"disable_mtu_discovery":true,"down_mbps":50,"up_mbps":10}"""
  }

  private fun json(value: String): String = value
    .replace("\\", "\\\\")
    .replace("\"", "\\\"")
    .replace("\n", "\\n")
    .replace("\r", "\\r")

  private fun waitForLocalPort(process: Process, port: Int, timeoutMs: Long): Boolean {
    val deadline = System.nanoTime() + timeoutMs * 1_000_000L
    while (System.nanoTime() < deadline && process.isAlive) {
      try {
        Socket("127.0.0.1", port).use { return true }
      } catch (_: Throwable) {
        Thread.sleep(50)
      }
    }
    return false
  }

  private fun readNativeLogs(process: Process) {
    try {
      process.inputStream.bufferedReader().useLines { lines ->
        lines.forEach { line -> if (line.isNotBlank()) emitLog("info", "ZIVPN", line.take(500)) }
      }
    } catch (error: Throwable) {
      emitLog("warning", "ZIVPN", "Lecture du journal interrompue: ${error.message ?: "erreur"}")
    }
  }

  private fun fail(generation: Long, message: String) {
    if (!isActive(generation)) return
    emitLog("error", "ZIVPN", "Échec du test client: $message")
    stopVpn(STATUS_ERROR)
  }

  private fun emitLog(level: String, component: String, message: String) {
    logSink?.invoke(level, component, message)
  }

  private fun stopVpn(finalStatus: String = STATUS_DISCONNECTED) {
    val process: Process?
    val fd: Int
    synchronized(lifecycleLock) {
      attemptGeneration += 1
      process = zivpnProcess
      zivpnProcess = null
      fd = tunFd
      tunFd = -1
      currentStatus = finalStatus
      stateSink?.invoke(finalStatus)
    }
    if (fd >= 0) {
      try { ParcelFileDescriptor.adoptFd(fd).close() } catch (_: Throwable) {}
    }
    try { (getSystemService(CONNECTIVITY_SERVICE) as android.net.ConnectivityManager).bindProcessToNetwork(null) } catch (_: Throwable) {}
    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
    thread(isDaemon = true, name = "zivpn-test-stop") {
      try { ZivpnTun2Socks.stop() } catch (_: Throwable) {}
      try { process?.waitFor(700, TimeUnit.MILLISECONDS) } catch (_: Throwable) {}
      try { process?.destroyForcibly() } catch (_: Throwable) {}
      File(cacheDir, "zivpn-client.json").delete()
      emitLog("info", "ZIVPN", "Arrêt complet du test client UDP-ZIVPN")
    }
    stopSelf()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= 26) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "UDP-ZIVPN test", NotificationManager.IMPORTANCE_LOW),
      )
    }
  }

  private fun notification(text: String): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pending = launchIntent?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
    val stopPending = PendingIntent.getService(this, NOTIFICATION_ID, Intent(this, KighmuVpnService::class.java).apply { action = ACTION_STOP }, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_warning)
      .setContentTitle("UDP-ZIVPN test")
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
    const val EXTRA_HOST = "host"
    const val EXTRA_PORT = "port"
    const val EXTRA_OBFS = "obfs"
    const val EXTRA_PASSWORD = "password"
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
