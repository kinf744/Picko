package expo.modules.kighmuvpnnative

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * Xray process dedicated to a single family/profile. The class does not share config files,
 * runtime names or local ports with another profile.
 */
class XrayProfileTunnel(
  private val context: Context,
  private val binaryName: String,
  private val runtimeLabel: String,
  private val emit: (level: String, component: String, message: String) -> Unit,
) {
  private var process: Process? = null
  private var configFile: File? = null
  @Volatile private var running = false
  var socksPort: Int = -1
    private set

  @Synchronized
  fun start(profile: JSONObject, upstreamHost: String? = null, upstreamPort: Int? = null): Int {
    require(!running) { "Xray $runtimeLabel déjà démarré" }
    val binary = File(context.applicationInfo.nativeLibraryDir, binaryName)
    require(binary.exists() && binary.length() > 0L && binary.canExecute()) { "$binaryName ARMv7 absent ou non exécutable" }
    socksPort = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { it.localPort }
    val json = normalizedConfig(profile, upstreamHost, upstreamPort)
    val safeId = profile.optString("id", "profile").replace(Regex("[^A-Za-z0-9_-]"), "_").take(64)
    val file = File(context.filesDir, "xray_${runtimeLabel}_${safeId}.json")
    file.writeText(json.toString())
    configFile = file
    running = true
    try {
      val started = ProcessBuilder(binary.absolutePath, "run", "-c", file.absolutePath).directory(context.filesDir).apply {
        environment()["LD_LIBRARY_PATH"] = context.applicationInfo.nativeLibraryDir
        environment()["HOME"] = context.filesDir.absolutePath
        environment()["TMPDIR"] = context.cacheDir.absolutePath
        redirectErrorStream(true)
      }.start()
      process = started
      thread(isDaemon = true, name = "xray-$runtimeLabel-log") {
        try { started.inputStream.bufferedReader().useLines { lines -> lines.forEach { line -> if (running && line.isNotBlank()) emit("info", "XRAY", "[$runtimeLabel] ${line.take(300)}") } } }
        catch (_: Throwable) { if (running) emit("warning", "XRAY", "[$runtimeLabel] lecture des logs interrompue") }
      }
      val ready = waitForSocks(started, socksPort, 10_000)
      if (!ready) error("Xray $runtimeLabel n’a pas ouvert son SOCKS local")
      emit("info", "XRAY", "[$runtimeLabel] prêt sur 127.0.0.1:$socksPort")
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

  private fun normalizedConfig(profile: JSONObject, upstreamHost: String?, upstreamPort: Int?): JSONObject {
    val raw = when (profile.optString("inputMode", "json")) {
      "link" -> configFromLink(profile.optString("link"))
      else -> profile.optString("json")
    }
    require(raw.trim().startsWith("{")) { "Configuration JSON Xray manquante pour $runtimeLabel" }
    val root = JSONObject(raw)
    val inbounds = root.optJSONArray("inbounds") ?: JSONArray()
    val normalisedInbounds = JSONArray()
    var hasSocks = false
    for (index in 0 until inbounds.length()) {
      val inbound = inbounds.optJSONObject(index) ?: continue
      if (inbound.optString("protocol") == "socks") {
        inbound.put("listen", "127.0.0.1")
        inbound.put("port", socksPort)
        val settings = inbound.optJSONObject("settings") ?: JSONObject()
        settings.put("udp", true)
        inbound.put("settings", settings)
        hasSocks = true
      }
      normalisedInbounds.put(inbound)
    }
    if (!hasSocks) normalisedInbounds.put(JSONObject().put("listen", "127.0.0.1").put("port", socksPort).put("protocol", "socks").put("settings", JSONObject().put("udp", true)))
    root.put("inbounds", normalisedInbounds)
    if (upstreamHost != null && upstreamPort != null) rewriteOutbound(root.optJSONArray("outbounds"), upstreamHost, upstreamPort)
    return root
  }

  private fun rewriteOutbound(outbounds: JSONArray?, host: String, port: Int) {
    if (outbounds == null) return
    for (index in 0 until outbounds.length()) {
      val outbound = outbounds.optJSONObject(index) ?: continue
      val protocol = outbound.optString("protocol")
      if (protocol in setOf("freedom", "blackhole", "dns")) continue
      val settings = outbound.optJSONObject("settings") ?: continue
      settings.optJSONArray("vnext")?.optJSONObject(0)?.let { it.put("address", host).put("port", port) }
      settings.optJSONArray("servers")?.optJSONObject(0)?.let { it.put("address", host).put("port", port) }
      outbound.optJSONObject("streamSettings")?.let { stream: JSONObject ->
        stream.put("security", "none")
        stream.remove("tlsSettings")
        stream.remove("realitySettings")
      }
    }
  }

  private fun configFromLink(link: String): String {
    // Link mode is deliberately constrained to an explicit local JSON conversion for the common
    // vless/trojan forms. VMess remains supported through JSON import because its link is opaque.
    val scheme = link.substringBefore("://").lowercase()
    require(scheme == "vless" || scheme == "trojan") { "Importez les liens $scheme sous forme JSON pour ce profil" }
    val remainder = link.substringAfter("://")
    val credentials = remainder.substringBefore("@").substringBefore("?")
    val destination = remainder.substringAfter("@", "").substringBefore("?")
    val host = destination.substringBefore(":")
    val port = destination.substringAfter(":", "443").toIntOrNull() ?: 443
    require(host.isNotBlank()) { "Lien $scheme incomplet" }
    val outbound = if (scheme == "trojan") JSONObject().put("protocol", "trojan").put("settings", JSONObject().put("servers", JSONArray().put(JSONObject().put("address", host).put("port", port).put("password", credentials)))) else JSONObject().put("protocol", "vless").put("settings", JSONObject().put("vnext", JSONArray().put(JSONObject().put("address", host).put("port", port).put("users", JSONArray().put(JSONObject().put("id", credentials).put("encryption", "none"))))))
    return JSONObject().put("log", JSONObject().put("loglevel", "warning")).put("inbounds", JSONArray()).put("outbounds", JSONArray().put(outbound).put(JSONObject().put("protocol", "freedom").put("tag", "direct"))).toString()
  }

  private fun waitForSocks(active: Process, port: Int, timeoutMs: Long): Boolean {
    val deadline = System.nanoTime() + timeoutMs * 1_000_000L
    while (System.nanoTime() < deadline && active.isAlive) {
      try { Socket().use { it.connect(InetSocketAddress("127.0.0.1", port), 200); return true } } catch (_: Throwable) { Thread.sleep(80) }
    }
    return false
  }
}
