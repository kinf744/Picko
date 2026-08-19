package expo.modules.kighmuvpnnative

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/** Hysteria v1.3.5 client process dedicated to one selected Hysteria profile. */
class HysteriaProfileTunnel(
  private val context: Context,
  private val emit: (level: String, component: String, message: String) -> Unit,
) {
  private var process: Process? = null
  private var configFile: File? = null
  @Volatile private var running = false
  var socksPort: Int = -1
    private set

  @Synchronized
  fun start(profile: JSONObject): Int {
    require(!running) { "Hysteria déjà démarré pour ce profil" }
    val host = profile.optString("host").trim()
    val port = profile.optString("port").trim().replace(Regex("\\s+"), "")
    val auth = profile.optString("auth").trim()
    require(host.isNotBlank() && port.isNotBlank() && auth.isNotBlank()) { "Profil Hysteria incomplet" }
    val binary = File(context.applicationInfo.nativeLibraryDir, "libhysteria.so")
    require(binary.exists() && binary.length() > 0L && binary.canExecute()) { "libhysteria.so ARMv7 absent ou non exécutable" }
    socksPort = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { it.localPort }
    val safeId = profile.optString("id", "profile").replace(Regex("[^A-Za-z0-9_-]"), "_").take(64)
    val upload = profile.optString("uploadMbps", "10").toIntOrNull()?.coerceAtLeast(1) ?: 10
    val download = profile.optString("downloadMbps", "50").toIntOrNull()?.coerceAtLeast(1) ?: 50
    val config = JSONObject()
      .put("server", "$host:$port")
      .put("auth_str", auth)
      .put("up_mbps", upload)
      .put("down_mbps", download)
      .put("retry", 2)
      .put("retry_interval", 1)
      .put("handshake_timeout", 10)
      .put("idle_timeout", 60)
      .put("hop_interval", 10)
      .put("server_name", host)
      .put("insecure", true)
      .put("disable_mtu_discovery", false)
      .put("fast_open", false)
      .put("socks5", JSONObject().put("listen", "127.0.0.1:$socksPort").put("timeout", 300).put("disable_udp", false))
    profile.optString("obfs").trim().takeIf { it.isNotBlank() }?.let { config.put("obfs", it) }
    val file = File(context.filesDir, "hysteria_${safeId}.json")
    file.writeText(config.toString())
    configFile = file
    running = true
    try {
      val started = ProcessBuilder(binary.absolutePath, "client", "--config", file.absolutePath).directory(context.filesDir).apply {
        environment()["LD_LIBRARY_PATH"] = context.applicationInfo.nativeLibraryDir
        environment()["HOME"] = context.filesDir.absolutePath
        environment()["TMPDIR"] = context.cacheDir.absolutePath
        redirectErrorStream(true)
      }.start()
      process = started
      thread(isDaemon = true, name = "hysteria-$safeId-log") {
        try { started.inputStream.bufferedReader().useLines { lines -> lines.forEach { line -> if (running && line.isNotBlank()) emit("info", "HYSTERIA", line.take(300)) } } }
        catch (_: Throwable) { if (running) emit("warning", "HYSTERIA", "Lecture des logs interrompue") }
      }
      if (!waitForSocks(started, socksPort, 20_000)) error("Hysteria n’a pas ouvert son SOCKS local")
      emit("info", "HYSTERIA", "Hysteria v1.3.5 prêt sur le relais SOCKS local")
      return socksPort
    } catch (error: Throwable) {
      stop()
      throw error
    }
  }

  @Synchronized
  fun stop() {
    running = false
    val active = process
    process = null
    if (active != null) {
      try { active.destroy() } catch (_: Throwable) {}
      try { active.waitFor(700, TimeUnit.MILLISECONDS) } catch (_: Throwable) {}
      if (active.isAlive) try { active.destroyForcibly() } catch (_: Throwable) {}
    }
    try { configFile?.delete() } catch (_: Throwable) {}
    configFile = null
    socksPort = -1
  }

  private fun waitForSocks(active: Process, port: Int, timeoutMs: Long): Boolean {
    val deadline = System.nanoTime() + timeoutMs * 1_000_000L
    while (System.nanoTime() < deadline && active.isAlive) {
      try { Socket().use { it.connect(InetSocketAddress("127.0.0.1", port), 200); return true } } catch (_: Throwable) { Thread.sleep(80) }
    }
    return false
  }
}
