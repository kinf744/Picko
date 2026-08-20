package expo.modules.kighmuvpnnative

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.net.ServerSocket
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class HysteriaTunnel(
  private val context: Context,
  private val profile: TunnelProfile,
  private val log: (String, String, String) -> Unit,
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

  override fun start() {
    profile.validate()?.let { error(it) }
    stopRequested.set(false)
    recovering = false
    val config = writeConfig()
    val binary = File(context.applicationInfo.nativeLibraryDir, "libhysteria.so")
    require(binary.isFile) { "client Hysteria armeabi-v7a introuvable" }

    try {
      launchProcess(binary, config)
      waitForSocks(30_000)
      compactLog("info", "Hysteria connecté; proxy SOCKS prêt sur 127.0.0.1:$socksPort")
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
    try { configFile?.delete() } catch (_: Throwable) {}
    configFile = null
  }

  private fun launchProcess(binary: File, config: File) {
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
    observeOutput(started, binary, config)
  }

  private fun scheduleRecovery(binary: File, config: File) {
    if (stopRequested.get() || recovering) return
    recovering = true
    compactLog("warning", "Connexion Hysteria perdue; reconnexion automatique")
    recoveryThread = Thread {
      try {
        repeat(MAX_RECOVERY_ATTEMPTS) { index ->
          if (stopRequested.get()) return@Thread
          compactLog("info", "Reconnexion Hysteria ${index + 1}/$MAX_RECOVERY_ATTEMPTS")
          try {
            launchProcess(binary, config)
            waitForSocks(RECOVERY_SOCKS_TIMEOUT_MS)
            recovering = false
            compactLog("info", "Hysteria reconnecté; trafic rétabli")
            return@Thread
          } catch (_: Throwable) {
            destroyProcess(process)
            process = null
            if (!stopRequested.get()) Thread.sleep(RECOVERY_DELAY_MS)
          }
        }
        recovering = false
        compactLog("error", "Reconnexion Hysteria impossible après $MAX_RECOVERY_ATTEMPTS tentatives")
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

  private fun observeOutput(running: Process, binary: File, config: File) {
    Thread {
      try {
        running.inputStream.bufferedReader().useLines { lines ->
          lines.forEach { rawLine ->
            if (stopRequested.get() || process !== running) return@forEach
            val normalized = rawLine.lowercase()
            when {
              normalized.contains("connected") ||
                normalized.contains("socks5") && normalized.contains("127.0.0.1") ->
                compactLog("info", "Hysteria connecté; proxy SOCKS prêt")
              normalized.contains("no recent network activity") ||
                normalized.contains("connection lost") ||
                normalized.contains("disconnected") ||
                normalized.contains("timeout") -> {
                compactLog("warning", "Perte réseau Hysteria détectée; reconnexion en cours")
                scheduleRecovery(binary, config)
              }
              normalized.contains("fatal") || normalized.contains("failed to initialize") ||
                normalized.contains("panic") -> {
                compactLog("error", "Erreur critique Hysteria; reconnexion en cours")
                scheduleRecovery(binary, config)
              }
            }
          }
        }
      } catch (_: Throwable) {
        // La fermeture du processus termine normalement l’observation.
      } finally {
        if (!stopRequested.get() && process === running) scheduleRecovery(binary, config)
      }
    }.apply { isDaemon = true; name = "picko-hysteria-${profile.id.takeLast(8)}" }.start()
  }

  private fun compactLog(level: String, message: String) {
    val now = System.currentTimeMillis()
    if (message == lastDiagnostic && now - lastDiagnosticAt < LOG_DEDUP_MS) return
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
      val config = JSONObject().apply {
        put("server", "${profile.hysteriaHost}:${profile.hysteriaPort}")
        put("auth_str", profile.hysteriaAuth)
        put("up_mbps", profile.hysteriaUpMbps.toDouble())
        put("down_mbps", profile.hysteriaDownMbps.toDouble())
        put("retry", 3)
        put("retry_interval", 1)
        put("insecure", true)
        put("recv_window_conn", 4_194_304)
        put("recv_window", 16_777_216)
        put("socks5", JSONObject().put("listen", "127.0.0.1:$socksPort"))
        if (profile.hysteriaObfs.isNotBlank()) put("obfs", profile.hysteriaObfs)
      }
      file.writeText(config.toString())
      configFile = file
    }
  }

  companion object {
    private const val MAX_RECOVERY_ATTEMPTS = 20
    private const val RECOVERY_DELAY_MS = 2_000L
    private const val RECOVERY_SOCKS_TIMEOUT_MS = 35_000L
    private const val LOG_DEDUP_MS = 5_000L
  }
}
