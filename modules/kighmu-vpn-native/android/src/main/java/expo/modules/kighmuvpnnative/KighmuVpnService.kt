package expo.modules.kighmuvpnnative

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.provider.Settings
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.InetAddress
import java.net.Socket
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/** Android VPN host for two isolated modes: legacy UDP-ZIVPN and one SSH/SlowDNS session. */
class KighmuVpnService : VpnService() {
  private val lifecycleLock = Any()
  private var tunFd = -1
  private var zivpnProcess: Process? = null
  private var slowDnsTunnel: SlowDnsSshTunnel? = null
  private var familyBalancer: SocksProfileBalancer? = null
  private val familyStopActions = mutableListOf<() -> Unit>()
  private var activeMode = "zivpn"
  private var attemptGeneration = 0L

  override fun onCreate() {
    super.onCreate()
    PersistentDiagnosticLog.initialize(this)
    emitLog("info", "SERVICE", "Service VPN Android créé")
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    emitLog("info", "SERVICE", "Commande reçue : ${intent?.action ?: "inconnue"}")
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
      if (root.optInt("version", 0) >= 3) startCatalogTunnel(root, generation)
      else when (root.optString("mode", "zivpn")) {
        "slowdns" -> startSlowDns(root, generation)
        else -> startZivpn(root, generation)
      }
    } catch (error: Throwable) {
      PersistentDiagnosticLog.recordThrowable(this, "SERVICE", error)
      fail(generation, error.message ?: error::class.java.simpleName)
    }
  }

  private fun startZivpn(root: JSONObject, generation: Long) {
    val host = root.optString("host").trim()
    val port = root.optString("port").trim().replace(Regex("\\s+"), "")
    val password = root.optString("password").trim()
    if (host.isBlank() || port.isBlank() || password.isBlank()) {
      error("Host, port et mot de passe sont obligatoires")
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
    config.writeText(buildUzConfig(resolvedHost, port, password, ZIVPN_FIXED_OBFS))
    val process = ProcessBuilder(binary.absolutePath, "-s", ZIVPN_FIXED_OBFS, "--config", config.readText())
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
    ZivpnTun2Socks.start(this, fd, 7778, ZIVPN_TUN_MTU)
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
    val tunnel = SlowDnsSshTunnel(this, this, { level, component, message -> emitLog(level, component, message) })
    synchronized(lifecycleLock) { slowDnsTunnel = tunnel }
    val socksPort = tunnel.start(settings)
    if (!isActive(generation)) return
    if (!ZivpnTun2Socks.init()) error("hev_jni indisponible pour le relais SlowDNS")
    ZivpnTun2Socks.start(this, fd, socksPort, 1400)
    emitLog("info", "SLOWDNS", "Relais TUN→SOCKS5 actif ; session SSH/SlowDNS mono-tunnel prête")
    markConnected(generation, "SSH/SlowDNS connecté")
  }

  private fun startCatalogTunnel(root: JSONObject, generation: Long) {
    val kind = root.optString("kind").trim()
    require(kind in setOf("zivpn", "slowdns", "hysteria", "http-payload", "ssh-tls", "v2ray-slowdns", "xray-v2ray")) { "Famille de tunnel inconnue" }
    val profiles = root.optJSONArray("profiles") ?: JSONArray()
    require(profiles.length() > 0) { "Aucun profil sélectionné pour $kind" }
    enforceRestrictions(root)
    activeMode = kind
    createNotificationChannel()
    startForeground(NOTIFICATION_ID, notification("Préparation ${familyLabel(kind)}"))
    val physicalNetwork = physicalNetwork()
    val fd = establishVpn(familyLabel(kind), physicalNetwork)
    bindToPhysicalNetwork(physicalNetwork, kind.uppercase())
    emitLog("info", "CATALOG", "${familyLabel(kind)} : ${profiles.length()} profil(s) sélectionné(s), runtime indépendant")

    val ports = mutableListOf<Int>()
    try {
      for (index in 0 until profiles.length()) {
        val profile = profiles.optJSONObject(index) ?: continue
        try {
          val port = startCatalogProfile(kind, profile)
          ports.add(port)
          emitLog("info", kind.uppercase(), "Profil ${index + 1}/${profiles.length()} prêt sur SOCKS local $port")
        } catch (error: Throwable) {
          emitLog("warning", kind.uppercase(), "Profil ${index + 1}/${profiles.length()} indisponible : ${error.message ?: "erreur"}")
        }
      }
      require(ports.isNotEmpty()) { "Aucun profil $kind n’a démarré" }
      val shouldBalance = root.optJSONObject("balancer")?.optBoolean("enabled", false) == true && ports.size > 1
      val useZivpnLocalRelay = kind == "zivpn"
      val targetPort = if (shouldBalance || useZivpnLocalRelay) {
        SocksProfileBalancer(ports) { level, component, message -> emitLog(level, component, message) }.also { balancer ->
          familyBalancer = balancer
        }.start()
      } else ports.first()
      if (!ZivpnTun2Socks.init()) error("hev_jni indisponible pour le relais ${familyLabel(kind)}")
      val relayMtu = if (useZivpnLocalRelay) ZIVPN_TUN_MTU else DEFAULT_TUN_MTU
      ZivpnTun2Socks.start(this, fd, targetPort, relayMtu)
      val relayMode = when {
        shouldBalance -> "balancier multi-profils actif"
        useZivpnLocalRelay -> "relais local direct ZIVPN actif"
        else -> "relais direct actif"
      }
      emitLog("info", "CATALOG", "TUN→SOCKS5 actif sur $targetPort ; $relayMode ; MTU=$relayMtu")
      markConnected(generation, "${familyLabel(kind)} connecté")
    } catch (error: Throwable) {
      releaseFamilyResources()
      throw error
    }
  }

  private fun enforceRestrictions(root: JSONObject) {
    val restrictions = root.optJSONObject("restrictions") ?: return
    val expiry = restrictions.optString("expiresAt").trim()
    if (expiry.isNotBlank()) {
      val format = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false }
      val expiryDate = try { format.parse(expiry) } catch (_: Throwable) { null }
      require(expiryDate != null && !java.util.Date().after(expiryDate)) { "Configuration expirée le $expiry" }
    }
    if (restrictions.optBoolean("blockRootedDevice", false)) require(!isDeviceRooted()) { "Appareil rooté bloqué par cette configuration" }
    if (restrictions.optBoolean("bindDeviceId", false)) {
      val allowed = jsonStringSet(restrictions.optJSONArray("allowedHardwareIds"))
      require(allowed.isNotEmpty()) { "Aucun Hardware ID autorisé dans cette configuration" }
      require(deviceHardwareId(this) in allowed) { "Hardware ID non autorisé pour cette configuration" }
    }
    if (restrictions.optBoolean("lockMobileOperator", false)) {
      val allowed = jsonStringSet(restrictions.optJSONArray("allowedMobileOperators"))
      require(allowed.isNotEmpty()) { "Aucun opérateur autorisé dans cette configuration" }
      val current = mobileOperator(this)
      require(current.isNotBlank()) { "Opérateur mobile indisponible" }
      require(current in allowed) { "Opérateur mobile $current non autorisé" }
    }
    if (restrictions.optBoolean("mobileDataOnly", false)) {
      val manager = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
      val capabilities = manager.activeNetwork?.let { manager.getNetworkCapabilities(it) }
      require(capabilities?.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR) == true) { "Cette configuration exige les données mobiles" }
    }
    if (restrictions.optBoolean("requireDeviceAttestation", false)) emitLog("warning", "POLITIQUE", "Attestation déclarée : un service compatible reste nécessaire pour une vérification distante.")
    if (restrictions.optBoolean("blockTorrent", false)) emitLog("warning", "POLITIQUE", "Règle anti-torrent déclarée : le filtrage complet dépend du moteur ou du serveur compatible.")
  }

  private fun jsonStringSet(values: JSONArray?): Set<String> = buildSet {
    if (values == null) return@buildSet
    for (index in 0 until values.length()) values.optString(index).trim().uppercase(Locale.US).takeIf { it.isNotBlank() }?.let { add(it) }
  }

  private fun startCatalogProfile(kind: String, profile: JSONObject): Int = when (kind) {
    "zivpn" -> startZivpnProfile(profile)
    "slowdns" -> {
      val tunnel = SlowDnsSshTunnel(this, this, { level, component, message -> emitLog(level, component, message) }, "libdnstt-slowdns.so", "slowdns-${profile.optString("id", "profile")}")
      familyStopActions.add { tunnel.stop() }
      tunnel.start(SlowDnsSshTunnel.Settings.fromProfile(profile))
    }
    "hysteria" -> {
      val tunnel = HysteriaProfileTunnel(this) { level, component, message -> emitLog(level, component, message) }
      familyStopActions.add { tunnel.stop() }
      tunnel.start(profile)
    }
    "http-payload" -> {
      val tunnel = HttpPayloadSshTunnel(this, this, { level, component, message -> emitLog(level, component, message) }, "http-payload-${profile.optString("id", "profile")}")
      familyStopActions.add { tunnel.stop() }
      tunnel.start(HttpPayloadSshTunnel.Settings.fromProfile(profile))
    }
    "ssh-tls" -> {
      val tunnel = SshTlsTunnel(this, this, { level, component, message -> emitLog(level, component, message) }, "ssh-tls-${profile.optString("id", "profile")}")
      familyStopActions.add { tunnel.stop() }
      tunnel.start(SshTlsTunnel.Settings.fromProfile(profile))
    }
    "xray-v2ray" -> {
      val tunnel = XrayProfileTunnel(this, "libxray-v2ray.so", "xray-${profile.optString("id", "profile")}") { level, component, message -> emitLog(level, component, message) }
      familyStopActions.add { tunnel.stop() }
      tunnel.start(profile)
    }
    "v2ray-slowdns" -> startDnsXrayProfile(profile, "libdnstt-v2rayslowdns.so", "libxray-v2rayslowdns.so", "v2rayslowdns")
    else -> error("Famille de tunnel inconnue")
  }

  private fun startZivpnProfile(profile: JSONObject): Int {
    val host = profile.optString("host").trim()
    val port = profile.optString("port").trim().replace(Regex("\\s+"), "")
    val password = profile.optString("password").trim()
    require(host.isNotBlank() && port.isNotBlank() && password.isNotBlank()) { "Profil UDP-ZIVPN incomplet" }
    val binary = File(applicationInfo.nativeLibraryDir, "libuz_core.so")
    require(binary.exists() && binary.length() > 0L && binary.canExecute()) { "libuz_core.so absent ou non exécutable" }
    val socksPort = freeLocalPort()
    val resolvedHost = try { InetAddress.getByName(host).hostAddress ?: host } catch (_: Throwable) { host }
    val safeId = profile.optString("id", "profile").replace(Regex("[^A-Za-z0-9_-]"), "_").take(64)
    val config = File(cacheDir, "zivpn_${safeId}.json")
    config.writeText(buildUzConfig(resolvedHost, port, password, ZIVPN_FIXED_OBFS, socksPort))
    val process = ProcessBuilder(binary.absolutePath, "-s", ZIVPN_FIXED_OBFS, "--config", config.readText()).directory(filesDir).apply {
      environment()["LD_LIBRARY_PATH"] = applicationInfo.nativeLibraryDir
      environment()["HOME"] = cacheDir.absolutePath
      environment()["TMPDIR"] = cacheDir.absolutePath
      redirectErrorStream(true)
    }.start()
    familyStopActions.add {
      try { process.destroy() } catch (_: Throwable) {}
      try { process.waitFor(700, TimeUnit.MILLISECONDS) } catch (_: Throwable) {}
      if (process.isAlive) try { process.destroyForcibly() } catch (_: Throwable) {}
      try { config.delete() } catch (_: Throwable) {}
    }
    thread(isDaemon = true, name = "zivpn-$safeId-log") { readNativeLogs(process, "ZIVPN") }
    if (!waitForLocalPort(process, socksPort, 4_500L)) error("Le SOCKS5 UDP-ZIVPN n’est pas apparu pour le profil $safeId")
    return socksPort
  }

  private fun startDnsXrayProfile(profile: JSONObject, dnsttBinary: String, xrayBinary: String, label: String): Int {
    val dnstt = DnsttLocalClient(this, dnsttBinary, "$label-${profile.optString("id", "profile")}") { level, component, message -> emitLog(level, component, message) }
    val dnsttPort = dnstt.start(profile.optString("dnsServer").trim(), profile.optString("dnsPort", "53").toIntOrNull() ?: 53, profile.optString("nameserver").trim(), profile.optString("publicKey").trim())
    val xray = XrayProfileTunnel(this, xrayBinary, "$label-${profile.optString("id", "profile")}") { level, component, message -> emitLog(level, component, message) }
    familyStopActions.add { xray.stop(); dnstt.stop() }
    return xray.start(profile, "127.0.0.1", dnsttPort)
  }

  private fun releaseFamilyResources() {
    try { familyBalancer?.close() } catch (_: Throwable) {}
    familyBalancer = null
    val actions = familyStopActions.toList()
    familyStopActions.clear()
    actions.asReversed().forEach { action -> try { action() } catch (_: Throwable) {} }
  }

  private fun freeLocalPort(): Int = java.net.ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { it.localPort }
  private fun familyLabel(kind: String): String = when (kind) {
    "zivpn" -> "UDP-ZIVPN"
    "slowdns" -> "SSH/SlowDNS"
    "hysteria" -> "Hysteria UDP"
    "http-payload" -> "HTTP Proxy+Payload"
    "ssh-tls" -> "SSH SSL/TLS"
    "v2ray-slowdns" -> "V2Ray+SlowDNS"
    else -> "Xray/V2Ray"
  }

  private fun physicalNetwork() = (getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager).activeNetwork
    ?: error("Aucun réseau physique disponible")

  private fun establishVpn(session: String, network: android.net.Network): Int {
    val isZivpn = session == "UDP-ZIVPN"
    val mtu = if (isZivpn) ZIVPN_TUN_MTU else DEFAULT_TUN_MTU
    val builder = Builder()
      .setSession(session)
      .setMtu(mtu)
      .addAddress("10.0.0.2", 24)
      .addRoute("0.0.0.0", 0)
      .addDnsServer("8.8.8.8")
      .setUnderlyingNetworks(arrayOf(network))
    if (isZivpn) {
      // Correspond au parcours multi-profil de Zamois-tun : le trafic du moteur reste
      // explicitement sur le réseau physique, sans modifier le serveur ou libuz_core.
      builder.allowBypass()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) builder.setMetered(false)
    }
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

  private fun buildUzConfig(host: String, port: String, password: String, obfs: String, socksPort: Int = 7778): String =
    """{"server":"${json(host + ":" + port)}","obfs":"${json(obfs)}","auth":"${json(password)}","socks5":{"listen":"127.0.0.1:$socksPort"},"insecure":true,"recvwindowconn":65536,"recvwindow":262144,"disable_mtu_discovery":true,"down_mbps":50,"up_mbps":10}"""

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
    emitLog("error", activeMode.uppercase(), "Échec du tunnel : $message")
    stopVpn(STATUS_ERROR)
  }

  private fun emitLog(level: String, component: String, message: String) {
    PersistentDiagnosticLog.record(this, level, component, message)
    logSink?.invoke(level, component, message)
  }

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
      try { releaseFamilyResources() } catch (_: Throwable) {}
      try { slowDns?.stop() } catch (_: Throwable) {}
      try { zivpn?.waitFor(700, TimeUnit.MILLISECONDS) } catch (_: Throwable) {}
      try { if (zivpn?.isAlive == true) zivpn.destroyForcibly() } catch (_: Throwable) {}
      File(cacheDir, "zivpn-client.json").delete()
      emitLog("info", activeMode.uppercase(), "Arrêt complet du tunnel")
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
      .setSmallIcon(R.drawable.ic_kighmu_vpn_notification)
      .setColor(0xFF246BFD.toInt())
      .setContentTitle("KIGHMU VPN")
      .setContentText(text)
      .setOngoing(true)
      .setContentIntent(pending)
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Arrêter", stopPending)
      .build()
  }

  override fun onRevoke() { emitLog("warning", "SERVICE", "Autorisation VPN révoquée par Android"); stopVpn(); super.onRevoke() }
  override fun onDestroy() { emitLog("info", "SERVICE", "Service VPN détruit"); stopVpn(); super.onDestroy() }
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
    const val ZIVPN_FIXED_OBFS = "hu``hqb`c"
    const val DEFAULT_TUN_MTU = 1400
    const val ZIVPN_TUN_MTU = 1500

    fun deviceSecurityInfo(context: Context): Map<String, Any> = mapOf(
      "hardwareId" to deviceHardwareId(context),
      "mobileOperator" to mobileOperator(context),
      "rooted" to isDeviceRooted(),
    )

    private fun deviceHardwareId(context: Context): String {
      val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID).orEmpty().ifBlank { "${Build.FINGERPRINT}:${context.packageName}" }
      val digest = MessageDigest.getInstance("MD5").digest(androidId.toByteArray(Charsets.UTF_8))
      return digest.joinToString("") { "%02X".format(Locale.US, it) }
    }

    private fun mobileOperator(context: Context): String {
      val manager = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
      return try { manager?.simOperator.orEmpty().trim().uppercase(Locale.US) } catch (_: SecurityException) { "" }
    }

    private fun isDeviceRooted(): Boolean = Build.TAGS?.contains("test-keys") == true || listOf("/system/bin/su", "/system/xbin/su", "/sbin/su", "/system/app/Superuser.apk").any { File(it).exists() }
    @Volatile var currentStatus = STATUS_DISCONNECTED
    @Volatile var logSink: ((String, String, String) -> Unit)? = null
    @Volatile var stateSink: ((String) -> Unit)? = null
  }
}
