package expo.modules.kighmuvpnnative

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.net.ServerSocket
import java.net.Socket

class ZivpnTunnel(
  private val context: Context,
  private val profile: TunnelProfile,
  private val log: (String, String, String) -> Unit,
) : LocalTunnel {
  override val label: String = profile.name
  override val socksPort: Int = findFreePort()
  private var process: Process? = null
  private var configFile: File? = null

  override fun start() {
    profile.validate()?.let { throw IllegalArgumentException(it) }
    val binary = File(context.applicationInfo.nativeLibraryDir, "libuz_core.so")
    require(binary.exists() && binary.length() > 0L) { "libuz_core.so absent de l’APK" }
    val config = File(context.cacheDir, "zivpn-${safeToken(profile.id)}.json")
    config.writeText(JSONObject()
      .put("server", "${profile.host}:${profile.port}")
      .put("obfs", profile.obfs)
      .put("auth", profile.password)
      .put("socks5", JSONObject().put("listen", "127.0.0.1:$socksPort"))
      .put("insecure", true)
      .put("recvwindowconn", 65536)
      .put("recvwindow", 262144)
      .put("disable_mtu_discovery", true)
      .toString())
    configFile = config
    val nativeDir = context.applicationInfo.nativeLibraryDir
    process = ProcessBuilder(binary.absolutePath, "-s", profile.obfs, "--config", config.readText())
      .directory(context.filesDir)
      .apply {
        environment()["LD_LIBRARY_PATH"] = nativeDir
        environment()["HOME"] = context.cacheDir.absolutePath
        environment()["TMPDIR"] = context.cacheDir.absolutePath
        redirectErrorStream(true)
      }
      .start()
    val started = process ?: error("processus ZiVPN indisponible")
    Thread {
      try {
        started.inputStream.bufferedReader().useLines { lines ->
          lines.forEach { line -> if (line.isNotBlank()) log("info", "ZIVPN", line.take(500)) }
        }
      } catch (_: Throwable) {}
    }.apply { isDaemon = true; name = "zivpn-log-$socksPort" }.start()
    if (!waitForPort(socksPort, 5_000L)) {
      stop()
      error("ZiVPN n’a pas ouvert le proxy SOCKS local")
    }
    log("connection", "ZIVPN", "${profile.name} prêt sur 127.0.0.1:$socksPort")
  }

  override fun isHealthy(): Boolean = process?.isAlive == true && LocalSocksBalancer.hasSocksGreeting(socksPort)

  override fun stop() {
    try { process?.destroy() } catch (_: Throwable) {}
    try { process?.waitFor(500, java.util.concurrent.TimeUnit.MILLISECONDS) } catch (_: Throwable) {}
    try { process?.destroyForcibly() } catch (_: Throwable) {}
    process = null
    try { configFile?.delete() } catch (_: Throwable) {}
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

  companion object {
    fun findFreePort(): Int = ServerSocket(0).use { it.localPort }
    fun safeToken(value: String) = value.replace(Regex("[^A-Za-z0-9_-]"), "_").take(80)
  }
}
