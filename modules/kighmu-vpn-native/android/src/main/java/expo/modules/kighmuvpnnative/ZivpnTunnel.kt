package expo.modules.kighmuvpnnative

import android.content.Context
import java.io.File
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

class ZivpnTunnel(
  private val context: Context,
  private val profile: TunnelProfile,
  private val log: (String, String, String) -> Unit,
  private val dnsServers: List<String> = emptyList(),
) : LocalTunnel {
  override val label: String = profile.name
  override val socksPort: Int = findFreePort()
  private var processes: MutableList<Process> = mutableListOf()
  private var configFiles: MutableList<File> = mutableListOf()
  private var uzPorts: List<Int> = emptyList()
  private var balancerServer: ServerSocket? = null
  private var balancerThread: Thread? = null
  private val balancerExecutor = Executors.newCachedThreadPool { r -> Thread(r, "zivpn-range-balancer").apply { isDaemon = true } }
  private val balancerCounter = AtomicInteger(0)
  @Volatile private var authFailed = false
  @Volatile private var recovering = false
  private val stopRequested = AtomicBoolean(false)
  private var recoveryThread: Thread? = null
  private var keepaliveThread: Thread? = null
  @Volatile private var lastDiagnostic = ""
  @Volatile private var lastDiagnosticAt = 0L

  override fun start() {
    profile.validate()?.let { throw IllegalArgumentException(it) }
    stopRequested.set(false)
    recovering = false
    log("connection", "ZIVPN", "ZiVPN ${profile.name}")
    // Trace détaillée dans Download/kighmu.txt (max infos debogage)
    FileLogger.logDetail(context, "ZIVPN", "START profil=${profile.name} id=${profile.id} method=${profile.method} port=${profile.port} host=${profile.host.take(32)} obfs=${profile.obfs} socksPort=$socksPort mtu=${context.resources?.configuration}")
    FileLogger.init(context)
    FileLogger.logDetail(context, "ZIVPN-DETAIL", "ENV SDK=${android.os.Build.VERSION.SDK_INT} model=${android.os.Build.MODEL} abi=${android.os.Build.SUPPORTED_ABIS?.joinToString()} apkNativeDir=${context.applicationInfo.nativeLibraryDir}")
    val binary = File(context.applicationInfo.nativeLibraryDir, "libuz_core.so")
    require(binary.exists() && binary.length() > 0L) { "libuz_core.so absent de l’APK" }

    val portRanges = profile.port.trim().ifEmpty { "6000-19999" }.split(",").map { it.trim() }.filter { it.isNotEmpty() }
    // Validation déjà faite via TunnelProfile, mais on garde garde-fou
    require(portRanges.isNotEmpty()) { "port ZiVPN invalide" }
    FileLogger.logDetail(context, "ZIVPN-DETAIL", "PORT_RANGES n=${portRanges.size} ranges=${portRanges.joinToString("|")} hostResolv=${try { java.net.InetAddress.getByName(profile.host).hostAddress } catch (_: Throwable) { "unresolved" }}")

    if (portRanges.size == 1) {
      // Mono-range : 1 uz_core direct sur socksPort (comportement legacy)
      launchSingleRange(portRanges[0], socksPort)
      uzPorts = listOf(socksPort)
      FileLogger.logDetail(context, "ZIVPN-DETAIL", "MONO_RANGE port=${portRanges[0]} -> socksPort=$socksPort")
    } else {
      // Multi-range à la Zamois : N uz_core sur ports ephémères + balancer sur socksPort
      uzPorts = portRanges.map { findFreePort() }
      FileLogger.logDetail(context, "ZIVPN-DETAIL", "MULTI_RANGE uzPorts=${uzPorts.joinToString(",")} -> balancerPort=$socksPort")
      portRanges.forEachIndexed { index, range ->
        val uzPort = uzPorts[index]
        FileLogger.logDetail(context, "ZIVPN-DETAIL", "LAUNCH_RANGE idx=$index range=$range uzPort=$uzPort")
        launchSingleRange(range, uzPort)
      }
      // Attente que tous les uz soient prêts avant balancer
      portRanges.forEachIndexed { index, _ ->
        val uzPort = uzPorts[index]
        FileLogger.logDetail(context, "ZIVPN-DETAIL", "WAIT_RANGE idx=$index uzPort=$uzPort range=${portRanges[index]}")
        if (!waitForPort(uzPort, 3500)) {
          FileLogger.logDetail(context, "ZIVPN-DETAIL", "FAIL_RANGE idx=$index uzPort=$uzPort timeout 3500ms")
          stop()
          error("ZiVPN n’a pas ouvert le proxy local")
        } else {
          FileLogger.logDetail(context, "ZIVPN-DETAIL", "OK_RANGE idx=$index uzPort=$uzPort ready")
        }
      }
      startRangeBalancer()
      FileLogger.logDetail(context, "ZIVPN-DETAIL", "BALANCER_STARTED socksPort=$socksPort targets=${uzPorts.joinToString(",")}")
    }

    if (!waitForPort(socksPort, 3500)) {
      FileLogger.logDetail(context, "ZIVPN-DETAIL", "FAIL_SOCKS socksPort=$socksPort timeout 3500ms authFailed=$authFailed procAlive=${processes.any { it.isAlive }}")
      stop()
      if (authFailed) error("Échec de l’authentification, mot de passe incorrect")
      error("ZiVPN n’a pas ouvert le proxy SOCKS local")
    }
    FileLogger.logDetail(context, "ZIVPN-DETAIL", "AUTH_OK socksPort=$socksPort uzPorts=${uzPorts.joinToString(",")} dns=${dnsServers.joinToString(",")}")
    log("success", "ZIVPN", "Auth complete")
    dnsServers.forEach { log("connection", "ZIVPN", "DNS $it") }
    log("success", "ZIVPN", "Connected")
    FileLogger.logDetail(context, "ZIVPN-DETAIL", "CONNECTED profil=${profile.name} socksPort=$socksPort balancer=${uzPorts.size}ranges")
    startKeepalive()
  }

  private fun launchSingleRange(portRange: String, uzPort: Int) {
    val runtime = OpolNative.ziVpnRuntimePolicy(profile.obfs)
    // Copie du profil avec port = ce range unique (libuz_core ne supporte qu'un range par process).
    // Le serveur est résolu en IPv4 côté JVM : libuz_core (Go) ne résout pas le DNS sur Android.
    val resolvedHost = NetResolver.resolveHost(profile.host)
    FileLogger.logDetail(context, "ZIVPN-DETAIL", "LAUNCH portRange=$portRange uzPort=$uzPort resolvedHost=$resolvedHost obfs=${profile.obfs} nativeDir=${context.applicationInfo.nativeLibraryDir}")
    val rangeProfile = profile.copy(port = portRange, host = resolvedHost)
    val config = File(context.cacheDir, "zivpn-${safeToken(profile.id)}-${uzPort}.json")
    val cfgText = OpolNative.buildZiVpnConfig(rangeProfile, uzPort)
    config.writeText(cfgText)
    configFiles.add(config)
    FileLogger.logDetail(context, "ZIVPN-DETAIL", "CONFIG uzPort=$uzPort bytes=${cfgText.length} file=${config.absolutePath}")
    val nativeDir = context.applicationInfo.nativeLibraryDir
    val started = ProcessBuilder(listOf(File(nativeDir, "libuz_core.so").absolutePath) + runtime.argumentPrefix + cfgText)
      .directory(context.filesDir)
      .apply {
        environment()["LD_LIBRARY_PATH"] = nativeDir
        environment()["HOME"] = context.cacheDir.absolutePath
        environment()["TMPDIR"] = context.cacheDir.absolutePath
        redirectErrorStream(true)
      }
      .start()
    FileLogger.logDetail(context, "ZIVPN-DETAIL", "PROCESS_STARTED uzPort=$uzPort alive=${started.isAlive} cmd=libuz_core.so")
    processes.add(started)
    observeOutput(started)
  }

  private fun startRangeBalancer() {
    try {
      FileLogger.logDetail(context, "ZIVPN-DETAIL", "BALANCER_INIT socksPort=$socksPort uzPorts=${uzPorts.joinToString(",")}")
      val server = ServerSocket(socksPort, 128, java.net.InetAddress.getByName("127.0.0.1"))
      server.reuseAddress = true
      balancerServer = server
      balancerThread = Thread {
        log("connection", "ZIVPN", "Balancer multi-range ZIVPN actif")
        FileLogger.logDetail(context, "ZIVPN-DETAIL", "BALANCER_THREAD_STARTED socksPort=$socksPort")
        while (!Thread.currentThread().isInterrupted && !server.isClosed) {
          try {
            val client = server.accept()
            balancerExecutor.execute {
              val idx = Math.floorMod(balancerCounter.getAndIncrement(), uzPorts.size)
              val targetPort = uzPorts[idx]
              var upstream: Socket? = null
              try {
                // Failover : si le premier échoue, essaie les autres
                val candidates = listOf(targetPort) + uzPorts.filter { it != targetPort }
                for (port in candidates) {
                  try {
                    upstream = Socket().apply {
                      tcpNoDelay = true
                      connect(InetSocketAddress("127.0.0.1", port), 2500)
                    }
                    break
                  } catch (_: Exception) {}
                }
                val up = upstream ?: run { try { client.close() } catch (_: Exception) {}; return@execute }
                up.tcpNoDelay = true; client.tcpNoDelay = true
                val t1 = Thread { try { relay(client.getInputStream(), up.getOutputStream()) } catch (_: Exception) {} }
                val t2 = Thread { try { relay(up.getInputStream(), client.getOutputStream()) } catch (_: Exception) {} }
                t1.isDaemon = true; t2.isDaemon = true; t1.start(); t2.start(); t1.join(); t2.join()
                try { client.close() } catch (_: Exception) {}
                try { up.close() } catch (_: Exception) {}
              } catch (_: Exception) { try { client.close() } catch (_: Exception) {}; try { upstream?.close() } catch (_: Exception) {} }
            }
          } catch (_: Exception) { break }
        }
      }.apply { isDaemon = true; name = "zivpn-range-lb" }
      balancerThread!!.start()
      // Attente balancer prêt
      var waited = 0
      while (waited < 1000) {
        if (try { Socket("127.0.0.1", socksPort).also { it.close() }; true } catch (_: Exception) { false }) break
        Thread.sleep(30); waited += 30
      }
    } catch (e: Exception) { log("warning", "ZIVPN", "Balancer multi-range non démarré: ${e.message}") }
  }

  private fun relay(input: java.io.InputStream, output: java.io.OutputStream) {
    val buf = ByteArray(8192); var n: Int
    while (input.read(buf).also { n = it } != -1) { output.write(buf, 0, n); output.flush() }
  }

  /** Affiche 4 fois le message rouge d'échec d'authentification (une seule fois par profil). */
  private fun notifyAuthFailure() {
    if (authFailed) return
    authFailed = true
    repeat(4) {
      log("error", "ZIVPN", "Échec de l’authentification, mot de passe incorrect")
    }
  }

  override fun isHealthy(): Boolean {
    if (recovering) {
      FileLogger.logDetail(context, "ZIVPN-DETAIL", "HEALTH socksPort=$socksPort recovering=true -> false")
      return false
    }
    val greeting = LocalSocksBalancer.hasSocksGreeting(socksPort)
    val realConnect = LocalSocksBalancer.hasRealConnect(socksPort)
    val alive = if (uzPorts.size > 1) processes.any { it.isAlive } else processes.firstOrNull()?.isAlive == true
    val result = if (uzPorts.size > 1) {
      greeting && alive && realConnect
    } else {
      alive && greeting && realConnect
    }
    // Trace détaillée santé (fichier Download) - utile pour diagnostiquer blocage trafic
    FileLogger.logDetail(context, "ZIVPN-DETAIL", "HEALTH socksPort=$socksPort uzPorts=${uzPorts.joinToString(",")} greeting=$greeting realConnect=$realConnect alive=$alive -> $result")
    return result
  }
  override fun isRecovering(): Boolean = recovering

  override fun stop() {
    FileLogger.logDetail(context, "ZIVPN-DETAIL", "STOP socksPort=$socksPort uzPorts=${uzPorts.joinToString(",")} procs=${processes.size} recovering=$recovering")
    stopRequested.set(true)
    recovering = false
    keepaliveThread?.interrupt()
    keepaliveThread = null
    recoveryThread?.interrupt()
    recoveryThread = null
    try { balancerServer?.close(); balancerServer = null } catch (_: Throwable) {}
    try { balancerThread?.interrupt(); balancerThread = null } catch (_: Throwable) {}
    try { balancerExecutor.shutdownNow() } catch (_: Throwable) {}
    processes.forEach { try { it.destroy() } catch (_: Throwable) {} }
    processes.forEach { try { it.waitFor(500, java.util.concurrent.TimeUnit.MILLISECONDS) } catch (_: Throwable) {} }
    processes.forEach { try { if (it.isAlive) it.destroyForcibly() } catch (_: Throwable) {} }
    processes.clear()
    configFiles.forEach { FileLogger.secureDelete(it) }
    configFiles.clear()
    uzPorts = emptyList()
    FileLogger.logDetail(context, "ZIVPN-DETAIL", "STOP_DONE socksPort=$socksPort")
  }

  private fun waitForPort(port: Int, timeoutMs: Long): Boolean {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline && processes.any { it.isAlive }) {
      if (LocalSocksBalancer.hasSocksGreeting(port)) return true
      Thread.sleep(80)
    }
    // Pour multi-range balancer, check aussi si au moins 1 process vivant
    return LocalSocksBalancer.hasSocksGreeting(port)
  }

  private fun observeOutput(running: Process) {
    Thread {
      try {
        running.inputStream.bufferedReader().useLines { lines ->
          lines.forEach { raw ->
            if (stopRequested.get() || !processes.contains(running)) return@forEach
            val line = raw.trim()
            if (line.isBlank()) return@forEach
            // Trace détaillée dans Download/kighmu.txt (max infos)
            FileLogger.logDetail(context, "ZIVPN-NATIVE", "procPort=$socksPort line=$line")
            if (AUTH_FAILURE_REGEX.containsMatchIn(line)) { notifyAuthFailure(); return@forEach }
            val lower = line.lowercase()
            if (lower.contains("timeout") || lower.contains("disconnected") || lower.contains("reconnect") || lower.contains("error") && lower.contains("udp")) {
              FileLogger.logDetail(context, "ZIVPN-DETAIL", "TRIGGER_RECOVERY line=$line recovering=$recovering")
              if (!recovering) scheduleRecovery()
            }
          }
        }
      } catch (e: Throwable) {
        FileLogger.logDetail(context, "ZIVPN-DETAIL", "OBSERVE_ERROR socksPort=$socksPort err=${e.message}")
      }
      finally {
        FileLogger.logDetail(context, "ZIVPN-DETAIL", "OBSERVE_END socksPort=$socksPort authFailed=$authFailed stopRequested=${stopRequested.get()} alive=${running.isAlive} exit=${try { running.exitValue() } catch (_: Throwable) { -1 }}")
        if (!stopRequested.get() && processes.contains(running) && !authFailed) scheduleRecovery()
      }
    }.apply { isDaemon = true; name = "zivpn-log-$socksPort" }.start()
  }

  private fun startKeepalive() {
    // Keepalive retiré : inefficace en non-root (testé et supprimé).
    // Le maintien du NAT UDP est assuré côté service (httpPing via le VPN
    // + sonde hasRealConnect du balancer) sans ouvrir de socket supplémentaire
    // depuis le tunnel. On garde le thread inactif pour compatibilité.
  }

  private fun scheduleRecovery() {
    if (stopRequested.get() || recovering || authFailed) return
    recovering = true
    keepaliveThread?.interrupt()
    recoveryThread = Thread {
      try {
        repeat(3) { idx ->
          if (stopRequested.get()) return@Thread
          try {
            // Relance seulement les processus libuz_core, pas tout le VPN
            processes.forEach { destroyProcess(it) }
            processes.clear()
            configFiles.forEach { FileLogger.secureDelete(it) }
            configFiles.clear()
            // Relance via même logique multi-range
            val portRanges = profile.port.trim().ifEmpty { "6000-19999" }.split(",").map { it.trim() }.filter { it.isNotEmpty() }
            if (portRanges.size == 1) {
              launchSingleRange(portRanges[0], socksPort)
              uzPorts = listOf(socksPort)
            } else {
              uzPorts = portRanges.map { findFreePort() }
              portRanges.forEachIndexed { i, r -> launchSingleRange(r, uzPorts[i]) }
              // Attendre chaque uz prêt avant de router le balancer dessus (évite une
              // rafale d'erreurs sur des ports pas encore ouverts pendant la reconnexion).
              portRanges.forEachIndexed { i, _ ->
                if (!waitForPort(uzPorts[i], 3500)) throw IllegalStateException("Tunnel non prêt")
              }
              // balancer déjà en place sur socksPort, pas besoin de recréer
            }
            if (waitForPort(socksPort, 3500)) {
              recovering = false
              startKeepalive()
              return@Thread
            }
          } catch (_: Throwable) { Thread.sleep(2000) }
        }
        recovering = false
      } catch (_: InterruptedException) {} finally { if (Thread.currentThread() === recoveryThread) recoveryThread = null }
    }.apply { isDaemon = true; name = "zivpn-recovery-$socksPort" }.also { it.start() }
  }

  private fun destroyProcess(p: Process?) {
    if (p == null) return
    try { p.destroy() } catch (_: Throwable) {}
    try { p.waitFor(400, java.util.concurrent.TimeUnit.MILLISECONDS) } catch (_: Throwable) {}
    try { if (p.isAlive) p.destroyForcibly() } catch (_: Throwable) {}
  }

  private fun compactLog(level: String, msg: String) {
    val now = System.currentTimeMillis()
    if (msg == lastDiagnostic && now - lastDiagnosticAt < 5000) return
    lastDiagnostic = msg; lastDiagnosticAt = now
    log(level, "ZIVPN", msg.take(180))
  }

  companion object {
    private val AUTH_FAILURE_REGEX = Regex(
      "(?i)(auth[^\\n]*(?:fail|invalid|incorrect|reject|denied)|password[^\\n]*(?:fail|invalid|incorrect|wrong|reject|denied)|unauthorized|403)",
    )

    fun findFreePort(): Int = ServerSocket(0).use { it.localPort }
    fun safeToken(value: String) = value.replace(Regex("[^A-Za-z0-9_-]"), "_").take(80)
  }
}
