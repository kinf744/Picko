package expo.modules.kighmuvpnnative

import android.content.Context
import android.net.VpnService
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Tunnel V2Ray DNS : DNSTT transporte le flux TCP local tandis que Xray établit
 * le protocole VMess, VLESS ou Trojan à travers ce flux. Chaque instance expose
 * son propre proxy SOCKS afin d’être gérée par LocalSocksBalancer.
 */
class V2RayDnsTunnel(
  private val context: Context,
  private val profile: TunnelProfile,
  private val log: (String, String, String) -> Unit,
) : LocalTunnel {
  override val label: String = profile.name
  override val socksPort: Int = freePort()
  private val dnsttPort: Int = freePort()

  @Volatile private var dnsttProcess: Process? = null
  @Volatile private var xrayProcess: Process? = null
  @Volatile private var configFile: File? = null
  @Volatile private var recovering = false
  private val stopRequested = AtomicBoolean(false)
  @Volatile private var recoveryThread: Thread? = null
  @Volatile private var lastDiagnostic = ""
  @Volatile private var lastDiagnosticAt = 0L

  override fun start() {
    profile.validate()?.let { error(it) }
    stopRequested.set(false)
    recovering = false
    writeConfig()
    try {
      launchComponents()
      compactLog("connection", "V2Ray DNS prêt : DNSTT $dnsttPort, SOCKS $socksPort")
    } catch (error: Throwable) {
      stop()
      throw error
    }
  }

  override fun isHealthy(): Boolean =
    !recovering && dnsttProcess?.isAlive == true && xrayProcess?.isAlive == true &&
      LocalSocksBalancer.hasSocksGreeting(socksPort)

  override fun isRecovering(): Boolean = recovering

  override fun stop() {
    stopRequested.set(true)
    recovering = false
    recoveryThread?.interrupt()
    recoveryThread = null
    destroyComponents()
    try { configFile?.delete() } catch (_: Throwable) {}
    configFile = null
  }

  private fun launchComponents() {
    val dnsttBinary = File(context.applicationInfo.nativeLibraryDir, "libdnstt.so")
    require(dnsttBinary.isFile && dnsttBinary.length() > 0L) { "libdnstt.so absent de l’APK" }
    val xrayBinary = File(context.applicationInfo.nativeLibraryDir, "libxray.so")
    require(xrayBinary.isFile && xrayBinary.length() > 0L) { "libxray.so absent de l’APK" }
    xrayBinary.setExecutable(true)

    startDnstt(dnsttBinary)
    if (!waitForTcp(dnsttPort, DNSTT_START_TIMEOUT_MS)) {
      error("DNSTT n’a pas ouvert son flux local")
    }
    startXray(xrayBinary, configFile ?: error("configuration Xray DNS absente"))
    if (!waitForSocks(socksPort, XRAY_START_TIMEOUT_MS)) {
      error("V2Ray DNS n’a pas ouvert le proxy SOCKS local")
    }
  }

  private fun startDnstt(binary: File) {
    val plan = OpolNative.dnsttPlan(profile, dnsttPort)
    val process = ProcessBuilder(
      binary.absolutePath,
      "-udp", plan.resolver,
      "-pubkey", plan.publicKey,
      plan.nameserver,
      plan.localEndpoint,
    )
      .directory(context.filesDir)
      .redirectErrorStream(true)
      .apply {
        environment()["HOME"] = context.filesDir.absolutePath
        environment()["TMPDIR"] = context.cacheDir.absolutePath
      }
      .start()
    dnsttProcess = process
    observeDnstt(process)
  }

  private fun startXray(binary: File, config: File) {
    val process = ProcessBuilder(binary.absolutePath, "run", "-c", config.absolutePath)
      .directory(context.filesDir)
      .redirectErrorStream(true)
      .apply {
        environment()["HOME"] = context.filesDir.absolutePath
        environment()["TMPDIR"] = context.cacheDir.absolutePath
        environment()["LD_LIBRARY_PATH"] = context.applicationInfo.nativeLibraryDir
      }
      .start()
    xrayProcess = process
    observeXray(process)
  }

  private fun observeDnstt(running: Process) {
    Thread {
      try {
        running.inputStream.bufferedReader().useLines { lines ->
          lines.forEach { line ->
            if (stopRequested.get() || dnsttProcess !== running) return@forEach
            val lower = line.lowercase()
            if (lower.contains("fatal") || lower.contains("error") || lower.contains("failed")) {
              compactLog("warning", "DNSTT a signalé une erreur; reconnexion V2Ray DNS")
              scheduleRecovery()
            }
          }
        }
      } catch (_: Throwable) {
        // La fermeture du processus interrompt normalement la lecture.
      } finally {
        if (!stopRequested.get() && dnsttProcess === running) scheduleRecovery()
      }
    }.apply { isDaemon = true; name = "picko-v2dns-dnstt-${profile.id.takeLast(8)}" }.start()
  }

  private fun observeXray(running: Process) {
    Thread {
      try {
        running.inputStream.bufferedReader().useLines { lines ->
          lines.forEach { line ->
            if (stopRequested.get() || xrayProcess !== running) return@forEach
            val lower = line.lowercase()
            when {
              lower.contains("started") && lower.contains("xray") -> compactLog("info", "Xray DNS démarré")
              lower.contains("fatal") || lower.contains("panic") -> {
                compactLog("warning", "Xray DNS a signalé une erreur critique; reconnexion")
                scheduleRecovery()
              }
            }
          }
        }
      } catch (_: Throwable) {
        // La fermeture du processus interrompt normalement la lecture.
      } finally {
        if (!stopRequested.get() && xrayProcess === running) scheduleRecovery()
      }
    }.apply { isDaemon = true; name = "picko-v2dns-xray-${profile.id.takeLast(8)}" }.start()
  }

  private fun scheduleRecovery() {
    if (stopRequested.get() || recovering) return
    recovering = true
    compactLog("warning", "V2Ray DNS temporairement indisponible; reconnexion automatique")
    recoveryThread = Thread {
      try {
        repeat(MAX_RECOVERY_ATTEMPTS) { index ->
          if (stopRequested.get()) return@Thread
          compactLog("info", "Reconnexion V2Ray DNS ${index + 1}/$MAX_RECOVERY_ATTEMPTS")
          try {
            destroyComponents()
            if (configFile == null) writeConfig()
            launchComponents()
            recovering = false
            compactLog("connection", "V2Ray DNS reconnecté; trafic rétabli")
            return@Thread
          } catch (_: Throwable) {
            destroyComponents()
            if (!stopRequested.get()) Thread.sleep(RECOVERY_DELAY_MS)
          }
        }
        recovering = false
        compactLog("error", "V2Ray DNS ne peut pas se reconnecter après $MAX_RECOVERY_ATTEMPTS tentatives")
      } catch (_: InterruptedException) {
        // Arrêt demandé ou nouveau cycle de récupération.
      } finally {
        if (Thread.currentThread() === recoveryThread) recoveryThread = null
      }
    }.apply { isDaemon = true; name = "picko-v2dns-recovery-${profile.id.takeLast(8)}" }
    recoveryThread?.start()
  }

  private fun destroyComponents() {
    destroyProcess(xrayProcess)
    destroyProcess(dnsttProcess)
    xrayProcess = null
    dnsttProcess = null
  }

  private fun destroyProcess(target: Process?) {
    if (target == null) return
    try { target.outputStream.close() } catch (_: Throwable) {}
    try { target.inputStream.close() } catch (_: Throwable) {}
    try { target.errorStream.close() } catch (_: Throwable) {}
    try { target.destroy() } catch (_: Throwable) {}
    try { if (!target.waitFor(600, TimeUnit.MILLISECONDS)) target.destroyForcibly() } catch (_: Throwable) {}
  }

  private fun waitForTcp(port: Int, timeoutMs: Long): Boolean {
    val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs)
    while (System.nanoTime() < deadline && dnsttProcess?.isAlive == true) {
      try {
        Socket().use { it.connect(InetSocketAddress("127.0.0.1", port), 200) }
        return true
      } catch (_: Throwable) { Thread.sleep(120) }
    }
    return false
  }

  private fun waitForSocks(port: Int, timeoutMs: Long): Boolean {
    val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs)
    while (System.nanoTime() < deadline && xrayProcess?.isAlive == true) {
      if (LocalSocksBalancer.hasSocksGreeting(port)) return true
      Thread.sleep(150)
    }
    return false
  }

  private fun writeConfig() {
    val safeId = profile.id.replace(Regex("[^A-Za-z0-9_-]"), "_")
    configFile = File(context.cacheDir, "v2ray-dns-$safeId.json").also { it.writeText(buildConfig()) }
  }

  private fun buildConfig(): String {
    val runtime = OpolNative.xrayRuntimePolicy(socksPort, dnsttPort, true)
    val root = JSONObject(if (profile.xrayMode == "json") profile.xrayJson else linkToJson(profile.xrayLink))
    normalizeInbounds(root, runtime)
    redirectOutboundsThroughDnstt(root, runtime)
    normalizeRouting(root)
    root.optJSONObject("log")?.put("loglevel", runtime.logLevel) ?: root.put("log", JSONObject().put("loglevel", runtime.logLevel))
    return root.toString()
  }

  private fun normalizeInbounds(root: JSONObject, runtime: OpolNative.XrayRuntimePolicy) {
    val normalized = JSONArray()
    var hasSocks = false
    val inbounds = root.optJSONArray("inbounds")
    if (inbounds != null) {
      for (index in 0 until inbounds.length()) {
        val inbound = inbounds.optJSONObject(index) ?: continue
        if (inbound.optString("protocol") == "socks") {
          inbound.put("listen", runtime.socksListen)
          inbound.put("port", runtime.socksPort)
          inbound.optJSONObject("settings")?.put("udp", true)
          hasSocks = true
        } else if (inbound.optString("listen") == "0.0.0.0") {
          inbound.put("listen", "127.0.0.1")
        }
        normalized.put(inbound)
      }
    }
    if (!hasSocks) normalized.put(
      JSONObject()
        .put("listen", runtime.socksListen)
        .put("port", runtime.socksPort)
        .put("protocol", "socks")
        .put("settings", JSONObject().put("udp", true))
    )
    root.put("inbounds", normalized)
  }

  /** Le serveur réel est atteint au travers de DNSTT local; TLS/Reality ne s’appliquent plus au hop local. */
  private fun redirectOutboundsThroughDnstt(root: JSONObject, runtime: OpolNative.XrayRuntimePolicy) {
    val outbounds = root.optJSONArray("outbounds") ?: return
    for (index in 0 until outbounds.length()) {
      val outbound = outbounds.optJSONObject(index) ?: continue
      val protocol = outbound.optString("protocol")
      val tag = outbound.optString("tag")
      if (protocol in setOf("freedom", "blackhole", "socks") || tag == "direct") continue
      val settings = outbound.optJSONObject("settings")
      settings?.optJSONArray("vnext")?.optJSONObject(0)?.apply {
        put("address", "127.0.0.1")
        put("port", runtime.dnsttPort)
      }
      settings?.optJSONArray("servers")?.optJSONObject(0)?.apply {
        put("address", "127.0.0.1")
        put("port", runtime.dnsttPort)
      }
      outbound.optJSONObject("streamSettings")?.apply {
        put("security", "none")
        remove("tlsSettings")
        remove("realitySettings")
      }
    }
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
  }

  private fun linkToJson(link: String): String {
    val value = link.trim()
    return when {
      value.startsWith("vmess://", true) -> buildFromVmess(value.substringAfter("://"))
      value.startsWith("vless://", true) -> buildFromUri(URI(value), "vless")
      value.startsWith("trojan://", true) -> buildFromUri(URI(value), "trojan")
      else -> error("Lien V2Ray non pris en charge")
    }
  }

  private fun buildFromVmess(encoded: String): String {
    val decoded = try {
      val normalized = encoded.replace("-", "+").replace("_", "/")
      String(Base64.decode(normalized, Base64.DEFAULT or Base64.URL_SAFE), StandardCharsets.UTF_8)
    } catch (_: Throwable) { error("Lien VMess Base64 invalide") }
    val source = try { JSONObject(decoded) } catch (_: Throwable) { error("JSON VMess invalide") }
    val host = source.optString("add").ifBlank { source.optString("host") }
    val port = source.optInt("port", 443)
    val uuid = source.optString("id")
    val transport = source.optString("net", "tcp")
    val path = URLDecoder.decode(source.optString("path", "/"), "UTF-8")
    val sni = source.optString("sni").ifBlank { host }
    val streamHost = source.optString("host").ifBlank { host }
    return baseConfig("vmess", host, port, uuid, "auto", buildStream(transport, path, streamHost, source.optString("tls"), sni, "", ""))
  }

  private fun buildFromUri(uri: URI, protocol: String): String {
    val query = queryMap(uri.rawQuery)
    val host = uri.host ?: error("Serveur V2Ray absent")
    val port = if (uri.port > 0) uri.port else 443
    val transport = query["type"] ?: query["network"] ?: "tcp"
    val security = query["security"] ?: "none"
    val streamPath = query["path"] ?: query["serviceName"] ?: "/"
    val sni = query["sni"] ?: query["host"] ?: host
    val streamHost = query["host"] ?: sni
    val stream = buildStream(transport, streamPath, streamHost, security, sni, query["pbk"] ?: "", query["sid"] ?: "", query["fp"] ?: "chrome")
    val credential = if (protocol == "trojan") uri.userInfo.orEmpty() else uri.userInfo.orEmpty().substringBefore(":")
    val result = JSONObject(baseConfig(protocol, host, port, credential, "none", stream))
    val flow = query["flow"].orEmpty()
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
    val target = when (protocol) {
      "trojan" -> JSONObject().put("address", host).put("port", port).put("password", credential)
      else -> JSONObject().put("address", host).put("port", port).put("users", JSONArray().put(JSONObject().put("id", credential).put("alterId", 0).put("security", encryption).put("encryption", "none")))
    }
    val settings = if (protocol == "trojan") JSONObject().put("servers", JSONArray().put(target)) else JSONObject().put("vnext", JSONArray().put(target))
    val outbound = JSONObject().put("protocol", protocol).put("settings", settings).put("streamSettings", stream).put("mux", JSONObject().put("enabled", false))
    return JSONObject()
      .put("log", JSONObject().put("loglevel", "warning"))
      .put("inbounds", JSONArray())
      .put("outbounds", JSONArray().put(outbound).put(JSONObject().put("protocol", "freedom").put("tag", "direct")))
      .put("routing", JSONObject().put("rules", JSONArray()))
      .toString()
  }

  private fun buildStream(transport: String, path: String, host: String, securityValue: String, sni: String, publicKey: String, shortId: String, fingerprint: String = "chrome"): JSONObject {
    val network = when (transport.lowercase()) {
      "websocket" -> "ws"
      "mkcp" -> "kcp"
      "raw" -> "tcp"
      else -> transport.lowercase()
    }
    val security = when (securityValue.lowercase()) {
      "reality" -> "reality"
      "tls" -> "tls"
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
      "kcp" -> stream.put("kcpSettings", JSONObject().put("mtu", 1350).put("tti", 20).put("uplinkCapacity", 5).put("downlinkCapacity", 20).put("congestion", false).put("readBufferSize", 2).put("writeBufferSize", 2).put("header", JSONObject().put("type", "none")).put("seed", host))
      "tcp" -> stream.put("tcpSettings", JSONObject().put("header", JSONObject().put("type", "none")))
    }
    if (security == "reality") stream.put("realitySettings", JSONObject().put("serverName", sni.ifBlank { host }).put("fingerprint", fingerprint).put("publicKey", publicKey).put("shortId", shortId))
    else if (security == "tls") stream.put("tlsSettings", JSONObject().put("serverName", sni.ifBlank { host }).put("fingerprint", fingerprint).put("allowInsecure", true))
    return stream
  }

  private fun compactLog(level: String, message: String) {
    val now = System.currentTimeMillis()
    if (message == lastDiagnostic && now - lastDiagnosticAt < LOG_DEDUP_MS) return
    lastDiagnostic = message
    lastDiagnosticAt = now
    log(level, "V2RAY DNS", message.take(180))
  }

  private fun freePort(): Int = try { ServerSocket(0).use { it.localPort } } catch (_: Throwable) { 10808 }

  companion object {
    private const val DNSTT_START_TIMEOUT_MS = 10_000L
    private const val XRAY_START_TIMEOUT_MS = 9_000L
    private const val MAX_RECOVERY_ATTEMPTS = 15
    private const val RECOVERY_DELAY_MS = 2_000L
    private const val LOG_DEDUP_MS = 5_000L
  }
}
