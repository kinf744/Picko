package expo.modules.kighmuvpnnative

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import android.util.Base64
import java.io.File
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
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
    stripGeoSiteRules(root)
    return root
  }

  private fun stripGeoSiteRules(root: JSONObject) {
    // xray-core fat binaries do not ship geoip.dat/geosite.dat; rules referencing them
    // make xray fail to start (or drop traffic). Drop them, mirroring Zamois-tun.
    val routing = root.optJSONObject("routing") ?: return
    val rules = routing.optJSONArray("rules") ?: return
    val cleaned = JSONArray()
    for (index in 0 until rules.length()) {
      val rule = rules.optJSONObject(index) ?: continue
      val ip = rule.optJSONArray("ip")?.toString() ?: ""
      val domain = rule.optJSONArray("domain")?.toString() ?: ""
      if (!ip.contains("geoip:") && !domain.contains("geosite:")) cleaned.put(rule)
    }
    routing.put("rules", cleaned)
    root.put("routing", routing)
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
      // The outbound now targets the local dnstt tunnel: TLS/Reality handshakes must be
      // disabled or xray would try a TLS/Reality handshake with dnstt itself (Zamois-tun pattern).
      val stream = outbound.optJSONObject("streamSettings")
      if (stream != null) {
        stream.put("security", "none")
        stream.remove("tlsSettings")
        stream.remove("realitySettings")
        outbound.put("streamSettings", stream)
      }
    }
  }

  private fun configFromLink(link: String): String {
    val scheme = link.substringBefore("://").lowercase()
    require(scheme in setOf("vmess", "vless", "trojan")) { "Utilisez un lien VMess, VLESS ou Trojan" }
    if (scheme == "vmess") {
      val encoded = link.substringAfter("://").substringBefore("#").trim()
      val decoded = try { String(Base64.decode(encoded, Base64.DEFAULT), Charsets.UTF_8) } catch (_: Throwable) { "" }
      val source = try { JSONObject(decoded) } catch (_: Throwable) { throw IllegalArgumentException("Lien VMess invalide") }
      val host = source.optString("add").trim()
      val port = source.optString("port", "443").toIntOrNull() ?: 443
      val id = source.optString("id").trim()
      require(host.isNotBlank() && id.isNotBlank()) { "Lien VMess incomplet" }
      val user = JSONObject().put("id", id).put("security", source.optString("scy", "auto").ifBlank { "auto" })
      if (source.optString("flow").isNotBlank()) user.put("flow", source.optString("flow"))
      val outbound = JSONObject().put("protocol", "vmess").put("settings", JSONObject().put("vnext", JSONArray().put(JSONObject().put("address", host).put("port", port).put("users", JSONArray().put(user)))))
      applyLinkTransport(outbound, host, mapOf("type" to source.optString("net"), "path" to source.optString("path"), "host" to source.optString("host"), "sni" to source.optString("sni"), "alpn" to source.optString("alpn"), "tls" to source.optString("tls"), "allowinsecure" to source.optString("allowInsecure")))
      return baseConfig(outbound)
    }
    val withoutFragment = link.substringAfter("://").substringBefore("#")
    val queryText = withoutFragment.substringAfter("?", "")
    val query = parseQuery(queryText)
    val remainder = withoutFragment.substringBefore("?")
    val credentials = URLDecoder.decode(remainder.substringBefore("@").trim(), "UTF-8")
    val destination = remainder.substringAfter("@", "")
    val host = destination.substringBeforeLast(":").ifBlank { destination.substringBefore(":") }
    val port = destination.substringAfterLast(":", "443").toIntOrNull() ?: 443
    require(host.isNotBlank()) { "Lien $scheme incomplet" }
    val outbound = if (scheme == "trojan") {
      JSONObject().put("protocol", "trojan").put("settings", JSONObject().put("servers", JSONArray().put(JSONObject().put("address", host).put("port", port).put("password", credentials))))
    } else {
      val user = JSONObject().put("id", credentials).put("encryption", query["encryption"] ?: "none")
      query["flow"]?.takeIf { it.isNotBlank() }?.let { user.put("flow", it) }
      JSONObject().put("protocol", "vless").put("settings", JSONObject().put("vnext", JSONArray().put(JSONObject().put("address", host).put("port", port).put("users", JSONArray().put(user)))))
    }
    applyLinkTransport(outbound, host, query)
    return baseConfig(outbound)
  }

  private fun baseConfig(outbound: JSONObject): String = JSONObject().put("log", JSONObject().put("loglevel", "warning")).put("inbounds", JSONArray()).put("outbounds", JSONArray().put(outbound).put(JSONObject().put("protocol", "freedom").put("tag", "direct"))).toString()

  private fun parseQuery(raw: String): Map<String, String> = raw.split("&").mapNotNull { part ->
    if (part.isBlank()) null else {
      val key = URLDecoder.decode(part.substringBefore("="), "UTF-8").lowercase()
      val value = URLDecoder.decode(part.substringAfter("=", ""), "UTF-8")
      key to value
    }
  }.toMap()

  private fun applyLinkTransport(outbound: JSONObject, host: String, query: Map<String, String>) {
    val stream = outbound.optJSONObject("streamSettings") ?: JSONObject()
    val network = (query["type"] ?: query["net"]).orEmpty().ifBlank { "tcp" }.lowercase()
    stream.put("network", network)
    val securityParam = (query["security"]).orEmpty().lowercase()
    val tlsParam = (query["tls"]).orEmpty().lowercase()
    val security = when {
      securityParam.isNotBlank() -> securityParam
      tlsParam == "tls" || tlsParam == "1" || tlsParam == "true" -> "tls"
      else -> "none"
    }
    stream.put("security", security)
    when (security) {
      "tls" -> {
        val tls = stream.optJSONObject("tlsSettings") ?: JSONObject()
        tls.put("serverName", query["sni"] ?: query["host"] ?: host)
        if (query["alpn"].orEmpty().isNotBlank()) tls.put("alpn", JSONArray(query["alpn"]!!.split(",")))
        if (query["allowinsecure"] == "1" || query["allowinsecure"].equals("true", true)) tls.put("allowInsecure", true)
        stream.put("tlsSettings", tls)
      }
      "reality" -> {
        val reality = stream.optJSONObject("realitySettings") ?: JSONObject()
        reality.put("serverName", query["sni"] ?: query["host"] ?: host)
        query["fp"]?.takeIf { it.isNotBlank() }?.let { reality.put("fingerprint", it) }
        query["pbk"]?.takeIf { it.isNotBlank() }?.let { reality.put("publicKey", it) }
        query["sid"]?.takeIf { it.isNotBlank() }?.let { reality.put("shortId", it) }
        stream.put("realitySettings", reality)
      }
    }
    when (network) {
      "ws", "websocket" -> {
        val ws = JSONObject().put("path", query["path"] ?: "/")
        (query["host"] ?: query["hostheader"])?.takeIf { it.isNotBlank() }?.let { ws.put("headers", JSONObject().put("Host", it)) }
        stream.put("wsSettings", ws)
      }
      "grpc" -> stream.put("grpcSettings", JSONObject().put("serviceName", query["servicename"] ?: ""))
      "http", "h2" -> stream.put("httpSettings", JSONObject().put("path", query["path"] ?: "/").put("host", JSONArray().put(query["host"] ?: host)))
    }
    outbound.put("streamSettings", stream)
  }

  private fun waitForSocks(active: Process, port: Int, timeoutMs: Long): Boolean {
    val deadline = System.nanoTime() + timeoutMs * 1_000_000L
    while (System.nanoTime() < deadline && active.isAlive) {
      try { Socket().use { it.connect(InetSocketAddress("127.0.0.1", port), 200); return true } } catch (_: Throwable) { Thread.sleep(80) }
    }
    return false
  }
}
