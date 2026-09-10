package expo.modules.kighmuvpnnative

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.URL
import kotlin.concurrent.thread

class KighmuVpnService : VpnService() {
  private val lifecycleLock = Any()
  private var tunFd = -1
  private var tunnels: List<LocalTunnel> = emptyList()
  private var balancer: LocalSocksBalancer? = null
  private var zivpnModernBalancer: ZivpnModernBalancer? = null
  private var attemptGeneration = 0L
  @Volatile private var runtimeSettings = VpnRuntimeSettings()
  @Volatile private var activeProfilesJson = ""
  @Volatile private var primaryProfileName = ""
  private var vpnWakeLock: PowerManager.WakeLock? = null
  @Volatile private var restartAttempts = 0
  @Volatile private var zivpnHeartbeatRunning = false
  private var zivpnHeartbeatThread: Thread? = null

  override fun onCreate() {
    super.onCreate()
    // Foreground immédiat pour survivre Doze même avec optimisation activée (comme autres VPN)
    try {
      createNotificationChannel()
      startForeground(NOTIFICATION_ID, notification("Préparation du tunnel…"))
    } catch (_: Throwable) {}
    try {
      val pm = getSystemService(POWER_SERVICE) as PowerManager
      vpnWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:VPN").apply {
        setReferenceCounted(false)
        acquire()
      }
    } catch (_: Throwable) {}
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        clearSavedPayload()
        stopVpn()
      }
      ACTION_START -> {
        val payload = intent.getStringExtra(EXTRA_PROFILES_JSON).orEmpty().ifBlank { readSavedPayload() }
        val generation = beginStart() ?: return START_REDELIVER_INTENT
        restartAttempts = 0
        savePayload(payload)
        thread(isDaemon = true, name = "picko-vpn-start") { startTunnelsInternal(payload, generation) }
      }
      else -> {
        val payload = readSavedPayload()
        if (payload.isBlank()) return START_NOT_STICKY
        val generation = beginStart() ?: return START_REDELIVER_INTENT
        thread(isDaemon = true, name = "picko-vpn-start") { startTunnelsInternal(payload, generation) }
      }
    }
    return START_REDELIVER_INTENT
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    try { FileLogger.logDetail(this, "ZIVPN-DETAIL", "ON_TASK_REMOVED status=$currentStatus gen=$attemptGeneration") } catch (_: Throwable) {}
    super.onTaskRemoved(rootIntent)
    // Swipe récents ne doit pas tuer le VPN (comme autres VPN avec optimisation activée)
  }

  private fun statePrefs() = getSharedPreferences("kighmu_vpn_state", Context.MODE_PRIVATE)
  private fun readSavedPayload(): String {
    return try {
      val enc = statePrefs().getString(KEY_LAST_PAYLOAD, null).orEmpty()
      if (enc.isBlank()) ""
      else try { CryptoPrefs.decrypt(enc) } catch (_: Throwable) { enc }
    } catch (_: Throwable) { "" }
  }
  private fun savePayload(payload: String) {
    if (payload.isBlank()) return
    try {
      val enc = try { CryptoPrefs.encrypt(payload) } catch (_: Throwable) { payload }
      statePrefs().edit().putString(KEY_LAST_PAYLOAD, enc).apply()
    } catch (_: Throwable) {}
  }
  private fun clearSavedPayload() {
    try { statePrefs().edit().remove(KEY_LAST_PAYLOAD).apply() } catch (_: Throwable) {}
    try { getSharedPreferences("kighmu_vpn_state_enc", Context.MODE_PRIVATE).edit().clear().apply() } catch (_: Throwable) {}
  }

  private fun beginStart(): Long? = synchronized(lifecycleLock) {
    if (currentStatus == STATUS_CONNECTED || currentStatus == STATUS_CONNECTING) return@synchronized null
    attemptGeneration += 1
    currentStatus = STATUS_CONNECTING
    stateSink?.invoke(STATUS_CONNECTING)
    attemptGeneration
  }

  private fun isActive(generation: Long): Boolean = synchronized(lifecycleLock) {
    generation == attemptGeneration && (currentStatus == STATUS_CONNECTING || currentStatus == STATUS_CONNECTED)
  }

  private fun startTunnelsInternal(payloadJson: String, generation: Long) {
    try {
      FileLogger.init(this)
      // Header détaillé pour Download/kighmu.txt - bug ZIVPN trafic bloqué après quelques minutes
      try {
        val dlPath = FileLogger.getDownloadPath(this)
        val privPath = FileLogger.getPrivatePath(this)
        FileLogger.logDetail(this, "ZIVPN-DETAIL", "=== KIGHMU ZIVPN TRACE START gen=$generation ===")
        FileLogger.logDetail(this, "ZIVPN-DETAIL", "PAYLOAD len=${payloadJson.length} take=${payloadJson.take(1200)}")
        FileLogger.logDetail(this, "ZIVPN-DETAIL", "DOWNLOAD_PATH=$dlPath PRIV_PATH=$privPath SDK=${Build.VERSION.SDK_INT} MODEL=${Build.MODEL} MANU=${Build.MANUFACTURER} BRAND=${Build.BRAND}")
        FileLogger.logDetail(this, "ZIVPN-DETAIL", "POWER idleMode=${(getSystemService(POWER_SERVICE) as PowerManager).isDeviceIdleMode} interactive=${(getSystemService(POWER_SERVICE) as PowerManager).isInteractive} batteryOpt=${try { (getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName) } catch (_: Throwable) { "unknown" }}")
        // Réseau détaillé
        try {
          val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
          val nets = cm.allNetworks.joinToString("|") { net ->
            val caps = cm.getNetworkCapabilities(net)
            "net=${net} caps=${caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)} vpn=${caps?.hasTransport(NetworkCapabilities.TRANSPORT_VPN)} wifi=${caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)} cell=${caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)}"
          }
          FileLogger.logDetail(this, "ZIVPN-DETAIL", "NETWORKS $nets activeNet=${cm.activeNetwork}")
        } catch (e: Throwable) { FileLogger.logDetail(this, "ZIVPN-DETAIL", "NETWORKS_ERROR ${e.message}") }
      } catch (_: Throwable) {}
      FileLogger.log(this, "SERVICE", "=== startTunnelsInternal generation=$generation payloadLen=${payloadJson.length} payload=${payloadJson.take(800)} ===")
      FileLogger.log(this, "SERVICE", "Download log: ${FileLogger.getPath(this)}")
      FileLogger.logDetail(this, "ZIVPN-DETAIL", "GENERATION_START gen=$generation payloadLen=${payloadJson.length}")
      val payload = JSONObject(payloadJson)
      runtimeSettings = VpnRuntimeSettings.parse(payload)
      activeProfilesJson = payloadJson
      savePayload(payloadJson)
      FileLogger.log(this, "SERVICE", "runtimeSettings mtu=${runtimeSettings.mtu} dns=${runtimeSettings.dnsServers()} httpPing=${runtimeSettings.httpPingEnabled}")
      val profiles = TunnelProfile.parseMany(payloadJson)
      primaryProfileName = profiles.firstOrNull()?.name.orEmpty()
      if (profiles.isEmpty()) error("Aucun profil de tunnel utilisable n’a été reçu")
      profiles.forEach { profile -> profile.validate()?.let { error("${profile.name} : $it") } }

      createNotificationChannel()
      startForeground(NOTIFICATION_ID, notification("Préparation de ${profiles.size} tunnel(s)"))
      val connectivity = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
      val physicalNetwork = connectivity.activeNetwork ?: error("Aucun réseau physique disponible")
      if (!connectivity.bindProcessToNetwork(physicalNetwork)) error("Impossible de lier les tunnels au réseau physique")

      val established = Builder()
        .setSession("KIGHMU multi-tunnel")
        .setMtu(runtimeSettings.mtu)
        .addAddress("10.0.0.2", 24)
        .addRoute("0.0.0.0", 0)
        .setUnderlyingNetworks(arrayOf(physicalNetwork))
        .apply {
          runtimeSettings.dnsServers().forEach { addDnsServer(it) }
          addDisallowedApplication(packageName)
        }
        .establish() ?: error("Android n’a pas fourni l’interface VPN")
      val fd = established.detachFd()
      synchronized(lifecycleLock) {
        if (!isActive(generation)) {
          ParcelFileDescriptor.adoptFd(fd).close()
          return
        }
        tunFd = fd
      }

      val started = mutableListOf<LocalTunnel>()
      profiles.forEach { profile ->
        if (!isActive(generation)) return@forEach
        try {
          val tunnel: LocalTunnel = when (profile.method) {
            "zivpn-udp" -> ZivpnTunnel(this, profile, ::emitLog, runtimeSettings.dnsServers())
            "ssh-slowdns" -> SshSlowDnsTunnel(this, profile, ::emitLog)
            "hysteria-udp" -> HysteriaTunnel(this, profile, ::emitLog, runtimeSettings.dnsServers())
            "xray" -> XrayTunnel(this, profile, ::emitLog, runtimeSettings.dnsServers())
            "v2ray-dns" -> V2RayDnsTunnel(this, profile, ::emitLog, runtimeSettings.dnsServers())
            "http-proxy-payload" -> HttpProxyPayloadTunnel(this, profile, ::emitLog, runtimeSettings.dnsServers())
            "ssh-ssl-tls" -> SshSslTlsTunnel(this, profile, ::emitLog, runtimeSettings.dnsServers())
            else -> error("Méthode non prise en charge")
          }
          emitLog("connection", "TUNNEL", "Démarrage de ${profile.name} (${profile.method})")
          try { FileLogger.log(this, "TUNNEL", "start ${profile.name} method=${profile.method} id=${profile.id}") } catch (_: Throwable) {}
          tunnel.start()
          started.add(tunnel)
        } catch (error: Throwable) {
          try { FileLogger.log(this, "TUNNEL", "FAILED ${profile.name}: ${error.message} stack=${error.stackTrace.take(3).joinToString()}") } catch (_: Throwable) {}
          emitLog("warning", "TUNNEL", "${profile.name} indisponible : ${error.message ?: "erreur inconnue"}")
        }
      }
      if (started.isEmpty()) error("Aucun tunnel n’a pu établir un proxy SOCKS local")
      if (!isActive(generation)) {
        started.forEach { it.stop() }
        return
      }

      val isZivpnAll = started.all { it is ZivpnTunnel }
      val isZivpnOnly = isZivpnAll && started.size == 1
      val activeBalancerPort: Int
      if (isZivpnAll) {
        // Balancier moderne dédié ZIVPN : sonde SOCKS5 CONNECT réelle (1.1.1.1:80), exclusion des tunnels UDP morts
        val modern = ZivpnModernBalancer(started.map { it.socksPort }, ::emitLog)
        modern.start()
        zivpnModernBalancer = modern
        activeBalancerPort = modern.port
        synchronized(lifecycleLock) {
          if (!isActive(generation)) {
            modern.close()
            zivpnModernBalancer = null
            started.forEach { it.stop() }
            return
          }
          tunnels = started.toList()
          currentBalancerPort = activeBalancerPort
          restartAttempts = 0
          currentStatus = STATUS_CONNECTED
          stateSink?.invoke(STATUS_CONNECTED)
        }
        if (isZivpnOnly) {
          if (!ZivpnDirectForwarder.start(this, fd, activeBalancerPort)) {
            if (!ZivpnTun2Socks.init()) error("Le relais natif TUN→SOCKS est indisponible")
            ZivpnTun2Socks.startForZivpn(this, fd, activeBalancerPort, runtimeSettings.mtu)
          }
        } else {
          if (!ZivpnTun2Socks.init()) error("Le relais natif TUN→SOCKS est indisponible")
          ZivpnTun2Socks.startForZivpn(this, fd, activeBalancerPort, runtimeSettings.mtu)
        }
      } else {
        val localBalancer = LocalSocksBalancer(::emitLog)
        localBalancer.start(started.map { it.socksPort })
        activeBalancerPort = localBalancer.port
        synchronized(lifecycleLock) {
          if (!isActive(generation)) {
            localBalancer.stop()
            started.forEach { it.stop() }
            return
          }
          tunnels = started.toList()
          balancer = localBalancer
          currentBalancerPort = activeBalancerPort
          restartAttempts = 0
          currentStatus = STATUS_CONNECTED
          stateSink?.invoke(STATUS_CONNECTED)
        }
        if (!ZivpnTun2Socks.init()) error("Le relais natif TUN→SOCKS est indisponible")
        ZivpnTun2Socks.start(this, fd, activeBalancerPort, runtimeSettings.mtu)
      }
      if (runtimeSettings.wakeLockEnabled) acquireWakeLock()
      emitLog("connection", "BALANCER", "VPN connecté avec ${started.size} tunnel(s) disponibles ; MTU ${runtimeSettings.mtu}")
      // Trace détaillée ZIVPN dans Download/kighmu.txt pour diagnostiquer blocage trafic
      FileLogger.logDetail(this, "ZIVPN-DETAIL", "VPN_CONNECTED gen=$generation tunnels=${started.map { "${it.label}:${it.socksPort}:${it::class.simpleName}" }.joinToString("|")} balancerPort=$activeBalancerPort mtu=${runtimeSettings.mtu} dns=${runtimeSettings.dnsServers()} zivpnOnly=$isZivpnOnly zivpnAll=$isZivpnAll")
      FileLogger.logDetail(this, "ZIVPN-DETAIL", "BALANCER_ACTIVE type=${if (isZivpnAll) "ZivpnModernBalancer" else "LocalSocksBalancer"} port=$activeBalancerPort")
      // Heartbeat radical ZIVPN toutes les 5s pour bug silencieux (clé disparaît sans log)
      if (isZivpnAll) startZivpnHeartbeat(generation, started.filterIsInstance<ZivpnTunnel>())
      startForeground(NOTIFICATION_ID, notification("Connecté : ${started.size} tunnel(s) équilibrés"))
      monitorTunnels(generation)
    } catch (error: Throwable) {
      // Coupure réseau brève : rester actif et attendre le retour du réseau (comportement VPN pro)
      if (isActive(generation) && isNetworkUnavailable(error)) {
        restartVpn(generation, error.message ?: "Réseau indisponible, en attente")
      } else {
        fail(generation, error.message ?: error::class.java.simpleName)
      }
    }
  }

  private fun monitorTunnels(generation: Long) {
    thread(isDaemon = true, name = "picko-vpn-health") {
      var lastPorts = emptyList<Int>()
      var recoveryLogged = false
      var pingFailures = 0
      var emptyStreak = 0
      val strikes = HashMap<Int, Int>()
      var nextPingAt = System.currentTimeMillis() + runtimeSettings.httpPingIntervalMs
      var iteration = 0L
      while (isActive(generation)) {
        Thread.sleep(15_000)
        iteration++
        // Trace watchdog détaillée pour debug ZIVPN (Download/kighmu.txt) - bloque trafic après minutes
        try {
          val pm = getSystemService(POWER_SERVICE) as PowerManager
          val tunAlive = synchronized(lifecycleLock) { tunFd >= 0 }
          val balancerPort = synchronized(lifecycleLock) { currentBalancerPort }
          val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
          val netInfo = try {
            val nets = cm.allNetworks.take(4).joinToString(";") { n -> "${n}:${cm.getNetworkCapabilities(n)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)}" }
            "nets=$nets active=${cm.activeNetwork}"
          } catch (_: Throwable) { "netError" }
          FileLogger.logDetail(this@KighmuVpnService, "ZIVPN-DETAIL", "WATCHDOG iter=$iteration gen=$generation tunFd=$tunFd tunAlive=$tunAlive balancerPort=$balancerPort idleMode=${pm.isDeviceIdleMode} interactive=${pm.isInteractive} $netInfo status=$currentStatus")
        } catch (_: Throwable) {}
        // En Doze, contrôle allégé : on vérifie seulement que le TUN est toujours valide,
        // sinon on relance. On évite de redémarrer sur un simple timeout réseau dû à Doze.
        try {
          val pm = getSystemService(POWER_SERVICE) as PowerManager
          if (pm.isDeviceIdleMode) {
            val fdAlive = synchronized(lifecycleLock) { tunFd >= 0 }
            if (!fdAlive) {
              FileLogger.logDetail(this@KighmuVpnService, "ZIVPN-DETAIL", "WATCHDOG_DOZE_TUN_CLOSED gen=$generation")
              emitLog("warning", "MONITOR", "TUN fermé pendant Doze — reconnexion")
              restartVpn(generation, "TUN fermé en Doze")
              return@thread
            }
            FileLogger.logDetail(this@KighmuVpnService, "ZIVPN-DETAIL", "WATCHDOG_DOZE_ALIVE gen=$generation tunFd=$tunFd")
            Thread.sleep(30_000)
            continue
          }
        } catch (_: Throwable) {}
        val snapshot = synchronized(lifecycleLock) { tunnels.toList() }
        // Hystérésis : un tunnel n'est retiré qu'après DEUX sondes consécutives
        // négatives (le SOCKS local peut être brièvement occupé par le trafic).
        snapshot.forEach { tunnel ->
          val healthyBefore = strikes[tunnel.socksPort] ?: 0
          val isHealthy = tunnel.isHealthy()
          strikes[tunnel.socksPort] = if (isHealthy) 0 else healthyBefore + 1
          FileLogger.logDetail(this@KighmuVpnService, "ZIVPN-DETAIL", "HEALTH_CHECK tunnel=${tunnel.label} port=${tunnel.socksPort} healthy=$isHealthy strikesBefore=$healthyBefore strikesAfter=${strikes[tunnel.socksPort]} recovering=${tunnel.isRecovering()}")
        }
        val healthy = snapshot.filter { (strikes[it.socksPort] ?: 0) < 3 }
        val recovering = snapshot.any { it.isRecovering() }
        val ports = healthy.map { it.socksPort }
        FileLogger.logDetail(this@KighmuVpnService, "ZIVPN-DETAIL", "HEALTH_SUMMARY gen=$generation total=${snapshot.size} healthy=${healthy.size} recovering=$recovering ports=${ports.joinToString(",")} strikes=$strikes")
        if (ports != lastPorts) {
          balancer?.updatePorts(ports)
          // ZIVPN moderne gère sa propre santé en interne (sonde CONNECT), pas besoin d'update externe
          emitLog("info", "BALANCER", "${ports.size} tunnel(s) sain(s) après contrôle de santé")
          FileLogger.logDetail(this@KighmuVpnService, "ZIVPN-DETAIL", "BALANCER_UPDATE old=${lastPorts.joinToString(",")} new=${ports.joinToString(",")}")
          lastPorts = ports
        }
        if (ports.isEmpty()) {
          emptyStreak += 1
          if (recovering) {
            if (!recoveryLogged) {
              emitLog("warning", "TUNNEL", "Tunnel temporairement indisponible ; reconnexion locale en cours")
              recoveryLogged = true
            }
          } else if (emptyStreak < 4) {
            // Grâce de 60s (4×15s) avant de décider — comme Forot qui ne monitor pas
          } else if (runtimeSettings.alwaysReconnect) {
            restartVpn(generation, "Tous les tunnels sont indisponibles")
            return@thread
          } else {
            fail(generation, "Tous les tunnels sont indisponibles")
            return@thread
          }
        } else {
          emptyStreak = 0
          recoveryLogged = false
        }
        val now = System.currentTimeMillis()
        // Vérification HTTP active uniquement si l'utilisateur a activé pingEnabled ET httpPingEnabled
        if (runtimeSettings.httpPingEnabled && runtimeSettings.pingEnabled && now >= nextPingAt && ports.isNotEmpty()) {
          nextPingAt = now + runtimeSettings.httpPingIntervalMs
          val result = httpPing()
          if (result.success) {
            if (pingFailures > 0) emitLog("connection", "PING", "Vérification HTTP rétablie via le balancier SOCKS")
            pingFailures = 0
            // Émet un log ping avec latence (UI affichera couleur vert/rouge selon seuil)
            val ms = result.latencyMs
            val level = when {
              ms <= 0L -> "warning"
              ms < 300L -> "connection"
              ms < 800L -> "info"
              else -> "warning"
            }
            emitLog(level, "PING", "Ping ${result.code} OK (${ms}ms)")
          } else {
            pingFailures += 1
            emitLog("warning", "PING", "Échec HTTP $pingFailures/${runtimeSettings.reconnectAfterFailures.coerceAtLeast(1)}")
            // Plancher anti-faux-positifs : au moins 6 échecs consécutifs (~30 s)
            // avant de reconstruire le tunnel, même si le réglage utilisateur est plus bas.
            val restartThreshold = maxOf(runtimeSettings.reconnectAfterFailures, 6)
            if (runtimeSettings.reconnectAfterFailures > 0 && pingFailures >= restartThreshold) {
              if (runtimeSettings.alwaysReconnect) {
                restartVpn(generation, "Vérification HTTP en échec à $pingFailures reprises")
              } else {
                fail(generation, "Vérification HTTP en échec à $pingFailures reprises")
              }
              return@thread
            }
          }
        }
      }
    }
  }

  // Heartbeat radical ZIVPN toutes les 5s pour capturer bug silencieux (clé disparaît)
  private fun startZivpnHeartbeat(generation: Long, zivpnTunnels: List<ZivpnTunnel>) {
    if (zivpnHeartbeatRunning) return
    zivpnHeartbeatRunning = true
    zivpnHeartbeatThread = thread(isDaemon = true, name = "zivpn-heartbeat") {
      var hb = 0L
      FileLogger.logDetail(this@KighmuVpnService, "ZIVPN-DETAIL", "HEARTBEAT_START gen=$generation n=${zivpnTunnels.size}")
      while (zivpnHeartbeatRunning && isActive(generation)) {
        try { Thread.sleep(5000) } catch (_: InterruptedException) { break }
        if (!zivpnHeartbeatRunning || !isActive(generation)) break
        hb++
        try {
          val tun = synchronized(lifecycleLock) { tunFd }
          val balPort = synchronized(lifecycleLock) { currentBalancerPort }
          val pm = getSystemService(POWER_SERVICE) as PowerManager
          val runtime = Runtime.getRuntime()
          val memFree = runtime.freeMemory() / 1024
          val memTotal = runtime.totalMemory() / 1024
          val memMax = runtime.maxMemory() / 1024
          val uptime = android.os.SystemClock.elapsedRealtime()
          // GC préventif si mémoire critique (<1M free) pour éviter OOM sur itel P662L 18M heap
          if (memFree < 1024) {
            try { System.gc(); FileLogger.logDetail(this@KighmuVpnService, "ZIVPN-HEARTBEAT", "hb=$hb GC triggered memFree=${memFree}k") } catch (_: Throwable) {}
          }
          // Détail chaque tunnel ZIVPN
          val tunnelDetails = zivpnTunnels.joinToString(" | ") { t ->
            "port=${t.socksPort} healthy=${try { t.isHealthy() } catch (_: Throwable) { "err" }} recovering=${try { t.isRecovering() } catch (_: Throwable) { "err" }}"
          }
          FileLogger.logDetail(this@KighmuVpnService, "ZIVPN-HEARTBEAT", "hb=$hb gen=$generation tunFd=$tun tunAlive=${tun>=0} balPort=$balPort tunnels=[$tunnelDetails] memFree=${memFree}k total=${memTotal}k max=${memMax}k uptime=${uptime}ms idle=${pm.isDeviceIdleMode} interactive=${pm.isInteractive} status=$currentStatus")
          // Ping silencieux uniquement si activé dans les settings (évite trafic et allocations inutiles)
          if (runtimeSettings.httpPingEnabled && runtimeSettings.pingEnabled) {
            try {
              val ping = httpPing()
              FileLogger.logDetail(this@KighmuVpnService, "ZIVPN-HEARTBEAT", "hb=$hb ping success=${ping.success} code=${ping.code} ms=${ping.latencyMs}")
            } catch (e: Throwable) {
              FileLogger.logDetail(this@KighmuVpnService, "ZIVPN-HEARTBEAT", "hb=$hb pingError ${e.message}")
            }
          } else if (hb % 3 == 0L) {
            FileLogger.logDetail(this@KighmuVpnService, "ZIVPN-HEARTBEAT", "hb=$hb ping disabled (httpPing=${runtimeSettings.httpPingEnabled} ping=${runtimeSettings.pingEnabled})")
          }
          // Force flush Download file existence
          if (hb % 6 == 0L) { // toutes les 30s, revérifie fichier
            try { FileLogger.ensureDownloadFile(this@KighmuVpnService) } catch (_: Throwable) {}
          }
        } catch (e: Throwable) {
          try { FileLogger.logDetail(this@KighmuVpnService, "ZIVPN-HEARTBEAT", "hb=$hb ERROR ${e.message} ${e::class.simpleName}") } catch (_: Throwable) {}
        }
      }
      FileLogger.logDetail(this@KighmuVpnService, "ZIVPN-DETAIL", "HEARTBEAT_STOP gen=$generation hb=$hb")
    }
  }

  private fun stopZivpnHeartbeat() {
    zivpnHeartbeatRunning = false
    try { zivpnHeartbeatThread?.interrupt() } catch (_: Throwable) {}
    zivpnHeartbeatThread = null
  }

  private data class PingResult(val success: Boolean, val code: Int, val latencyMs: Long)

  private fun httpPing(): PingResult = try {
    val socksPort = synchronized(lifecycleLock) { zivpnModernBalancer?.port ?: balancer?.port } ?: run {
      FileLogger.logDetail(this, "ZIVPN-DETAIL", "PING_NO_BALANCER")
      return PingResult(false, 0, 0L)
    }
    val startNs = System.nanoTime()
    val proxy = Proxy(Proxy.Type.SOCKS, InetSocketAddress("127.0.0.1", socksPort))
    val connection = URL(runtimeSettings.httpPingUrl).openConnection(proxy) as HttpURLConnection
    connection.connectTimeout = runtimeSettings.httpPingTimeoutMs
    connection.readTimeout = runtimeSettings.httpPingTimeoutMs
    connection.instanceFollowRedirects = true
    connection.setRequestProperty("Connection", "close")
    val code = connection.responseCode
    connection.disconnect()
    val ms = (System.nanoTime() - startNs) / 1_000_000L
    FileLogger.logDetail(this, "ZIVPN-DETAIL", "PING_OK code=$code ms=$ms port=$socksPort url=${runtimeSettings.httpPingUrl}")
    PingResult(code in 200..399, code, ms)
  } catch (error: Throwable) {
    FileLogger.logDetail(this, "ZIVPN-DETAIL", "PING_FAIL err=${error.message} cause=${error::class.simpleName}")
    emitLog("info", "PING", "Vérification HTTP indisponible : ${error.message ?: "erreur réseau"}")
    PingResult(false, 0, 0L)
  }

  private fun restartVpn(generation: Long, reason: String) {
    if (!isActive(generation)) return
    val payload = activeProfilesJson
    if (payload.isBlank()) {
      fail(generation, reason)
      return
    }
    restartAttempts += 1
    // Backoff exponentiel : 1 s, 2 s, 4 s, 8 s, 16 s puis palier à 30 s.
    val delay = minOf(30_000L, 1_000L shl (restartAttempts - 1).coerceAtMost(5))
    emitLog("warning", "VPN", "$reason ; reconnexion automatique dans ${delay / 1000} s (essai $restartAttempts)")
    val nextGeneration = softStopKeepForeground() ?: return
    thread(isDaemon = true, name = "picko-vpn-restart") {
      try { Thread.sleep(delay) } catch (_: InterruptedException) { return@thread }
      try {
        startTunnelsInternal(payload, nextGeneration)
      } catch (error: Throwable) {
        // Réseau physique absent (données mobiles coupées, mode avion, etc.) :
        // on NE ferme PAS le VPN, on re-boucle avec backoff jusqu'au retour du
        // réseau ou jusqu'à un arrêt manuel de l'utilisateur. Sinon l'app se
        // fermait au premier essai de reconnexion sans réseau.
        if (isActive(nextGeneration) && isNetworkUnavailable(error)) {
          restartVpn(nextGeneration, "Réseau indisponible, en attente de sa remise en service")
        } else {
          fail(nextGeneration, error.message ?: "reconnexion impossible")
        }
      }
    }
  }

  /** Vrai si l'échec vient de l'absence de réseau physique (données coupées) — vérifie le réseau, pas seulement le message. */
  private fun isNetworkUnavailable(error: Throwable): Boolean {
    // Ne pas se baser uniquement sur le message (faux-positif "aucun tunnel n'a pu établir" même avec réseau OK)
    return try {
      val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
      // Le VPN lui-même apparaît comme activeNetwork ; on cherche un réseau physique (non-VPN) avec INTERNET
      val hasPhysicalInternet = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        cm.allNetworks.any { net ->
          val caps = cm.getNetworkCapabilities(net) ?: return@any false
          caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && !caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
        }
      } else {
        @Suppress("DEPRECATION") cm.activeNetworkInfo?.isConnected == true
      }
      !hasPhysicalInternet
    } catch (_: Throwable) { false }
  }

  /**
   * Ferme UNIQUEMENT le plan de données (tun, tunnels, balancier, wake lock)
   * en conservant le service au premier plan : la clé VPN reste affichée
   * pendant la reconnexion et aucun démarrage foreground n'est demandé
   * depuis l'arrière-plan (interdit sur Android 12+ — cause de l'arrêt
   * définitif observé après quelques minutes).
   */
  private fun softStopKeepForeground(): Long? {
    // Stop heartbeat avant softStop pour éviter logs fantômes
    try { stopZivpnHeartbeat() } catch (_: Throwable) {}
    return synchronized(lifecycleLock) {
    if (currentStatus != STATUS_CONNECTED && currentStatus != STATUS_CONNECTING) return@synchronized null
    attemptGeneration += 1
    // Ferme l'ancien TUN pour éviter une fuite de fd et une désynchronisation
    // clé/notification (clé disparue mais notif orpheline). La clé disparaît
    // brièvement puis revient avec le nouveau Builder.
    val oldFd = tunFd
    tunFd = -1
    if (oldFd >= 0) try { ParcelFileDescriptor.adoptFd(oldFd).close() } catch (_: Throwable) {}
    val runningTunnels = tunnels
    tunnels = emptyList()
    val runningBalancer = balancer
    balancer = null
    val runningZivpnBalancer = zivpnModernBalancer
    zivpnModernBalancer = null
    currentBalancerPort = -1
    currentStatus = STATUS_CONNECTING
    stateSink?.invoke(STATUS_CONNECTING)
    try { ZivpnTun2Socks.stop() } catch (_: Throwable) {}
    try { ZivpnDirectForwarder.stop() } catch (_: Throwable) {}
    try { runningBalancer?.stop() } catch (_: Throwable) {}
    try { runningZivpnBalancer?.close() } catch (_: Throwable) {}
    runningTunnels.forEach { tunnel -> try { tunnel.stop() } catch (_: Throwable) {} }
    // Ne pas relâcher wakeLock ici — garde CPU pour reconnexion rapide
    createNotificationChannel()
    // Android 12+ interdit startForeground depuis l'arrière-plan : on met à jour la notif existante
    try {
      val nm = getSystemService(NotificationManager::class.java)
      nm.notify(NOTIFICATION_ID, notification("Reconnexion automatique du tunnel…"))
    } catch (_: Throwable) {
      try { startForeground(NOTIFICATION_ID, notification("Reconnexion automatique du tunnel…")) } catch (_: Throwable) {}
    }
    attemptGeneration
    }
  }

  private fun fail(generation: Long, message: String) {
    if (!isActive(generation)) return
    try { FileLogger.log(this, "VPN", "FAIL generation=$generation: $message") } catch (_: Throwable) {}
    emitLog("error", "VPN", "Échec de connexion : $message")
    stopVpn(STATUS_ERROR)
  }

  private fun emitLog(level: String, component: String, message: String) {
    try { FileLogger.log(this, component, "[$level] $message") } catch (_: Throwable) {}
    if (!runtimeSettings.debugMode && level == "info") return
    logSink?.invoke(level, component, message)
  }

  private fun acquireWakeLock() {
    try {
      val manager = getSystemService(POWER_SERVICE) as PowerManager
      val lock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:PickoVpn")
      lock.setReferenceCounted(false)
      lock.acquire()
      vpnWakeLock = lock
      emitLog("connection", "VPN", "WakeLock activé")
    } catch (error: Throwable) {
      emitLog("warning", "VPN", "WakeLock non disponible : ${error.message ?: "permission manquante"}")
    }
  }

  private fun stopVpn(finalStatus: String = STATUS_DISCONNECTED) {
    try { stopZivpnHeartbeat() } catch (_: Throwable) {}
    try { FileLogger.logDetail(this, "ZIVPN-DETAIL", "STOPVPN called finalStatus=$finalStatus gen=$attemptGeneration tunFd=$tunFd") } catch (_: Throwable) {}
    val fd: Int
    val runningTunnels: List<LocalTunnel>
    val runningBalancer: LocalSocksBalancer?
    val runningZivpnBalancer: ZivpnModernBalancer?
    synchronized(lifecycleLock) {
      attemptGeneration += 1
      fd = tunFd
      tunFd = -1
      runningTunnels = tunnels
      tunnels = emptyList()
      runningBalancer = balancer
      balancer = null
      runningZivpnBalancer = zivpnModernBalancer
      zivpnModernBalancer = null
      currentBalancerPort = -1
      currentStatus = finalStatus
      stateSink?.invoke(finalStatus)
    }
    try { ZivpnTun2Socks.stop() } catch (_: Throwable) {}
    try { ZivpnDirectForwarder.stop() } catch (_: Throwable) {}
    try { runningBalancer?.stop() } catch (_: Throwable) {}
    try { runningZivpnBalancer?.close() } catch (_: Throwable) {}
    runningTunnels.forEach { tunnel -> try { tunnel.stop() } catch (_: Throwable) {} }
    if (fd >= 0) try { ParcelFileDescriptor.adoptFd(fd).close() } catch (_: Throwable) {}
    try { vpnWakeLock?.takeIf { it.isHeld }?.release() } catch (_: Throwable) {}
    vpnWakeLock = null
    try { (getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager).bindProcessToNetwork(null) } catch (_: Throwable) {}
    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
    emitLog("info", "VPN", if (finalStatus == STATUS_ERROR) "VPN arrêté après erreur" else "VPN arrêté")
    stopSelf()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= 26) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "KIGHMU VPN", NotificationManager.IMPORTANCE_LOW),
      )
    }
  }

  private fun notification(text: String): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pending = launchIntent?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
    val stopPending = PendingIntent.getService(this, NOTIFICATION_ID, Intent(this, KighmuVpnService::class.java).apply { action = ACTION_STOP }, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_kg_notification)
      .setContentTitle(if (runtimeSettings.profileNameInNotification && primaryProfileName.isNotBlank()) "KIGHMU VPN — $primaryProfileName" else "KIGHMU VPN")
      .setContentText(text)
      .setOngoing(true)
      .setContentIntent(pending)
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Arrêter", stopPending)
      .build()
  }

  override fun onRevoke() {
    try { FileLogger.logDetail(this, "ZIVPN-DETAIL", "ON_REVOKE called status=$currentStatus gen=$attemptGeneration") } catch (_: Throwable) {}
    stopVpn(); super.onRevoke()
  }
  override fun onDestroy() {
    try { FileLogger.logDetail(this, "ZIVPN-DETAIL", "ON_DESTROY called status=$currentStatus gen=$attemptGeneration") } catch (_: Throwable) {}
    try { stopZivpnHeartbeat() } catch (_: Throwable) {}
    stopVpn(); super.onDestroy()
  }

  companion object {
    const val ACTION_START = "expo.modules.kighmuvpnnative.START"
    const val ACTION_STOP = "expo.modules.kighmuvpnnative.STOP"
    const val EXTRA_PROFILES_JSON = "profilesJson"
    const val PREPARE_REQUEST_CODE = 4007
    const val STATUS_DISCONNECTED = "disconnected"
    const val STATUS_CONNECTING = "connecting"
    const val STATUS_CONNECTED = "connected"
    const val STATUS_ERROR = "error"
    const val CHANNEL_ID = "kighmu-vpn"
    private const val KEY_LAST_PAYLOAD = "last_profiles_json"
    const val NOTIFICATION_ID = 4008
    @Volatile var currentStatus = STATUS_DISCONNECTED
    // Port SOCKS local du balancier actif (-1 si VPN arrêté) : sert à la sonde
    // d'IP de sortie du Hotspot Share (requête HTTP via le tunnel réel).
    @Volatile var currentBalancerPort: Int = -1
    @Volatile var logSink: ((String, String, String) -> Unit)? = null
    @Volatile var stateSink: ((String) -> Unit)? = null
  }
}
