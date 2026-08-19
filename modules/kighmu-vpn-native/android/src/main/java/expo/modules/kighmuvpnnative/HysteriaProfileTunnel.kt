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
  @Volatile private var serverConnected = false
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
    // The hysteria v1.3.5 Go binary cannot resolve DNS on Android; resolve in Java first (Zamois-tun pattern).
    val resolvedHost = try { InetAddress.getByName(host).hostAddress ?: host } catch (_: Throwable) { host }
    val server = "$resolvedHost:$port"
    socksPort = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { it.localPort }
    serverConnected = false
    val safeId = profile.optString("id", "profile").replace(Regex("[^A-Za-z0-9_-]"), "_").take(64)
    val upload = profile.optString("uploadMbps", "10").toIntOrNull()?.coerceAtLeast(1) ?: 10
    val download = profile.optString("downloadMbps", "50").toIntOrNull()?.coerceAtLeast(1) ?: 50
    val config = JSONObject()
      .put("server", server)
      .put("auth_str", auth)
      .put("up_mbps", upload)
      .put("down_mbps", download)
      .put("retry", 3)
      .put("retry_interval", 1)
      .put("handshake_timeout", 10)
      .put("idle_timeout", 60)
      .put("hop_interval", 10)
      .put("server_name", host)
      .put("insecure", true)
      .put("disable_mtu_discovery", false)
      .put("fast_open", false)
      .put("recv_window_conn", 4_194_304)
      .put("recv_window", 16_777_216)
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
        try {
          started.inputStream.bufferedReader().useLines { lines ->
            lines.forEach { line ->
              if (!running) return@forEach
              if (line.isBlank()) return@forEach
              val lower = line.lowercase()
              if (!serverConnected && (lower.contains("connected") || lower.contains("established"))) {
                serverConnected = true
                emit("info", "HYSTERIA", "Connexion au serveur Hysteria établie")
              }
              if (lower.contains("error") || lower.contains("fatal")) emit("error", "HYSTERIA", line.take(300))
              else emit("info", "HYSTERIA", line.take(300))
            }
          }
        } catch (_: Throwable) {
          if (running) emit("warning", "HYSTERIA", "Lecture des logs interrompue")
        } finally {
          if (running && !started.isAlive) {
            val exit = try { started.exitValue() } catch (_: Throwable) { -1 }
            serverConnected = false
            emit("error", "HYSTERIA", "Processus Hysteria arrêté prématurément (code $exit)")
          }
        }
      }
      if (!waitForServerConnection(started, 15_000)) error("Hysteria n’a pas pu établir de connexion au serveur ($server) : vérifiez host, plage de ports et auth")
      if (!waitForSocks(started, socksPort, 5_000)) error("Hysteria connecté mais SOCKS local indisponible")
      emit("info", "HYSTERIA", "Hysteria v1.3.5 connecté à $server ; relais SOCKS local 127.0.0.1:$socksPort")
      return socksPort
    } catch (error: Throwable) {
      stop()
      throw error
    }
  }

  @Synchronized
  fun stop() {
    running = false
    serverConnected = false
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

  private fun waitForServerConnection(active: Process, timeoutMs: Long): Boolean {
    val deadline = System.nanoTime() + timeoutMs * 1_000_000L
    while (System.nanoTime() < deadline && active.isAlive) {
      if (serverConnected) return true
      Thread.sleep(200)
    }
    return serverConnected
  }

  private fun waitForSocks(active: Process, port: Int, timeoutMs: Long): Boolean {
    val deadline = System.nanoTime() + timeoutMs * 1_000_000L
    while (System.nanoTime() < deadline && active.isAlive) {
      try { Socket().use { it.connect(InetSocketAddress("127.0.0.1", port), 200); return true } } catch (_: Throwable) { Thread.sleep(80) }
    }
    return false
  }
}
