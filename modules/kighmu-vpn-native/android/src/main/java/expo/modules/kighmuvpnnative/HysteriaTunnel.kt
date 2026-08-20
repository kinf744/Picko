package expo.modules.kighmuvpnnative

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.net.ServerSocket
import java.util.concurrent.TimeUnit

class HysteriaTunnel(
  private val context: Context,
  private val profile: TunnelProfile,
  private val log: (String, String, String) -> Unit,
) : LocalTunnel {
  override val label: String = profile.name
  override val socksPort: Int = ServerSocket(0).use { it.localPort }
  private var process: Process? = null
  private var configFile: File? = null

  override fun start() {
    profile.validate()?.let { error(it) }
    val config = writeConfig()
    val binary = File(context.applicationInfo.nativeLibraryDir, "libhysteria.so")
    require(binary.isFile) { "client Hysteria armeabi-v7a introuvable" }

    try {
      process = ProcessBuilder(binary.absolutePath, "client", "--config", config.absolutePath)
        .directory(context.filesDir)
        .redirectErrorStream(true)
        .apply {
          environment()["HOME"] = context.filesDir.absolutePath
          environment()["TMPDIR"] = context.cacheDir.absolutePath
        }
        .start()
      observeOutput(process!!)
      waitForSocks()
      log("connection", "HYSTERIA", "${profile.name} prêt sur SOCKS 127.0.0.1:$socksPort")
    } catch (error: Throwable) {
      stop()
      throw error
    }
  }

  override fun isHealthy(): Boolean = process?.isAlive == true && LocalSocksBalancer.hasSocksGreeting(socksPort)

  override fun stop() {
    val running = process
    process = null
    try { running?.outputStream?.close() } catch (_: Throwable) {}
    try { running?.inputStream?.close() } catch (_: Throwable) {}
    try { running?.errorStream?.close() } catch (_: Throwable) {}
    try { running?.destroy() } catch (_: Throwable) {}
    try { if (running?.waitFor(600, TimeUnit.MILLISECONDS) == false) running.destroyForcibly() } catch (_: Throwable) {}
    try { configFile?.delete() } catch (_: Throwable) {}
    configFile = null
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

  private fun waitForSocks() {
    repeat(60) {
      if (LocalSocksBalancer.hasSocksGreeting(socksPort)) return
      val running = process ?: error("processus Hysteria absent")
      if (!running.isAlive) error("Hysteria s’est arrêté avant l’ouverture du proxy SOCKS")
      Thread.sleep(500)
    }
    error("Hysteria n’a pas ouvert son proxy SOCKS dans le délai imparti")
  }

  private fun observeOutput(running: Process) {
    Thread {
      try {
        running.inputStream.bufferedReader().useLines { lines ->
          lines.forEach { line ->
            val normalized = line.lowercase()
            when {
              normalized.contains("error") || normalized.contains("fatal") -> log("warning", "HYSTERIA", line.take(220))
              normalized.contains("connected") || normalized.contains("socks5") -> log("info", "HYSTERIA", line.take(220))
            }
          }
        }
      } catch (_: Throwable) {
        // La fermeture du processus termine normalement l’observation.
      }
    }.apply { isDaemon = true; name = "picko-hysteria-${profile.id.takeLast(8)}" }.start()
  }
}
