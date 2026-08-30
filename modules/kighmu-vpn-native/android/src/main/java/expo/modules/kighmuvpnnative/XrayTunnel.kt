package expo.modules.kighmuvpnnative

import android.net.VpnService
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.ServerSocket

/** Exécution Android du tunnel Xray ; parsing et génération des liens sont natifs. */
class XrayTunnel(
  private val service: VpnService,
  private val profile: TunnelProfile,
  private val log: (String, String, String) -> Unit,
  private val dnsServers: List<String> = emptyList(),
) : LocalTunnel {
  override val label: String = profile.name
  override var socksPort: Int = 0
    private set

  private var process: Process? = null
  private var configFile: File? = null
  @Volatile private var lastReportedIssue = ""
  @Volatile private var lastReportedIssueAt = 0L

  override fun start() {
    FileLogger.init(service); FileLogger.header(service, profile)
    FileLogger.log(service, "XRAY", "=== START Xray profil=${profile.name} id=${profile.id} mode=${profile.xrayMode} link=${profile.xrayLink.take(120)} socksPort TBD ===")
    profile.validate()?.let { FileLogger.log(service, "XRAY", "VALIDATE ERROR: $it"); error(it) }
    check(process == null) { "Xray est déjà démarré pour ce profil" }
    socksPort = freePort()
    val binary = File(service.applicationInfo.nativeLibraryDir, "libxray.so")
    FileLogger.log(service, "XRAY", "Binary: ${binary.absolutePath} exists=${binary.isFile} size=${binary.length()} nativeDir=${service.applicationInfo.nativeLibraryDir} socksPort=$socksPort Download=${FileLogger.getPath(service)}")
    check(binary.isFile && binary.length() > 0L) { "libxray.so est absent de l’APK" }
    binary.setExecutable(true)
    val safeId = profile.id.replace(Regex("[^A-Za-z0-9_-]"), "_")
    configFile = File(service.cacheDir, "xray-$safeId.json")
    val cfg = buildConfig()
    configFile!!.writeText(cfg)
    FileLogger.log(service, "XRAY", "Config écrite: ${configFile!!.absolutePath} len=${cfg.length}")
    FileLogger.logXrayJson(service, "XRAY", cfg)
    log("connection", "XRAY", "Xray")
    val started = ProcessBuilder(binary.absolutePath, "run", "-c", configFile!!.absolutePath)
      .redirectErrorStream(true)
      .apply {
        environment()["HOME"] = service.filesDir.absolutePath
        environment()["TMPDIR"] = service.cacheDir.absolutePath
        environment()["LD_LIBRARY_PATH"] = service.applicationInfo.nativeLibraryDir
      }.start()
    process = started
    FileLogger.log(service, "XRAY", "Process Xray démarré: ${binary.absolutePath} run -c ${configFile!!.absolutePath} HOME=${service.filesDir.absolutePath}")
    consumeProcessLog(started)
    var ready = false
    repeat(30) {
      if (!ready) { Thread.sleep(200); ready = LocalSocksBalancer.hasSocksGreeting(socksPort) }
    }
    if (!ready) {
      val exit = try { started.exitValue().toString() } catch (_: Throwable) { "actif" }
      FileLogger.log(service, "XRAY", "SOCKS TIMEOUT: 127.0.0.1:$socksPort non joignable après 6s exit=$exit - cause fréquente Trojan/VMess: lien invalide, TLS/Reality mismatch, host/port bloqué")
      stop()
      error("Xray n’a pas ouvert son proxy SOCKS dans le délai imparti (processus $exit)")
    }
    FileLogger.log(service, "XRAY", "SOCKS OK 127.0.0.1:$socksPort prêt pour ${profile.name}")
    dnsServers.forEach { log("connection", "XRAY", "DNS $it") }
    log("success", "XRAY", "Connected")
  }

  override fun isHealthy(): Boolean = process?.isAlive == true && LocalSocksBalancer.hasSocksGreeting(socksPort)

  override fun stop() {
    val current = process
    try { current?.inputStream?.close() } catch (_: Throwable) {}
    try { current?.destroy() } catch (_: Throwable) {}
    try { if (current?.isAlive == true) { Thread.sleep(150); if (current.isAlive) current.destroyForcibly() } } catch (_: Throwable) {}
    process = null
    try { configFile?.delete() } catch (_: Throwable) {}
    configFile = null
    socksPort = 0
  }

  private fun consumeProcessLog(started: Process) {
    Thread {
      try {
        started.inputStream.bufferedReader().forEachLine { raw ->
          val normalized = raw.trim()
          if (normalized.isBlank() || normalized.length > 2000) return@forEachLine
          val lower = normalized.lowercase()
          // Filtre anti-verbeux: ignore keepalive/eof, ne log RAW que sur erreurs importantes
          if (lower.contains("failed to read request") && lower.contains("eof")) return@forEachLine
          if (lower.contains("failed to read request") || lower.contains("rejected proxy/socks")) return@forEachLine
          // Log fichier filtré: seulement erreurs/start, pas chaque ligne verbeuse
          val isImportant = lower.contains("started") || lower.contains("fatal") || lower.contains("panic") || lower.contains("failed") || lower.contains("error") || lower.contains("timeout") || lower.contains("rejected") || lower.contains("handshake")
          if (isImportant && normalized.isNotBlank()) FileLogger.log(service, "XRAY", normalized.take(800))
          when {
            lower.contains("started") && lower.contains("xray") -> log("info", "XRAY", "Xray démarré pour ${profile.name}")
            lower.contains("fatal") || lower.contains("panic") || lower.contains("failed") || lower.contains("error") ||
            lower.contains("timeout") || lower.contains("rejected") || lower.contains("handshake") -> reportIssue(normalized)
          }
        }
      } catch (e: Throwable) { FileLogger.log(service, "XRAY", "consumeProcessLog exception: ${e.message}") }
    }.apply { isDaemon = true; name = "xray-log-${profile.id}"; start() }
  }

  private fun reportIssue(message: String) {
    val now = System.currentTimeMillis()
    if (message == lastReportedIssue && now - lastReportedIssueAt < 2_000L) return
    lastReportedIssue = message; lastReportedIssueAt = now
    FileLogger.log(service, "XRAY:ERR", message.take(800))
    log("error", "XRAY", message.take(320))
  }

  private fun freePort(): Int = try { ServerSocket(0).use { it.localPort } } catch (_: Throwable) { 10808 }

  private fun buildConfig(): String {
    val runtime = OpolNative.xrayRuntimePolicy(socksPort)
    val jsonMode = profile.xrayMode == "json"
    FileLogger.log(service, "XRAY", "buildConfig mode=$jsonMode runtime socks=${runtime.socksListen}:${runtime.socksPort} log=${runtime.logLevel} domain=${runtime.domainStrategy}")
    val root = if (jsonMode) {
      try { JSONObject(profile.xrayJson) } catch (e: Throwable) { FileLogger.log(service, "XRAY", "JSON parse ERROR: ${e.message} json=${profile.xrayJson.take(500)}"); error("JSON Xray invalide") }
    } else {
      try {
        val raw = OpolNative.buildXrayConfig(profile, socksPort)
        FileLogger.log(service, "XRAY", "buildXrayConfig libopol OK len=${raw.length} linkProto=${profile.xrayLink.take(20)}")
        JSONObject(raw)
      } catch (e: Throwable) { FileLogger.log(service, "XRAY", "buildXrayConfig ERROR link=${profile.xrayLink.take(200)} err=${e.message}"); throw e }
    }
    if (jsonMode) {
      normalizeInbounds(root, runtime)
      normalizeOutbounds(root)
      normalizeRouting(root, runtime)
      root.optJSONObject("log")?.put("loglevel", runtime.logLevel)
        ?: root.put("log", JSONObject().put("loglevel", runtime.logLevel))
    }
    // Log résumé outbounds pour Trojan/VMess debug
    try {
      val outs = root.optJSONArray("outbounds")
      if (outs != null) for (i in 0 until outs.length()) {
        val o = outs.optJSONObject(i) ?: continue
        val proto = o.optString("protocol")
        val stream = o.optJSONObject("streamSettings")
        val net = stream?.optString("network") ?: "tcp"
        val sec = stream?.optString("security") ?: "none"
        FileLogger.log(service, "XRAY", "outbound[$i] proto=$proto net=$net sec=$sec")
      }
    } catch (_: Throwable) {}
    return root.toString()
  }

  private fun normalizeInbounds(root: JSONObject, runtime: OpolNative.XrayRuntimePolicy) {
    val normalized = JSONArray(); var found = false; val current = root.optJSONArray("inbounds")
    if (current != null) for (i in 0 until current.length()) {
      val inbound = current.optJSONObject(i) ?: continue
      if (inbound.optString("protocol").equals("socks", true)) {
        if (found) continue
        val settings = inbound.optJSONObject("settings") ?: JSONObject()
        inbound.put("listen", runtime.socksListen).put("port", runtime.socksPort)
          .put("settings", settings.put("auth", "noauth").put("udp", true))
          .put("sniffing", JSONObject().put("enabled", false)); found = true
      } else if (inbound.optString("listen") == "0.0.0.0") inbound.put("listen", "127.0.0.1")
      normalized.put(inbound)
    }
    if (!found) normalized.put(JSONObject().put("listen", runtime.socksListen).put("port", runtime.socksPort)
      .put("protocol", "socks").put("settings", JSONObject().put("auth", "noauth").put("udp", true))
      .put("sniffing", JSONObject().put("enabled", false)))
    root.put("inbounds", normalized)
  }

  private fun normalizeOutbounds(root: JSONObject) {
    val outbounds = root.optJSONArray("outbounds") ?: return
    for (i in 0 until outbounds.length()) {
      val outbound = outbounds.optJSONObject(i) ?: continue
      val stream = outbound.optJSONObject("streamSettings") ?: continue
      if (!stream.optString("security").equals("tls", true)) continue
      val tls = stream.optJSONObject("tlsSettings") ?: JSONObject()
      val settings = outbound.optJSONObject("settings")
      val destination = settings?.optJSONArray("vnext")?.optJSONObject(0)?.optString("address").orEmpty()
        .ifBlank { settings?.optJSONArray("servers")?.optJSONObject(0)?.optString("address").orEmpty() }
      tls.remove("allowInsecure")
      if (tls.optString("verifyPeerCertByName").isBlank() && destination.isNotBlank()) tls.put("verifyPeerCertByName", destination)
      stream.put("tlsSettings", tls); outbound.put("streamSettings", stream)
    }
  }

  private fun normalizeRouting(root: JSONObject, runtime: OpolNative.XrayRuntimePolicy) {
    val routing = root.optJSONObject("routing") ?: JSONObject(); val rules = routing.optJSONArray("rules")
    if (rules != null) {
      val clean = JSONArray()
      for (i in 0 until rules.length()) {
        val rule = rules.optJSONObject(i) ?: continue
        if (!rule.optJSONArray("ip")?.toString().orEmpty().contains("geoip:") && !rule.optJSONArray("domain")?.toString().orEmpty().contains("geosite:")) clean.put(rule)
      }
      routing.put("rules", clean)
    }
    routing.put("domainStrategy", runtime.domainStrategy); root.put("routing", routing)
  }
}
