package expo.modules.kighmuvpnnative

import android.net.VpnService
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.ServerSocket
import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

/**
 * Tunnel Xray direct. Il exécute exclusivement libxray.so avec une configuration
 * locale normalisée : un seul inbound SOCKS sur loopback et les outbounds fournis
 * par le profil VMess, VLESS, Trojan ou JSON.
 */
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
  @Volatile private var lastReportedIssue = ""
  @Volatile private var lastReportedIssueAt = 0L

  override fun start() {
    profile.validate()?.let { error(it) }
    check(process == null) { "Xray est déjà démarré pour ce profil" }

    socksPort = freePort()
    val binary = File(service.applicationInfo.nativeLibraryDir, "libxray.so")
    check(binary.isFile && binary.length() > 0L) { "libxray.so est absent de l’APK" }
    binary.setExecutable(true)

    val safeId = profile.id.replace(Regex("[^A-Za-z0-9_-]"), "_")
    configFile = File(service.cacheDir, "xray-$safeId.json")
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
    consumeProcessLog(started)

    var ready = false
    repeat(30) {
      if (!ready) {
        Thread.sleep(200)
        ready = LocalSocksBalancer.hasSocksGreeting(socksPort)
      }
    }
    if (!ready) {
      val exit = try { started.exitValue().toString() } catch (_: Throwable) { "actif" }
      stop()
      error("Xray n’a pas ouvert son proxy SOCKS dans le délai imparti (processus $exit)")
    }
    log("info", "XRAY", "Proxy SOCKS Xray prêt pour ${profile.name}")
  }

  override fun isHealthy(): Boolean = process?.isAlive == true && LocalSocksBalancer.hasSocksGreeting(socksPort)

  override fun stop() {
    val current = process
    try { current?.inputStream?.close() } catch (_: Throwable) {}
    try { current?.destroy() } catch (_: Throwable) {}
    try {
      if (current?.isAlive == true) {
        Thread.sleep(150)
        if (current.isAlive) current.destroyForcibly()
      }
    } catch (_: Throwable) {}
    process = null
    try { configFile?.delete() } catch (_: Throwable) {}
    configFile = null
    socksPort = 0
  }

  private fun consumeProcessLog(started: Process) {
    Thread {
      try {
        started.inputStream.bufferedReader().forEachLine { line ->
          val normalized = line.trim()
          if (normalized.isBlank() || normalized.length > 700) return@forEachLine
          val lower = normalized.lowercase()
          when {
            lower.contains("failed to read request") && lower.contains("eof") -> Unit
            lower.contains("started") && lower.contains("xray") -> log("info", "XRAY", "Xray démarré pour ${profile.name}")
            lower.contains("fatal") || lower.contains("panic") || lower.contains("failed") || lower.contains("error") -> reportIssue(normalized)
          }
        }
      } catch (_: Throwable) {
        // L’arrêt volontaire ferme le flux standard du processus.
      }
    }.apply {
      isDaemon = true
      name = "xray-log-${profile.id}"
      start()
    }
  }

  private fun reportIssue(message: String) {
    val now = System.currentTimeMillis()
    if (message == lastReportedIssue && now - lastReportedIssueAt < 2_000L) return
    lastReportedIssue = message
    lastReportedIssueAt = now
    log("error", "XRAY", message.take(320))
  }

  private fun freePort(): Int = try {
    ServerSocket(0).use { it.localPort }
  } catch (_: Throwable) {
    10808
  }

  private fun buildConfig(): String {
    val runtime = OpolNative.xrayRuntimePolicy(socksPort)
    val root = if (profile.xrayMode == "json") {
      try {
        JSONObject(profile.xrayJson)
      } catch (_: Throwable) {
        error("JSON Xray invalide")
      }
    } else {
      JSONObject(linkToJson(profile.xrayLink, runtime))
    }

    val outbounds = root.optJSONArray("outbounds")
    require(outbounds != null && outbounds.length() > 0) { "La configuration Xray ne contient aucun outbound" }
    normalizeInbounds(root, runtime)
    normalizeOutbounds(root, runtime)
    normalizeRouting(root, runtime)
    root.optJSONObject("log")?.put("loglevel", runtime.logLevel)
      ?: root.put("log", JSONObject().put("loglevel", runtime.logLevel))
    return root.toString()
  }

  /** Garantit un unique SOCKS local complet, sans modifier les outbounds du profil. */
  private fun normalizeInbounds(root: JSONObject, runtime: OpolNative.XrayRuntimePolicy) {
    val normalized = JSONArray()
    var socksConfigured = false
    val current = root.optJSONArray("inbounds")
    if (current != null) {
      for (index in 0 until current.length()) {
        val inbound = current.optJSONObject(index) ?: continue
        if (inbound.optString("protocol").equals("socks", ignoreCase = true)) {
          if (socksConfigured) continue
          inbound.put("listen", runtime.socksListen)
          inbound.put("port", runtime.socksPort)
          val settings = inbound.optJSONObject("settings") ?: JSONObject()
          settings.put("auth", "noauth")
          settings.put("udp", true)
          inbound.put("settings", settings)
          inbound.put("sniffing", JSONObject().put("enabled", false))
          socksConfigured = true
        } else if (inbound.optString("listen") == "0.0.0.0") {
          inbound.put("listen", "127.0.0.1")
        }
        normalized.put(inbound)
      }
    }
    if (!socksConfigured) {
      normalized.put(
        JSONObject()
          .put("listen", runtime.socksListen)
          .put("port", runtime.socksPort)
          .put("protocol", "socks")
          .put("settings", JSONObject().put("auth", "noauth").put("udp", true))
          .put("sniffing", JSONObject().put("enabled", false)),
      )
    }
    root.put("inbounds", normalized)
  }

  private fun normalizeOutbounds(root: JSONObject, runtime: OpolNative.XrayRuntimePolicy) {
    val outbounds = root.optJSONArray("outbounds") ?: return
    for (index in 0 until outbounds.length()) {
      val outbound = outbounds.optJSONObject(index) ?: continue
      val stream = outbound.optJSONObject("streamSettings") ?: continue
      if (stream.optString("security").equals("tls", ignoreCase = true)) {
        val tls = stream.optJSONObject("tlsSettings") ?: JSONObject()
        tls.put("allowInsecure", runtime.allowInsecure)
        stream.put("tlsSettings", tls)
        outbound.put("streamSettings", stream)
      }
    }
    root.put("outbounds", outbounds)
  }

  private fun normalizeRouting(root: JSONObject, runtime: OpolNative.XrayRuntimePolicy) {
    val routing = root.optJSONObject("routing") ?: JSONObject()
    val rules = routing.optJSONArray("rules")
    if (rules != null) {
      val cleaned = JSONArray()
      for (index in 0 until rules.length()) {
        val rule = rules.optJSONObject(index) ?: continue
        val ip = rule.optJSONArray("ip")?.toString().orEmpty()
        val domain = rule.optJSONArray("domain")?.toString().orEmpty()
        if (!ip.contains("geoip:") && !domain.contains("geosite:")) cleaned.put(rule)
      }
      routing.put("rules", cleaned)
    }
    routing.put("domainStrategy", runtime.domainStrategy)
    root.put("routing", routing)
  }

  private fun linkToJson(link: String, runtime: OpolNative.XrayRuntimePolicy): String {
    val value = link.trim()
    return when {
      value.startsWith("vmess://", ignoreCase = true) -> buildFromVmess(value.substringAfter("://"), runtime)
      value.startsWith("vless://", ignoreCase = true) -> buildFromUri(value, "vless", runtime)
      value.startsWith("trojan://", ignoreCase = true) -> buildFromUri(value, "trojan", runtime)
      else -> error("Lien Xray non pris en charge : utilisez VMess, VLESS ou Trojan")
    }
  }

  private fun buildFromVmess(encoded: String, runtime: OpolNative.XrayRuntimePolicy): String {
    val normalized = encoded.trim().replace('-', '+').replace('_', '/')
    val padded = normalized + "=".repeat((4 - normalized.length % 4) % 4)
    val decoded = try {
      String(Base64.decode(padded, Base64.DEFAULT), StandardCharsets.UTF_8)
    } catch (_: Throwable) {
      error("Lien VMess Base64 invalide")
    }
    val source = try {
      JSONObject(decoded)
    } catch (_: Throwable) {
      error("Configuration VMess invalide")
    }

    val host = source.optString("add").ifBlank { source.optString("host") }.trim()
    val port = source.optString("port", "443").toIntOrNull()?.takeIf { it in 1..65535 } ?: error("Port VMess invalide")
    val id = source.optString("id").trim()
    require(host.isNotBlank() && id.isNotBlank()) { "Serveur ou identifiant VMess manquant" }
    val transport = source.optString("net", source.optString("type", "tcp"))
    val path = decode(source.optString("path", "/"))
    val sni = source.optString("sni").ifBlank { host }.trim()
    val streamHost = source.optString("host").ifBlank { sni }.trim()
    val stream = buildStream(
      transport = transport,
      path = path,
      host = streamHost,
      securityValue = source.optString("tls", source.optString("security")),
      sni = sni,
      publicKey = source.optString("pbk"),
      shortId = source.optString("sid"),
      fingerprint = source.optString("fp", "chrome"),
      allowInsecure = runtime.allowInsecure,
      alpn = source.optString("alpn"),
    )
    return baseConfig("vmess", host, port, id, source.optString("scy").ifBlank { "auto" }, stream)
  }

  private fun buildFromUri(value: String, protocol: String, runtime: OpolNative.XrayRuntimePolicy): String {
    val uri = try {
      URI(value)
    } catch (_: Throwable) {
      error("Lien $protocol invalide")
    }
    val query = queryMap(uri.rawQuery)
    val host = uri.host?.trim().orEmpty()
    val port = uri.port.takeIf { it in 1..65535 } ?: 443
    val credential = decode(uri.rawUserInfo.orEmpty()).substringBefore(":").trim()
    require(host.isNotBlank() && credential.isNotBlank()) { "Serveur ou identifiant $protocol manquant" }

    val transport = query["type"] ?: query["network"] ?: "tcp"
    val path = query["path"] ?: query["serviceName"] ?: "/"
    val sni = (query["sni"] ?: query["servername"] ?: query["host"] ?: host).trim()
    val streamHost = (query["host"] ?: sni).trim()
    val stream = buildStream(
      transport = transport,
      path = path,
      host = streamHost,
      securityValue = query["security"] ?: "none",
      sni = sni,
      publicKey = query["pbk"] ?: query["publicKey"] ?: "",
      shortId = query["sid"] ?: query["shortId"] ?: "",
      fingerprint = query["fp"] ?: "chrome",
      allowInsecure = runtime.allowInsecure,
      alpn = query["alpn"] ?: "",
    )
    val result = JSONObject(baseConfig(protocol, host, port, credential, "none", stream))
    val flow = query["flow"].orEmpty()
    if (protocol == "vless" && flow.isNotBlank()) {
      result.optJSONArray("outbounds")?.optJSONObject(0)?.optJSONObject("settings")
        ?.optJSONArray("vnext")?.optJSONObject(0)?.optJSONArray("users")?.optJSONObject(0)?.put("flow", flow)
    }
    return result.toString()
  }

  private fun baseConfig(protocol: String, host: String, port: Int, credential: String, encryption: String, stream: JSONObject): String {
    val user = when (protocol) {
      "vmess" -> JSONObject().put("id", credential).put("alterId", 0).put("security", encryption)
      "vless" -> JSONObject().put("id", credential).put("encryption", "none")
      else -> JSONObject()
    }
    val settings = when (protocol) {
      "trojan" -> JSONObject().put("servers", JSONArray().put(JSONObject().put("address", host).put("port", port).put("password", credential)))
      else -> JSONObject().put("vnext", JSONArray().put(JSONObject().put("address", host).put("port", port).put("users", JSONArray().put(user))))
    }
    val outbound = JSONObject()
      .put("tag", "proxy")
      .put("protocol", protocol)
      .put("settings", settings)
      .put("streamSettings", stream)
      .put("mux", JSONObject().put("enabled", false))
    return JSONObject()
      .put("log", JSONObject().put("loglevel", "warning"))
      .put("inbounds", JSONArray())
      .put("outbounds", JSONArray().put(outbound).put(JSONObject().put("tag", "direct").put("protocol", "freedom")))
      .put("routing", JSONObject().put("domainStrategy", "AsIs").put("rules", JSONArray()))
      .toString()
  }

  private fun buildStream(
    transport: String,
    path: String,
    host: String,
    securityValue: String,
    sni: String,
    publicKey: String,
    shortId: String,
    fingerprint: String,
    allowInsecure: Boolean,
    alpn: String,
  ): JSONObject {
    val network = when (transport.trim().lowercase()) {
      "websocket" -> "ws"
      "mkcp" -> "kcp"
      "raw" -> "tcp"
      else -> transport.trim().lowercase().ifBlank { "tcp" }
    }
    val security = when (securityValue.trim().lowercase()) {
      "tls" -> "tls"
      "reality" -> "reality"
      else -> "none"
    }
    val stream = JSONObject().put("network", network).put("security", security)
    when (network) {
      "ws" -> stream.put("wsSettings", JSONObject().put("path", path.ifBlank { "/" }).put("headers", JSONObject().put("Host", host)))
      "grpc" -> stream.put("grpcSettings", JSONObject().put("serviceName", path.trim('/')).put("multiMode", false))
      "xhttp" -> stream.put("xhttpSettings", JSONObject().put("path", path.ifBlank { "/" }).put("host", host).put("mode", "stream-up"))
      "splithttp" -> stream.put("splithttpSettings", JSONObject().put("path", path.ifBlank { "/" }).put("host", host).put("mode", "stream-up"))
      "h2", "http" -> stream.put("httpSettings", JSONObject().put("path", path.ifBlank { "/" }).put("host", JSONArray().put(host)))
      "httpupgrade" -> stream.put("httpupgradeSettings", JSONObject().put("path", path.ifBlank { "/" }).put("host", host))
      "kcp" -> stream.put("kcpSettings", JSONObject().put("header", JSONObject().put("type", "none")).put("seed", host))
      "tcp" -> stream.put("tcpSettings", JSONObject().put("header", JSONObject().put("type", "none")))
    }
    when (security) {
      "reality" -> stream.put("realitySettings", JSONObject().put("serverName", sni.ifBlank { host }).put("fingerprint", fingerprint.ifBlank { "chrome" }).put("publicKey", publicKey).put("shortId", shortId))
      "tls" -> {
        val tls = JSONObject()
          .put("serverName", sni.ifBlank { host })
          .put("fingerprint", fingerprint.ifBlank { "chrome" })
          .put("allowInsecure", allowInsecure)
        val protocols = alpn.split(',').map { it.trim() }.filter { it.isNotBlank() }
        if (protocols.isNotEmpty()) tls.put("alpn", JSONArray(protocols))
        stream.put("tlsSettings", tls)
      }
    }
    return stream
  }

  private fun queryMap(raw: String?): Map<String, String> = raw.orEmpty().split('&').mapNotNull { part ->
    val pieces = part.split('=', limit = 2)
    if (pieces.size != 2) null else decode(pieces[0]) to decode(pieces[1])
  }.toMap()

  private fun decode(value: String): String = try {
    URLDecoder.decode(value, "UTF-8")
  } catch (_: Throwable) {
    value
  }
}
