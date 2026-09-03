package expo.modules.kighmuvpnnative

import android.content.Context
import java.io.File
import java.net.ServerSocket
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class HysteriaTunnel(
  private val context: Context,
  private val profile: TunnelProfile,
  private val log: (String, String, String) -> Unit,
  private val dnsServers: List<String> = emptyList(),
) : LocalTunnel {
  override val label: String = profile.name
  override val socksPort: Int = ServerSocket(0).use { it.localPort }

  @Volatile private var process: Process? = null
  @Volatile private var configFile: File? = null
  @Volatile private var recovering = false
  private val stopRequested = AtomicBoolean(false)
  private var recoveryThread: Thread? = null
  @Volatile private var lastDiagnostic = ""
  @Volatile private var lastDiagnosticAt = 0L
  @Volatile private var runtimePolicy: OpolNative.HysteriaRuntimePolicy? = null

  override fun start() {
    profile.validate()?.let { error(it) }
    stopRequested.set(false)
    recovering = false
    log("connection", "HYSTERIA", "Hysteria")
    val policy = OpolNative.hysteriaRuntimePolicy()
    runtimePolicy = policy
    val config = writeConfig()
    val binary = File(context.applicationInfo.nativeLibraryDir, "libhysteria.so")
    require(binary.isFile) { "client Hysteria armeabi-v7a introuvable" }

    try {
      launchProcess(binary, config, policy)
      waitForSocks(policy.startupTimeoutMs)
      log("success", "HYSTERIA", "Connected")
      dnsServers.forEach { log("connection", "HYSTERIA", "DNS $it") }
    } catch (error: Throwable) {
      stop()
      throw error
    }
  }

  override fun isHealthy(): Boolean =
    !recovering && process?.isAlive == true && LocalSocksBalancer.hasSocksGreeting(socksPort)

  override fun isRecovering(): Boolean = recovering

  override fun stop() {
    stopRequested.set(true)
    recovering = false
    recoveryThread?.interrupt()
    recoveryThread = null
    destroyProcess(process)
    process = null
    FileLogger.secureDelete(configFile)
    configFile = null
    runtimePolicy = null
  }

  private fun launchProcess(binary: File, config: File, policy: OpolNative.HysteriaRuntimePolicy) {
    destroyProcess(process)
    val started = ProcessBuilder(binary.absolutePath, "client", "--config", config.absolutePath)
      .directory(context.filesDir)
      .redirectErrorStream(true)
      .apply {
        environment()["HOME"] = context.filesDir.absolutePath
        environment()["TMPDIR"] = context.cacheDir.absolutePath
      }
      .start()
    process = started
    observeOutput(started, binary, config, policy)
  }

  private fun scheduleRecovery(binary: File, config: File, policy: OpolNative.HysteriaRuntimePolicy) {
    if (stopRequested.get() || recovering) return
    recovering = true
    compactLog("warning", "Connexion Hysteria perdue; reconnexion automatique")
    recoveryThread = Thread {
      try {
        repeat(policy.maxRecoveryAttempts) { index ->
          if (stopRequested.get()) return@Thread
          compactLog("info", "Reconnexion Hysteria ${index + 1}/${policy.maxRecoveryAttempts}")
          try {
            launchProcess(binary, config, policy)
            waitForSocks(policy.recoveryTimeoutMs)
            recovering = false
            compactLog("info", "Hysteria reconnecté; trafic rétabli")
            return@Thread
          } catch (_: Throwable) {
            destroyProcess(process)
            process = null
            if (!stopRequested.get()) Thread.sleep(policy.recoveryDelayMs)
          }
        }
        recovering = false
        compactLog("error", "Reconnexion Hysteria impossible après ${policy.maxRecoveryAttempts} tentatives")
      } catch (_: InterruptedException) {
        // Arrêt volontaire ou nouveau cycle de reconnexion.
      } finally {
        if (Thread.currentThread() === recoveryThread) recoveryThread = null
      }
    }.apply { isDaemon = true; name = "picko-hysteria-recovery-${profile.id.takeLast(8)}" }
    recoveryThread?.start()
  }

  private fun waitForSocks(timeoutMs: Long) {
    val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs)
    while (System.nanoTime() < deadline) {
      if (LocalSocksBalancer.hasSocksGreeting(socksPort)) return
      val running = process ?: error("processus Hysteria absent")
      if (!running.isAlive) error("Hysteria s’est arrêté avant l’ouverture du proxy SOCKS")
      Thread.sleep(500)
    }
    error("Hysteria n’a pas ouvert son proxy SOCKS dans le délai imparti")
  }

  private fun observeOutput(running: Process, binary: File, config: File, policy: OpolNative.HysteriaRuntimePolicy) {
    Thread {
      try {
        running.inputStream.bufferedReader().useLines { lines ->
          lines.forEach { rawLine ->
            if (stopRequested.get() || process !== running) return@forEach
            when (OpolNative.classifyHysteriaOutput(rawLine)) {
              "ready" -> compactLog("info", "Hysteria connecté; proxy SOCKS prêt")
              "retry" -> {
                compactLog("warning", "Perte réseau Hysteria détectée; reconnexion en cours")
                scheduleRecovery(binary, config, policy)
              }
              "fatal" -> {
                compactLog("error", "Erreur critique Hysteria; reconnexion en cours")
                scheduleRecovery(binary, config, policy)
              }
            }
          }
        }
      } catch (_: Throwable) {
        // La fermeture du processus termine normalement l’observation.
      } finally {
        if (!stopRequested.get() && process === running) scheduleRecovery(binary, config, policy)
      }
    }.apply { isDaemon = true; name = "picko-hysteria-${profile.id.takeLast(8)}" }.start()
  }

  private fun compactLog(level: String, message: String) {
    val now = System.currentTimeMillis()
    val dedupMs = runtimePolicy?.logDedupMs ?: 0L
    if (message == lastDiagnostic && now - lastDiagnosticAt < dedupMs) return
    lastDiagnostic = message
    lastDiagnosticAt = now
    log(level, "HYSTERIA", message.take(180))
  }

  private fun destroyProcess(target: Process?) {
    if (target == null) return
    try { target.outputStream.close() } catch (_: Throwable) {}
    try { target.inputStream.close() } catch (_: Throwable) {}
    try { target.errorStream.close() } catch (_: Throwable) {}
    try { target.destroy() } catch (_: Throwable) {}
    try { if (!target.waitFor(600, TimeUnit.MILLISECONDS)) target.destroyForcibly() } catch (_: Throwable) {}
  }

  private fun writeConfig(): File {
    val safeId = profile.id.replace(Regex("[^A-Za-z0-9._-]"), "_")
    return File(context.cacheDir, "hysteria-$safeId.json").also { file ->
      // The complete Hysteria JSON is generated and validated in libopol.
      file.writeText(OpolNative.buildHysteriaConfig(profile, socksPort))
      configFile = file
    }
  }

}
