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
import kotlin.concurrent.thread

class KighmuVpnService : VpnService() {
  private val lifecycleLock = Any()
  private var tunFd = -1
  private var tunnels: List<LocalTunnel> = emptyList()
  private var balancer: LocalSocksBalancer? = null
  private var attemptGeneration = 0L

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
      val profilesJson = intent.getStringExtra(EXTRA_PROFILES_JSON).orEmpty()
      val profiles = TunnelProfile.parseMany(profilesJson)
      if (profiles.isEmpty()) error("Aucun profil de tunnel utilisable n’a été reçu")
      profiles.forEach { profile -> profile.validate()?.let { error("${profile.name} : $it") } }

      createNotificationChannel()
      startForeground(NOTIFICATION_ID, notification("Préparation de ${profiles.size} tunnel(s)"))
      val connectivity = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
      val physicalNetwork = connectivity.activeNetwork ?: error("Aucun réseau physique disponible")
      if (!connectivity.bindProcessToNetwork(physicalNetwork)) error("Impossible de lier les tunnels au réseau physique")

      val established = Builder()
        .setSession("Picko multi-tunnel")
        .setMtu(1400)
        .addAddress("10.0.0.2", 24)
        .addRoute("0.0.0.0", 0)
        .addDnsServer("8.8.8.8")
        .setUnderlyingNetworks(arrayOf(physicalNetwork))
        .apply { addDisallowedApplication(packageName) }
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
      ZivpnTun2Socks.start(this, fd, localBalancer.port, 1400)
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
      emitLog("connection", "BALANCER", "VPN connecté avec ${started.size} tunnel(s) disponibles")
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
      while (isActive(generation)) {
        Thread.sleep(5_000)
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
              emitLog("warning", "HYSTERIA", "Tunnel temporairement indisponible; reconnexion en cours")
              recoveryLogged = true
            }
          } else {
            fail(generation, "Tous les tunnels sont indisponibles")
            return@thread
          }
        } else {
          recoveryLogged = false
        }
      }
    }
  }

  private fun fail(generation: Long, message: String) {
    if (!isActive(generation)) return
    emitLog("error", "VPN", "Échec de connexion : $message")
    stopVpn(STATUS_ERROR)
  }

  private fun emitLog(level: String, component: String, message: String) {
    logSink?.invoke(level, component, message)
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
      .setContentTitle("Picko VPN")
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
