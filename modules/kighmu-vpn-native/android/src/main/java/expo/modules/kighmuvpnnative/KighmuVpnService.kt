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
  private var attemptGeneration = 0L
  @Volatile private var runtimeSettings = VpnRuntimeSettings()
  @Volatile private var activeProfilesJson = ""
  @Volatile private var primaryProfileName = ""
  private var vpnWakeLock: PowerManager.WakeLock? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> stopVpn()
      ACTION_START -> {
        val generation = beginStart() ?: return START_NOT_STICKY
        thread(isDaemon = true, name = "picko-vpn-start") { startTunnels(intent, generation) }
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
    generation == attemptGeneration && (currentStatus == STATUS_CONNECTING || currentStatus == STATUS_CONNECTED)
  }

  private fun startTunnels(intent: Intent, generation: Long) {
    try {
      AppIntegrity.requireTrustedRelease(this)
      val profilesJson = intent.getStringExtra(EXTRA_PROFILES_JSON).orEmpty()
      val payload = JSONObject(profilesJson)
      runtimeSettings = VpnRuntimeSettings.parse(payload)
      activeProfilesJson = profilesJson
      val profiles = TunnelProfile.parseMany(profilesJson)
      primaryProfileName = profiles.firstOrNull()?.name.orEmpty()
      if (profiles.isEmpty()) error("Aucun profil de tunnel utilisable n’a été reçu")
      profiles.forEach { profile -> profile.validate()?.let { error("${profile.name} : $it") } }

      createNotificationChannel()
      startForeground(NOTIFICATION_ID, notification("Préparation de ${profiles.size} tunnel(s)"))
      val connectivity = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
      val physicalNetwork = connectivity.activeNetwork ?: error("Aucun réseau physique disponible")
      if (!connectivity.bindProcessToNetwork(physicalNetwork)) error("Impossible de lier les tunnels au réseau physique")

      val established = Builder()
        .setSession("Picko multi-tunnel")
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
            "zivpn-udp" -> ZivpnTunnel(this, profile, ::emitLog)
            "ssh-slowdns" -> SshSlowDnsTunnel(this, profile, ::emitLog)
            "hysteria-udp" -> HysteriaTunnel(this, profile, ::emitLog)
            "xray" -> XrayTunnel(this, profile, ::emitLog)
            "v2ray-dns" -> V2RayDnsTunnel(this, profile, ::emitLog)
            "http-proxy-payload" -> HttpProxyPayloadTunnel(this, profile, ::emitLog)
            "ssh-ssl-tls" -> SshSslTlsTunnel(this, profile, ::emitLog)
            else -> error("Méthode non prise en charge")
          }
          emitLog("connection", "TUNNEL", "Démarrage de ${profile.name} (${profile.method})")
          tunnel.start()
          started.add(tunnel)
        } catch (error: Throwable) {
          emitLog("warning", "TUNNEL", "${profile.name} indisponible : ${error.message ?: "erreur inconnue"}")
        }
      }
      if (started.isEmpty()) error("Aucun tunnel n’a pu établir un proxy SOCKS local")
      if (!isActive(generation)) {
        started.forEach { it.stop() }
        return
      }

      val localBalancer = LocalSocksBalancer(::emitLog)
      localBalancer.start(started.map { it.socksPort })
      if (!ZivpnTun2Socks.init()) error("Le relais natif TUN→SOCKS est indisponible")
      ZivpnTun2Socks.start(this, fd, localBalancer.port, runtimeSettings.mtu)
      synchronized(lifecycleLock) {
        if (!isActive(generation)) {
          localBalancer.stop()
          started.forEach { it.stop() }
          return
        }
        tunnels = started.toList()
        balancer = localBalancer
        currentStatus = STATUS_CONNECTED
        stateSink?.invoke(STATUS_CONNECTED)
      }
      if (runtimeSettings.wakeLockEnabled) acquireWakeLock()
      emitLog("connection", "BALANCER", "VPN connecté avec ${started.size} tunnel(s) disponibles ; MTU ${runtimeSettings.mtu}")
      startForeground(NOTIFICATION_ID, notification("Connecté : ${started.size} tunnel(s) équilibrés"))
      monitorTunnels(generation)
    } catch (error: Throwable) {
      fail(generation, error.message ?: error::class.java.simpleName)
    }
  }

  private fun monitorTunnels(generation: Long) {
    thread(isDaemon = true, name = "picko-vpn-health") {
      var lastPorts = emptyList<Int>()
      var recoveryLogged = false
      var pingFailures = 0
      var nextPingAt = System.currentTimeMillis() + runtimeSettings.httpPingIntervalMs
      while (isActive(generation)) {
        Thread.sleep(2_500)
        val snapshot = synchronized(lifecycleLock) { tunnels.toList() }
        val healthy = snapshot.filter { it.isHealthy() }
        val recovering = snapshot.any { it.isRecovering() }
        val ports = healthy.map { it.socksPort }
        if (ports != lastPorts) {
          balancer?.updatePorts(ports)
          emitLog("info", "BALANCER", "${ports.size} tunnel(s) sain(s) après contrôle de santé")
          lastPorts = ports
        }
        if (ports.isEmpty()) {
          if (recovering) {
            if (!recoveryLogged) {
              emitLog("warning", "TUNNEL", "Tunnel temporairement indisponible ; reconnexion locale en cours")
              recoveryLogged = true
            }
          } else if (runtimeSettings.alwaysReconnect) {
            restartVpn(generation, "Tous les tunnels sont indisponibles")
            return@thread
          } else {
            fail(generation, "Tous les tunnels sont indisponibles")
            return@thread
          }
        } else {
          recoveryLogged = false
        }
        val now = System.currentTimeMillis()
        if (runtimeSettings.httpPingEnabled && now >= nextPingAt && ports.isNotEmpty()) {
          nextPingAt = now + runtimeSettings.httpPingIntervalMs
          if (httpPing()) {
            if (pingFailures > 0) emitLog("connection", "PING", "Vérification HTTP rétablie via le balancier SOCKS")
            pingFailures = 0
          } else {
            pingFailures += 1
            emitLog("warning", "PING", "Échec HTTP $pingFailures/${runtimeSettings.reconnectAfterFailures.coerceAtLeast(1)}")
            if (runtimeSettings.reconnectAfterFailures > 0 && pingFailures >= runtimeSettings.reconnectAfterFailures) {
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

  private fun httpPing(): Boolean = try {
    val socksPort = synchronized(lifecycleLock) { balancer?.port } ?: return false
    val proxy = Proxy(Proxy.Type.SOCKS, InetSocketAddress("127.0.0.1", socksPort))
    val connection = URL(runtimeSettings.httpPingUrl).openConnection(proxy) as HttpURLConnection
    connection.connectTimeout = runtimeSettings.httpPingTimeoutMs
    connection.readTimeout = runtimeSettings.httpPingTimeoutMs
    connection.instanceFollowRedirects = true
    connection.setRequestProperty("Connection", "close")
    val code = connection.responseCode
    connection.disconnect()
    code in 200..399
  } catch (error: Throwable) {
    emitLog("info", "PING", "Vérification HTTP indisponible : ${error.message ?: "erreur réseau"}")
    false
  }

  private fun restartVpn(generation: Long, reason: String) {
    if (!isActive(generation)) return
    val payload = activeProfilesJson
    if (payload.isBlank()) {
      fail(generation, reason)
      return
    }
    emitLog("warning", "VPN", "$reason ; redémarrage automatique demandé")
    stopVpn(STATUS_DISCONNECTED)
    thread(isDaemon = true, name = "picko-vpn-restart") {
      try { Thread.sleep(1_000) } catch (_: InterruptedException) { return@thread }
      try {
        startForegroundService(Intent(this, KighmuVpnService::class.java).apply {
          action = ACTION_START
          putExtra(EXTRA_PROFILES_JSON, payload)
        })
      } catch (error: Throwable) {
        emitLog("error", "VPN", "Redémarrage automatique impossible : ${error.message ?: "erreur Android"}")
      }
    }
  }

  private fun fail(generation: Long, message: String) {
    if (!isActive(generation)) return
    emitLog("error", "VPN", "Échec de connexion : $message")
    stopVpn(STATUS_ERROR)
  }

  private fun emitLog(level: String, component: String, message: String) {
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
    val fd: Int
    val runningTunnels: List<LocalTunnel>
    val runningBalancer: LocalSocksBalancer?
    synchronized(lifecycleLock) {
      attemptGeneration += 1
      fd = tunFd
      tunFd = -1
      runningTunnels = tunnels
      tunnels = emptyList()
      runningBalancer = balancer
      balancer = null
      currentStatus = finalStatus
      stateSink?.invoke(finalStatus)
    }
    try { ZivpnTun2Socks.stop() } catch (_: Throwable) {}
    try { runningBalancer?.stop() } catch (_: Throwable) {}
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
        NotificationChannel(CHANNEL_ID, "Picko VPN", NotificationManager.IMPORTANCE_LOW),
      )
    }
  }

  private fun notification(text: String): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pending = launchIntent?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
    val stopPending = PendingIntent.getService(this, NOTIFICATION_ID, Intent(this, KighmuVpnService::class.java).apply { action = ACTION_STOP }, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_warning)
      .setContentTitle(if (runtimeSettings.profileNameInNotification && primaryProfileName.isNotBlank()) "Picko VPN — $primaryProfileName" else "Picko VPN")
      .setContentText(text)
      .setOngoing(true)
      .setContentIntent(pending)
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Arrêter", stopPending)
      .build()
  }

  override fun onRevoke() { stopVpn(); super.onRevoke() }
  override fun onDestroy() { stopVpn(); super.onDestroy() }

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
    const val NOTIFICATION_ID = 4008
    @Volatile var currentStatus = STATUS_DISCONNECTED
    @Volatile var logSink: ((String, String, String) -> Unit)? = null
    @Volatile var stateSink: ((String) -> Unit)? = null
  }
}
