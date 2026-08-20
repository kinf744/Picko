package expo.modules.kighmuvpnnative

import android.net.VpnService
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.ServerSocket
import java.net.Socket
import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

class XrayTunnel(
  private val service: VpnService,
  private val profile: TunnelProfile,
  private val log: (String, String, String) -> Unit,
) : LocalTunnel {
  override val label: String = profile.name
  override var socksPort: Int = 0
    private set

  private var process: Process? = null
  private var configFile: File? = null

  override fun start() {
    profile.validate()?.let { error(it) }
    socksPort = freePort()
    val binary = File(service.applicationInfo.nativeLibraryDir, "libxray.so")
    if (!binary.exists()) error("libxray.so introuvable dans l’APK")
    binary.setExecutable(true)
    configFile = File(service.cacheDir, "xray-${profile.id.replace(Regex("[^A-Za-z0-9_-]"), "_")}.json")
    configFile!!.writeText(buildConfig())
    log("connection", "XRAY", "Démarrage de ${profile.name} sur SOCKS 127.0.0.1:$socksPort")
    val started = ProcessBuilder(binary.absolutePath, "run", "-c", configFile!!.absolutePath)
      .redirectErrorStream(true)
      .apply {
        environment()["HOME"] = service.filesDir.absolutePath
        environment()["TMPDIR"] = service.cacheDir.absolutePath
        environment()["LD_LIBRARY_PATH"] = service.applicationInfo.nativeLibraryDir
      }
      .start()
    process = started
    Thread {
      try {
        started.inputStream.bufferedReader().forEachLine { line ->
          if (line.isNotBlank() && line.length <= 500) {
            val lower = line.lowercase()
            when {
              lower.contains("started") && lower.contains("xray") -> log("info", "XRAY", "Xray démarré pour ${profile.name}")
              lower.contains("fatal") || lower.contains("panic") -> log("error", "XRAY", line.take(240))
            }
          }
        }
      } catch (_: Throwable) {}
    }.apply { isDaemon = true; name = "xray-log-${profile.id}"; start() }
    var ready = false
    repeat(30) {
      if (!ready) {
        Thread.sleep(200)
        ready = canConnect()
      }
    }
    if (!ready) {
      val exit = try { started.exitValue().toString() } catch (_: Throwable) { "actif" }
      stop()
      error("Xray n’a pas ouvert son proxy SOCKS dans le délai imparti (processus $exit)")
    }
    log("info", "XRAY", "Proxy SOCKS Xray prêt pour ${profile.name}")
  }

  override fun isHealthy(): Boolean = process?.isAlive == true && canConnect()

  override fun stop() {
    try { process?.inputStream?.close() } catch (_: Throwable) {}
    try { process?.destroyForcibly() } catch (_: Throwable) {}
    process = null
    try { configFile?.delete() } catch (_: Throwable) {}
    configFile = null
    socksPort = 0
  }

  private fun canConnect(): Boolean = try {
    Socket().use { socket -> socket.connect(java.net.InetSocketAddress("127.0.0.1", socksPort), 250) }
    true
  } catch (_: Throwable) { false }

  private fun freePort(): Int = try { ServerSocket(0).use { it.localPort } } catch (_: Throwable) { 10808 }

  private fun buildConfig(): String {
    val raw = if (profile.xrayMode == "json") profile.xrayJson else linkToJson(profile.xrayLink)
    val root = JSONObject(raw)
    normalizeInbounds(root)
    normalizeRouting(root)
    root.optJSONArray("outbounds")?.let { outbounds ->
      for (index in 0 until outbounds.length()) {
        val outbound = outbounds.optJSONObject(index) ?: continue
        val stream = outbound.optJSONObject("streamSettings") ?: continue
        stream.optJSONObject("tlsSettings")?.remove("allowInsecure")
        outbound.put("streamSettings", stream)
      }
    }
    return root.toString()
  }

  private fun normalizeInbounds(root: JSONObject) {
    val result = JSONArray()
    var hasSocks = false
    val inbounds = root.optJSONArray("inbounds")
    if (inbounds != null) {
      for (index in 0 until inbounds.length()) {
        val inbound = inbounds.optJSONObject(index) ?: continue
        if (inbound.optString("protocol") == "socks") {
          inbound.put("listen", "127.0.0.1")
          inbound.put("port", socksPort)
          hasSocks = true
        } else if (inbound.optString("listen") == "0.0.0.0") {
          inbound.put("listen", "127.0.0.1")
        }
        result.put(inbound)
      }
    }
    if (!hasSocks) {
      result.put(JSONObject().put("listen", "127.0.0.1").put("port", socksPort).put("protocol", "socks").put("settings", JSONObject().put("udp", true)))
    }
    root.put("inbounds", result)
  }

  private fun normalizeRouting(root: JSONObject) {
    val routing = root.optJSONObject("routing") ?: return
    val rules = routing.optJSONArray("rules") ?: return
    val cleaned = JSONArray()
    for (index in 0 until rules.length()) {
      val rule = rules.optJSONObject(index) ?: continue
      val ip = rule.optJSONArray("ip")?.toString().orEmpty()
      val domain = rule.optJSONArray("domain")?.toString().orEmpty()
      if (!ip.contains("geoip:") && !domain.contains("geosite:")) cleaned.put(rule)
    }
    routing.put("rules", cleaned)
    root.put("routing", routing)
  }

  private fun linkToJson(link: String): String {
    val value = link.trim()
    return when {
      value.startsWith("vmess://", true) -> buildFromVmess(value.removePrefix("vmess://"))
      value.startsWith("vless://", true) -> buildFromUri(URI(value), "vless")
      value.startsWith("trojan://", true) -> buildFromUri(URI(value), "trojan")
      else -> error("Lien Xray non pris en charge")
    }
  }

  private fun buildFromVmess(encoded: String): String {
    val decoded = try {
      val normalized = encoded.replace("-", "+").replace("_", "/")
      String(Base64.decode(normalized, Base64.DEFAULT or Base64.URL_SAFE), StandardCharsets.UTF_8)
    } catch (_: Throwable) { error("Lien VMess Base64 invalide") }
    val source = try { JSONObject(decoded) } catch (_: Throwable) { error("JSON VMess invalide") }
    val protocol = "vmess"
    val host = source.optString("add").ifBlank { source.optString("host") }
    val port = source.optInt("port", 443)
    val uuid = source.optString("id")
    val transport = source.optString("net", "tcp")
    val stream = buildStream(transport, source.optString("path", "/"), source.optString("host"), source.optString("tls"), source.optString("sni"), "", "")
    return baseConfig(protocol, host, port, uuid, "auto", stream)
  }

  private fun buildFromUri(uri: URI, protocol: String): String {
    val query = queryMap(uri.rawQuery)
    val host = uri.host ?: error("Serveur Xray absent")
    val port = if (uri.port > 0) uri.port else 443
    val user = URLDecoder.decode(uri.userInfo.orEmpty(), "UTF-8")
    val transport = query["type"] ?: query["network"] ?: "tcp"
    val stream = buildStream(transport, query["path"] ?: "/", query["host"] ?: "", query["security"] ?: "none", query["sni"] ?: "", query["pbk"] ?: "", query["sid"] ?: "", query["fp"] ?: "chrome")
    val uuidOrPassword = if (protocol == "trojan") user else user.substringBefore(":")
    val flow = query["flow"].orEmpty()
    val result = JSONObject(baseConfig(protocol, host, port, uuidOrPassword, "none", stream))
    if (flow.isNotBlank() && protocol == "vless") {
      result.optJSONArray("outbounds")?.optJSONObject(0)?.optJSONObject("settings")?.optJSONArray("vnext")?.optJSONObject(0)?.optJSONArray("users")?.optJSONObject(0)?.put("flow", flow)
    }
    return result.toString()
  }

  private fun queryMap(raw: String?): Map<String, String> = raw.orEmpty().split('&').mapNotNull { part ->
    val pieces = part.split('=', limit = 2)
    if (pieces.size == 2) URLDecoder.decode(pieces[0], "UTF-8") to URLDecoder.decode(pieces[1], "UTF-8") else null
  }.toMap()

  private fun baseConfig(protocol: String, host: String, port: Int, credential: String, encryption: String, stream: JSONObject): String {
    val users = when (protocol) {
      "trojan" -> JSONObject().put("address", host).put("port", port).put("password", credential)
      else -> JSONObject().put("address", host).put("port", port).put("users", JSONArray().put(JSONObject().put("id", credential).put("alterId", 0).put("security", encryption).put("encryption", "none")))
    }
    val settings = if (protocol == "trojan") JSONObject().put("servers", JSONArray().put(users)) else JSONObject().put("vnext", JSONArray().put(users))
    val outbound = JSONObject().put("protocol", protocol).put("settings", settings).put("streamSettings", stream)
    return JSONObject().put("log", JSONObject().put("loglevel", "warning")).put("inbounds", JSONArray()).put("outbounds", JSONArray().put(outbound).put(JSONObject().put("protocol", "freedom").put("tag", "direct"))).put("routing", JSONObject().put("rules", JSONArray())).toString()
  }

  private fun buildStream(transport: String, path: String, host: String, securityValue: String, sni: String, publicKey: String, shortId: String, fingerprint: String = "chrome"): JSONObject {
    val network = when (transport.lowercase()) {
      "websocket" -> "ws"
      "mkcp" -> "kcp"
      else -> transport.lowercase()
    }
    val stream = JSONObject().put("network", network).put("security", if (publicKey.isNotBlank()) "reality" else if (securityValue == "tls" || securityValue == "reality") "tls" else "none")
    when (network) {
      "ws" -> stream.put("wsSettings", JSONObject().put("path", path.ifBlank { "/" }).put("headers", JSONObject().put("Host", host)))
      "grpc" -> stream.put("grpcSettings", JSONObject().put("serviceName", path.trim('/')))
      "xhttp", "splithttp" -> stream.put("xhttpSettings", JSONObject().put("path", path.ifBlank { "/" }).put("host", host).put("mode", "auto"))
      "h2", "http" -> stream.put("httpSettings", JSONObject().put("path", path.ifBlank { "/" }).put("host", JSONArray().put(host)))
      "httpupgrade" -> stream.put("httpupgradeSettings", JSONObject().put("path", path.ifBlank { "/" }).put("host", host))
      "kcp" -> stream.put("kcpSettings", JSONObject().put("mtu", 1350).put("tti", 20).put("header", JSONObject().put("type", "none")))
      "tcp" -> stream.put("tcpSettings", JSONObject().put("header", JSONObject().put("type", "none")))
    }
    if (stream.optString("security") == "reality") stream.put("realitySettings", JSONObject().put("serverName", sni.ifBlank { host }).put("fingerprint", fingerprint).put("publicKey", publicKey).put("shortId", shortId))
    else if (stream.optString("security") == "tls") stream.put("tlsSettings", JSONObject().put("serverName", sni.ifBlank { host }).put("fingerprint", fingerprint).put("allowInsecure", true))
    return stream
  }
}
