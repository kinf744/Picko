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
      }.start()
    process = started
    consumeProcessLog(started)
    var ready = false
    repeat(30) {
      if (!ready) { Thread.sleep(200); ready = LocalSocksBalancer.hasSocksGreeting(socksPort) }
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
    try { if (current?.isAlive == true) { Thread.sleep(150); if (current.isAlive) current.destroyForcibly() } } catch (_: Throwable) {}
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
      } catch (_: Throwable) {}
    }.apply { isDaemon = true; name = "xray-log-${profile.id}"; start() }
  }

  private fun reportIssue(message: String) {
    val now = System.currentTimeMillis()
    if (message == lastReportedIssue && now - lastReportedIssueAt < 2_000L) return
    lastReportedIssue = message; lastReportedIssueAt = now
    log("error", "XRAY", message.take(320))
  }

  private fun freePort(): Int = try { ServerSocket(0).use { it.localPort } } catch (_: Throwable) { 10808 }

  private fun buildConfig(): String {
    val runtime = OpolNative.xrayRuntimePolicy(socksPort)
    val jsonMode = profile.xrayMode == "json"
    val root = if (jsonMode) {
      try { JSONObject(profile.xrayJson) } catch (_: Throwable) { error("JSON Xray invalide") }
    } else {
      JSONObject(OpolNative.buildXrayConfig(profile, socksPort))
    }
    if (jsonMode) {
      normalizeInbounds(root, runtime)
      normalizeOutbounds(root)
      normalizeRouting(root, runtime)
      root.optJSONObject("log")?.put("loglevel", runtime.logLevel)
        ?: root.put("log", JSONObject().put("loglevel", runtime.logLevel))
    }
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
