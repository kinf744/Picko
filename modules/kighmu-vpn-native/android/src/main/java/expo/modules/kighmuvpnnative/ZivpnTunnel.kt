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
    log("connection", "ZIVPN", "ZiVPN ${profile.name} port=${profile.port}")
    val binary = File(context.applicationInfo.nativeLibraryDir, "libuz_core.so")
    require(binary.exists() && binary.length() > 0L) { "libuz_core.so absent de l’APK" }

    val portRanges = profile.port.trim().ifEmpty { "6000-19999" }.split(",").map { it.trim() }.filter { it.isNotEmpty() }
    // Validation déjà faite via TunnelProfile, mais on garde garde-fou
    require(portRanges.isNotEmpty()) { "port ZiVPN invalide" }

    if (portRanges.size == 1) {
      // Mono-range : 1 uz_core direct sur socksPort (comportement legacy)
      launchSingleRange(portRanges[0], socksPort)
      uzPorts = listOf(socksPort)
    } else {
      // Multi-range à la Zamois : N uz_core sur ports ephémères + balancer sur socksPort
      uzPorts = portRanges.map { findFreePort() }
      portRanges.forEachIndexed { index, range ->
        val uzPort = uzPorts[index]
        launchSingleRange(range, uzPort)
      }
      // Attente que tous les uz soient prêts avant balancer
      portRanges.forEachIndexed { index, _ ->
        val uzPort = uzPorts[index]
        if (!waitForPort(uzPort, 3500)) {
          stop()
          error("ZiVPN range ${portRanges[index]} n’a pas ouvert SOCKS $uzPort")
        }
      }
      startRangeBalancer()
    }

    if (!waitForPort(socksPort, 3500)) {
      stop()
      if (authFailed) error("Échec de l’authentification, mot de passe incorrect")
      error("ZiVPN n’a pas ouvert le proxy SOCKS local")
    }
    log("success", "ZIVPN", "Auth complete ${portRanges.size} range(s)")
    dnsServers.forEach { log("connection", "ZIVPN", "DNS $it") }
    log("success", "ZIVPN", "Connected ${if (portRanges.size > 1) "multi-range ${portRanges.joinToString(",")}" else portRanges[0]}")
    startKeepalive()
  }

  private fun launchSingleRange(portRange: String, uzPort: Int) {
    val runtime = OpolNative.ziVpnRuntimePolicy(profile.obfs)
    // Copie du profil avec port = ce range unique (libuz_core ne supporte qu'un range par process)
    val rangeProfile = profile.copy(port = portRange)
    val config = File(context.cacheDir, "zivpn-${safeToken(profile.id)}-${uzPort}.json")
    config.writeText(OpolNative.buildZiVpnConfig(rangeProfile, uzPort))
    configFiles.add(config)
    val nativeDir = context.applicationInfo.nativeLibraryDir
    val started = ProcessBuilder(listOf(File(nativeDir, "libuz_core.so").absolutePath) + runtime.argumentPrefix + config.readText())
      .directory(context.filesDir)
      .apply {
        environment()["LD_LIBRARY_PATH"] = nativeDir
        environment()["HOME"] = context.cacheDir.absolutePath
        environment()["TMPDIR"] = context.cacheDir.absolutePath
        redirectErrorStream(true)
      }
      .start()
    processes.add(started)
    observeOutput(started)
  }

  private fun startRangeBalancer() {
    try {
      val server = ServerSocket(socksPort, 128, java.net.InetAddress.getByName("127.0.0.1"))
      server.reuseAddress = true
      balancerServer = server
      balancerThread = Thread {
        log("connection", "ZIVPN", "Balancer multi-range ZIVPN sur $socksPort -> ${uzPorts.joinToString(",")}")
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
    if (recovering) return false
    // Multi-range : sain si au moins 1 uz vivant et balancer répond
    return if (uzPorts.size > 1) {
      LocalSocksBalancer.hasSocksGreeting(socksPort) && processes.any { it.isAlive }
    } else {
      !recovering && processes.firstOrNull()?.isAlive == true && LocalSocksBalancer.hasSocksGreeting(socksPort)
    }
  }
  override fun isRecovering(): Boolean = recovering

  override fun stop() {
    stopRequested.set(true)
    recovering = false
    keepaliveThread?.interrupt()
    keepaliveThread = null
    recoveryThread?.interrupt()
    recoveryThread = null
    try { balancerServer?.close(); balancerServer = null } catch (_: Throwable) {}
    try { balancerThread?.interrupt(); balancerThread = null } catch (_: Throwable) {}
    balancerExecutor.shutdownNow()
    processes.forEach { try { it.destroy() } catch (_: Throwable) {} }
    processes.forEach { try { it.waitFor(500, java.util.concurrent.TimeUnit.MILLISECONDS) } catch (_: Throwable) {} }
    processes.forEach { try { if (it.isAlive) it.destroyForcibly() } catch (_: Throwable) {} }
    processes.clear()
    configFiles.forEach { FileLogger.secureDelete(it) }
    configFiles.clear()
    uzPorts = emptyList()
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
            if (AUTH_FAILURE_REGEX.containsMatchIn(line)) { notifyAuthFailure(); return@forEach }
            val lower = line.lowercase()
            if (lower.contains("timeout") || lower.contains("disconnected") || lower.contains("reconnect") || lower.contains("error") && lower.contains("udp")) {
              if (!recovering) scheduleRecovery()
            }
          }
        }
      } catch (_: Throwable) {}
      finally {
        if (!stopRequested.get() && processes.contains(running) && !authFailed) scheduleRecovery()
      }
    }.apply { isDaemon = true; name = "zivpn-log-$socksPort" }.start()
  }

  private fun startKeepalive() {
    keepaliveThread?.interrupt()
    keepaliveThread = Thread {
      while (!stopRequested.get() && !recovering) {
        try { Thread.sleep(25_000) } catch (_: InterruptedException) { return@Thread }
        if (stopRequested.get() || recovering) return@Thread
        try {
          val s = Socket()
          s.connect(InetSocketAddress("127.0.0.1", socksPort), 3000)
          s.soTimeout = 3000
          val out = s.getOutputStream()
          val inp = s.getInputStream()
          out.write(byteArrayOf(5, 1, 0)); out.flush()
          if (inp.read() != 5 || inp.read() != 0) { s.close(); continue }
          val host = "8.8.8.8".toByteArray(Charsets.US_ASCII)
          out.write(byteArrayOf(5, 1, 0, 3, host.size.toByte())); out.write(host); out.write(byteArrayOf(0, 53)); out.flush()
          inp.read(); inp.read(); inp.read(); inp.read()
          s.close()
        } catch (_: Throwable) {}
      }
    }.apply { isDaemon = true; name = "zivpn-keepalive-$socksPort" }.also { it.start() }
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
