package expo.modules.kighmuvpnnative

import android.content.Context
import java.io.File
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.atomic.AtomicBoolean

class ZivpnTunnel(
  private val context: Context,
  private val profile: TunnelProfile,
  private val log: (String, String, String) -> Unit,
  private val dnsServers: List<String> = emptyList(),
) : LocalTunnel {
  override val label: String = profile.name
  override val socksPort: Int = findFreePort()
  private var process: Process? = null
  private var configFile: File? = null
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
    log("connection", "ZIVPN", "ZiVPN")
    val binary = File(context.applicationInfo.nativeLibraryDir, "libuz_core.so")
    require(binary.exists() && binary.length() > 0L) { "libuz_core.so absent de l’APK" }
    val runtime = OpolNative.ziVpnRuntimePolicy(profile.obfs)
    val config = File(context.cacheDir, "zivpn-${safeToken(profile.id)}.json")
    config.writeText(OpolNative.buildZiVpnConfig(profile, socksPort))
    configFile = config
    val nativeDir = context.applicationInfo.nativeLibraryDir
    val started = ProcessBuilder(listOf(binary.absolutePath) + runtime.argumentPrefix + config.readText())
      .directory(context.filesDir)
      .apply {
        environment()["LD_LIBRARY_PATH"] = nativeDir
        environment()["HOME"] = context.cacheDir.absolutePath
        environment()["TMPDIR"] = context.cacheDir.absolutePath
        redirectErrorStream(true)
      }
      .start()
    process = started
    observeOutput(started)
    if (!waitForPort(socksPort, runtime.startupTimeoutMs)) {
      stop()
      if (authFailed) error("Échec de l’authentification, mot de passe incorrect")
      error("ZiVPN n’a pas ouvert le proxy SOCKS local")
    }
    log("success", "ZIVPN", "Auth complete")
    dnsServers.forEach { log("connection", "ZIVPN", "DNS $it") }
    log("success", "ZIVPN", "Connected")
    startKeepalive()
  }

  /** Affiche 4 fois le message rouge d'échec d'authentification (une seule fois par profil). */
  private fun notifyAuthFailure() {
    if (authFailed) return
    authFailed = true
    repeat(4) {
      log("error", "ZIVPN", "Échec de l’authentification, mot de passe incorrect")
    }
  }

  override fun isHealthy(): Boolean = !recovering && process?.isAlive == true && LocalSocksBalancer.hasSocksGreeting(socksPort)
  override fun isRecovering(): Boolean = recovering

  override fun stop() {
    stopRequested.set(true)
    recovering = false
    keepaliveThread?.interrupt()
    keepaliveThread = null
    recoveryThread?.interrupt()
    recoveryThread = null
    try { process?.destroy() } catch (_: Throwable) {}
    try { process?.waitFor(500, java.util.concurrent.TimeUnit.MILLISECONDS) } catch (_: Throwable) {}
    try { process?.destroyForcibly() } catch (_: Throwable) {}
    process = null
    FileLogger.secureDelete(configFile)
    configFile = null
  }

  private fun waitForPort(port: Int, timeoutMs: Long): Boolean {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline && process?.isAlive == true) {
      if (LocalSocksBalancer.hasSocksGreeting(port)) return true
      Thread.sleep(80)
    }
    return false
  }

  private fun observeOutput(running: Process) {
    Thread {
      try {
        running.inputStream.bufferedReader().useLines { lines ->
          lines.forEach { raw ->
            if (stopRequested.get() || process !== running) return@forEach
            val line = raw.trim()
            if (line.isBlank()) return@forEach
            if (AUTH_FAILURE_REGEX.containsMatchIn(line)) { notifyAuthFailure(); return@forEach }
            val lower = line.lowercase()
            if (lower.contains("timeout") || lower.contains("disconnected") || lower.contains("reconnect") || lower.contains("error") && lower.contains("udp")) {
              compactLog("warning", "ZiVPN: $line")
              if (!recovering) scheduleRecovery()
            }
          }
        }
      } catch (_: Throwable) {}
      finally {
        if (!stopRequested.get() && process === running && !authFailed) scheduleRecovery()
      }
    }.apply { isDaemon = true; name = "zivpn-log-$socksPort" }.start()
  }

  private fun startKeepalive() {
    keepaliveThread?.interrupt()
    keepaliveThread = Thread {
      while (!stopRequested.get() && !recovering) {
        try { Thread.sleep(25_000) } catch (_: InterruptedException) { return@Thread }
        if (stopRequested.get() || recovering) return@Thread
        // Keepalive UDP NAT: petit handshake SOCKS vers 1.1.1.1:53 via le SOCKS local ZiVPN
        try {
          val s = Socket()
          s.connect(InetSocketAddress("127.0.0.1", socksPort), 3000)
          s.soTimeout = 3000
          val out = s.getOutputStream()
          val inp = s.getInputStream()
          out.write(byteArrayOf(5, 1, 0)); out.flush()
          if (inp.read() != 5 || inp.read() != 0) { s.close(); continue }
          val host = "1.1.1.1".toByteArray(Charsets.US_ASCII)
          // CONNECT 1.1.1.1:53 via SOCKS5 (TCP) suffit à faire transiter un paquet UDP via uz_core
          out.write(byteArrayOf(5, 1, 0, 3, host.size.toByte())); out.write(host); out.write(byteArrayOf(0, 53)); out.flush()
          inp.read(); inp.read(); inp.read(); inp.read() // VER REP RSV ATYP
          s.close()
        } catch (_: Throwable) {
          // Si keepalive échoue, le health watcher détectera et scheduleRecovery prendra le relais
        }
      }
    }.apply { isDaemon = true; name = "zivpn-keepalive-$socksPort" }.start()
  }

  private fun scheduleRecovery() {
    if (stopRequested.get() || recovering || authFailed) return
    recovering = true
    keepaliveThread?.interrupt()
    compactLog("warning", "ZiVPN UDP silencieux détecté — réparation à chaud sans couper le TUN")
    recoveryThread = Thread {
      try {
        repeat(3) { idx ->
          if (stopRequested.get()) return@Thread
          compactLog("info", "ZiVPN tentative ${idx + 1}/3")
          try {
            destroyProcess(process)
            process = null
            // Relance seulement le processus libuz_core, pas tout le VPN
            val runtime = OpolNative.ziVpnRuntimePolicy(profile.obfs)
            val cfg = File(context.cacheDir, "zivpn-${safeToken(profile.id)}.json")
            cfg.writeText(OpolNative.buildZiVpnConfig(profile, socksPort))
            configFile = cfg
            val started = ProcessBuilder(listOf(File(context.applicationInfo.nativeLibraryDir, "libuz_core.so").absolutePath) + runtime.argumentPrefix + cfg.readText())
              .directory(context.filesDir).apply {
                environment()["LD_LIBRARY_PATH"] = context.applicationInfo.nativeLibraryDir
                environment()["HOME"] = context.cacheDir.absolutePath
                environment()["TMPDIR"] = context.cacheDir.absolutePath
                redirectErrorStream(true)
              }.start()
            process = started
            observeOutput(started)
            if (waitForPort(socksPort, runtime.startupTimeoutMs)) {
              recovering = false
              compactLog("success", "ZiVPN réparé à chaud, trafic rétabli")
              startKeepalive()
              return@Thread
            }
          } catch (_: Throwable) { Thread.sleep(2000) }
        }
        recovering = false
        compactLog("error", "ZiVPN réparation à chaud échouée après 3 tentatives")
      } catch (_: InterruptedException) {} finally { if (Thread.currentThread() === recoveryThread) recoveryThread = null }
    }.apply { isDaemon = true; name = "zivpn-recovery-$socksPort" }.start()
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
    // Mots-clés typiques d'un refus d'authentification uz_core (insensible à la casse).
    private val AUTH_FAILURE_REGEX = Regex(
      "(?i)(auth[^\\n]*(?:fail|invalid|incorrect|reject|denied)|password[^\\n]*(?:fail|invalid|incorrect|wrong|reject|denied)|unauthorized|403)",
    )

    fun findFreePort(): Int = ServerSocket(0).use { it.localPort }
    fun safeToken(value: String) = value.replace(Regex("[^A-Za-z0-9_-]"), "_").take(80)
  }
}
