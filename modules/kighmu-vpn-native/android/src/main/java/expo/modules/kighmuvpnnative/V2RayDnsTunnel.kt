package expo.modules.kighmuvpnnative

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Exécution Android V2Ray DNS ; la politique DNSTT et le parsing Xray sont générés par libopol. */
class V2RayDnsTunnel(
  private val context: Context,
  private val profile: TunnelProfile,
  private val log: (String, String, String) -> Unit,
  private val dnsServers: List<String> = emptyList(),
) : LocalTunnel {
  override val label: String = profile.name
  override val socksPort: Int = freePort()
  private val dnsttPort: Int = freePort()
  private lateinit var runtime: OpolNative.V2RayDnsRuntimePolicy

  @Volatile private var dnsttProcess: Process? = null
  @Volatile private var xrayProcess: Process? = null
  @Volatile private var configFile: File? = null
  @Volatile private var recovering = false
  private val stopRequested = AtomicBoolean(false)
  @Volatile private var recoveryThread: Thread? = null
  @Volatile private var lastDiagnostic = ""
  @Volatile private var lastDiagnosticAt = 0L

  override fun start() {
    FileLogger.init(context); FileLogger.header(context, profile)
    FileLogger.log(context, "V2RAY DNS", "=== START V2Ray DNS profil=${profile.name} id=${profile.id} xrayMode=${profile.xrayMode} dns=${profile.dnsServer}:${profile.dnsPort} ns=${profile.nameserver} dnsttPort=$dnsttPort socksPort=$socksPort ===")
    profile.validate()?.let { FileLogger.log(context, "V2RAY DNS", "VALIDATE ERROR: $it"); error(it) }
    stopRequested.set(false); recovering = false
    try {
      runtime = OpolNative.v2RayDnsRuntimePolicy(profile, dnsttPort, socksPort)
      FileLogger.log(context, "V2RAY DNS", "Runtime libopol: dnsttReady=${runtime.dnsttReadyTimeoutMs}ms xrayReady=${runtime.xrayReadyTimeoutMs}ms probe=${runtime.probeIntervalMs}ms maxRetry=${runtime.maxRecoveryAttempts}")
    } catch (e: Throwable) {
      FileLogger.log(context, "V2RAY DNS", "RUNTIME ERROR: ${e.message}"); throw e
    }
    try { writeConfig() } catch (e: Throwable) { FileLogger.log(context, "V2RAY DNS", "WRITE CONFIG ERROR: ${e.message}"); throw e }
    log("connection", "V2RAY DNS", "V2Ray DNS")
    try {
      launchComponents()
      log("success", "V2RAY DNS", "DNSTT ready")
      dnsServers.forEach { log("connection", "V2RAY DNS", "DNS $it") }
      log("success", "V2RAY DNS", "Connected")
    } catch (error: Throwable) { FileLogger.log(context, "V2RAY DNS", "LAUNCH ERROR: ${error.message}"); stop(); throw error }
  }

  override fun isHealthy(): Boolean = !recovering && dnsttProcess?.isAlive == true && xrayProcess?.isAlive == true && LocalSocksBalancer.hasSocksGreeting(socksPort)
  override fun isRecovering(): Boolean = recovering

  override fun stop() {
    stopRequested.set(true); recovering = false; recoveryThread?.interrupt(); recoveryThread = null
    destroyComponents(); try { configFile?.delete() } catch (_: Throwable) {}; configFile = null
  }

  private fun launchComponents() {
    val dnstt = File(context.applicationInfo.nativeLibraryDir, "libdnstt.so")
    val xray = File(context.applicationInfo.nativeLibraryDir, "libxray.so")
    FileLogger.log(context, "V2RAY DNS", "Binaries: dnstt=${dnstt.absolutePath} exists=${dnstt.isFile} size=${dnstt.length()} xray=${xray.absolutePath} exists=${xray.isFile} size=${xray.length()} nativeDir=${context.applicationInfo.nativeLibraryDir}")
    require(dnstt.isFile && dnstt.length() > 0L) { "libdnstt.so absent de l’APK" }
    require(xray.isFile && xray.length() > 0L) { "libxray.so absent de l’APK" }
    xray.setExecutable(true)
    FileLogger.log(context, "V2RAY DNS", "Xray executable set: canExecute=${xray.canExecute()}")
    startDnstt(dnstt)
    FileLogger.log(context, "V2RAY DNS", "DNSTT lancé, attente TCP 127.0.0.1:$dnsttPort timeout=${runtime.dnsttReadyTimeoutMs}ms")
    if (!waitForTcp(dnsttPort, runtime.dnsttReadyTimeoutMs)) {
      FileLogger.log(context, "V2RAY DNS", "DNSTT TIMEOUT: port $dnsttPort non joignable après ${runtime.dnsttReadyTimeoutMs}ms alive=${dnsttProcess?.isAlive}")
      error("DNSTT n’a pas ouvert son flux local")
    }
    FileLogger.log(context, "V2RAY DNS", "DNSTT OK, lancement Xray config=${configFile?.absolutePath} size=${configFile?.length()}")
    startXray(xray, configFile ?: error("configuration Xray DNS absente"))
    FileLogger.log(context, "V2RAY DNS", "Xray lancé, attente SOCKS 127.0.0.1:$socksPort timeout=${runtime.xrayReadyTimeoutMs}ms")
    if (!waitForSocks(socksPort, runtime.xrayReadyTimeoutMs)) {
      val xAlive = xrayProcess?.isAlive
      val exit = try { xrayProcess?.exitValue()?.toString() } catch (_: Throwable) { "actif" }
      FileLogger.log(context, "V2RAY DNS", "XRAY SOCKS TIMEOUT: port $socksPort non joignable alive=$xAlive exit=$exit - voir logs Xray ci-dessus pour Trojan/VMess handshake")
      error("V2Ray DNS n’a pas ouvert le proxy SOCKS local")
    }
    FileLogger.log(context, "V2RAY DNS", "SOCKS OK: 127.0.0.1:$socksPort prêt")
  }

  private fun startDnstt(binary: File) {
    FileLogger.log(context, "V2RAY DNS", "DNSTT cmd: ${binary.absolutePath} ${runtime.argumentPrefix.joinToString(" ")}")
    val process = ProcessBuilder(listOf(binary.absolutePath) + runtime.argumentPrefix)
      .directory(context.filesDir).redirectErrorStream(true).apply {
        environment()["HOME"] = context.filesDir.absolutePath; environment()["TMPDIR"] = context.cacheDir.absolutePath
      }.start()
    FileLogger.log(context, "V2RAY DNS", "DNSTT pid started, HOME=${context.filesDir.absolutePath}")
    dnsttProcess = process; observeDnstt(process)
  }

  private fun startXray(binary: File, config: File) {
    FileLogger.log(context, "V2RAY DNS", "Xray cmd: ${binary.absolutePath} run -c ${config.absolutePath}")
    FileLogger.logXrayJson(context, "V2RAY DNS", config.readText().take(6000))
    val process = ProcessBuilder(binary.absolutePath, "run", "-c", config.absolutePath)
      .directory(context.filesDir).redirectErrorStream(true).apply {
        environment()["HOME"] = context.filesDir.absolutePath; environment()["TMPDIR"] = context.cacheDir.absolutePath
        environment()["LD_LIBRARY_PATH"] = context.applicationInfo.nativeLibraryDir
      }.start()
    FileLogger.log(context, "V2RAY DNS", "Xray pid started, LD_LIBRARY_PATH=${context.applicationInfo.nativeLibraryDir}")
    xrayProcess = process; observeXray(process)
  }

  private fun observeDnstt(running: Process) = observe(running, true)
  private fun observeXray(running: Process) = observe(running, false)

  private fun observe(running: Process, dnstt: Boolean) {
    val tag = if (dnstt) "DNSTT" else "XRAY"
    Thread {
      try {
        running.inputStream.bufferedReader().useLines { lines -> lines.forEach { raw ->
          val line = raw.trim()
          val active = if (dnstt) dnsttProcess === running else xrayProcess === running
          if (stopRequested.get() || !active) return@forEach
          val cls = OpolNative.classifyV2RayDnsOutput(raw)
          // Filtrage anti-verbeux: ne logge que ready/retry/erreurs, pas chaque keepalive/stream
          val lower = line.lowercase()
          // Suppression totale des logs "failed to read request > EOF" / "rejected proxy/socks": Xray les
          // émet en boucle dès qu'un client ferme sa connexion — pollue le journal sans valeur.
          if (lower.contains("failed to read request") || lower.contains("rejected proxy/socks")) return@forEach
          // Avertissement de dépréciation Xray-core: "The feature Trojan (with no Flow, etc.) is
          // deprecated... Please migrate to VLESS". Sans objet pour l'utilisateur (le profil
          // marche) et sans impact sur la connexion. Les autres mentions de "trojan" (handshake,
          // config invalide, etc.) passent toujours pour le diagnostic utile.
          if (lower.contains("migrate to vless")) return@forEach
          val isImportant = cls != "ignore" || lower.contains("error") || lower.contains("failed") || lower.contains("mtu") || lower.contains("session") || lower.contains("timeout") || lower.contains("trojan") || lower.contains("vmess")
          if (isImportant) FileLogger.log(context, "V2RAY DNS:$tag", line.take(600))
          when (cls) {
            "ready" -> if (!dnstt) compactLog("info", "Xray DNS démarré")
            "retry" -> { FileLogger.logForce(context, "V2RAY DNS", "$tag RETRY: $line"); compactLog("warning", if (dnstt) "DNSTT a signalé une erreur; reconnexion V2Ray DNS" else "Xray DNS a signalé une erreur; reconnexion"); scheduleRecovery() }
            else -> {
              if (!dnstt && lower.contains("error") || lower.contains("failed") || lower.contains("timeout") || lower.contains("rejected")) {
                FileLogger.log(context, "V2RAY DNS:XRAY-ERR", line)
                if (lower.contains("failed to start") || lower.contains("unknown transport") || lower.contains("trojan") || lower.contains("vmess")) compactLog("error", line.take(180))
              }
            }
          }
        } }
      } catch (e: Throwable) { FileLogger.log(context, "V2RAY DNS:$tag", "observe exception: ${e.message}") } finally {
        val active = if (dnstt) dnsttProcess === running else xrayProcess === running
        if (!stopRequested.get() && active) {
          val exit = try { running.exitValue().toString() } catch (_: Throwable) { "running?" }
          FileLogger.log(context, "V2RAY DNS:$tag", "process exit/destroy, exitValue=$exit, scheduling recovery")
          scheduleRecovery()
        }
      }
    }.apply { isDaemon = true; name = "picko-v2dns-${if (dnstt) "dnstt" else "xray"}-${profile.id.takeLast(8)}"; start() }
  }

  private fun scheduleRecovery() {
    if (stopRequested.get() || recovering) return
    recovering = true; compactLog("warning", "V2Ray DNS temporairement indisponible; reconnexion automatique")
    recoveryThread = Thread {
      try {
        repeat(runtime.maxRecoveryAttempts) { index ->
          if (stopRequested.get()) return@Thread
          compactLog("info", "Reconnexion V2Ray DNS ${index + 1}/${runtime.maxRecoveryAttempts}")
          try { destroyComponents(); if (configFile == null) writeConfig(); launchComponents(); recovering = false; compactLog("connection", "V2Ray DNS reconnecté; trafic rétabli"); return@Thread }
          catch (_: Throwable) { destroyComponents(); if (!stopRequested.get()) Thread.sleep(runtime.recoveryDelayMs) }
        }
        recovering = false; compactLog("error", "V2Ray DNS ne peut pas se reconnecter après ${runtime.maxRecoveryAttempts} tentatives")
      } catch (_: InterruptedException) {} finally { if (Thread.currentThread() === recoveryThread) recoveryThread = null }
    }.apply { isDaemon = true; name = "picko-v2dns-recovery-${profile.id.takeLast(8)}"; start() }
  }

  private fun destroyComponents() { destroyProcess(xrayProcess); destroyProcess(dnsttProcess); xrayProcess = null; dnsttProcess = null }
  private fun destroyProcess(target: Process?) { if (target == null) return; try { target.outputStream.close() } catch (_: Throwable) {}; try { target.inputStream.close() } catch (_: Throwable) {}; try { target.errorStream.close() } catch (_: Throwable) {}; try { target.destroy() } catch (_: Throwable) {}; try { if (!target.waitFor(600, TimeUnit.MILLISECONDS)) target.destroyForcibly() } catch (_: Throwable) {} }

  private fun waitForTcp(port: Int, timeoutMs: Long): Boolean {
    val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs)
    while (System.nanoTime() < deadline && dnsttProcess?.isAlive == true) try { Socket().use { it.connect(InetSocketAddress("127.0.0.1", port), 200) }; return true } catch (_: Throwable) { Thread.sleep(runtime.probeIntervalMs) }
    return false
  }
  private fun waitForSocks(port: Int, timeoutMs: Long): Boolean {
    val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs)
    while (System.nanoTime() < deadline && xrayProcess?.isAlive == true) { if (LocalSocksBalancer.hasSocksGreeting(port)) return true; Thread.sleep(runtime.probeIntervalMs) }
    return false
  }

  private fun writeConfig() {
    val safeId = profile.id.replace(Regex("[^A-Za-z0-9_-]"), "_")
    val raw = buildConfig()
    FileLogger.log(context, "V2RAY DNS", "writeConfig safeId=$safeId rawLen=${raw.length} link=${profile.xrayLink.take(120)} mode=${profile.xrayMode}")
    configFile = File(context.cacheDir, "v2ray-dns-$safeId.json").also { it.writeText(raw) }
    FileLogger.log(context, "V2RAY DNS", "configFile=${configFile!!.absolutePath} len=${configFile!!.length()} inbounds/outbounds normalised, Download=${FileLogger.getPath(context)}")
    FileLogger.logXrayJson(context, "V2RAY DNS", raw)
  }

  private fun buildConfig(): String {
    val rawXray = if (profile.xrayMode == "json") profile.xrayJson else try { OpolNative.buildXrayConfig(profile, socksPort) } catch (e: Throwable) { FileLogger.log(context, "V2RAY DNS", "buildXrayConfig ERROR Trojan/VMess link invalide: ${e.message} link=${profile.xrayLink.take(200)}"); throw e }
    FileLogger.log(context, "V2RAY DNS", "buildXrayConfig ok mode=${profile.xrayMode} rawLen=${rawXray.length}")
    val root = JSONObject(rawXray)
    // Log avant redirect pour voir host/port d'origine Trojan/VMess
    try {
      val outs = root.optJSONArray("outbounds")
      if (outs != null) for (i in 0 until outs.length()) {
        val o = outs.optJSONObject(i) ?: continue
        val proto = o.optString("protocol")
        val s = o.optJSONObject("settings")
        val addr = s?.optJSONArray("vnext")?.optJSONObject(0)?.optString("address") ?: s?.optJSONArray("servers")?.optJSONObject(0)?.optString("address") ?: "-"
        val port = s?.optJSONArray("vnext")?.optJSONObject(0)?.optInt("port") ?: s?.optJSONArray("servers")?.optJSONObject(0)?.optInt("port") ?: -1
        val sec = o.optJSONObject("streamSettings")?.optString("security") ?: "none"
        val net = o.optJSONObject("streamSettings")?.optString("network") ?: "tcp"
        FileLogger.log(context, "V2RAY DNS", "outbound[$i] proto=$proto addr=$addr port=$port net=$net sec=$sec (avant DNSTT redirect)")
      }
    } catch (_: Throwable) {}
    normalizeInbounds(root); redirectOutboundsThroughDnstt(root); normalizeRouting(root)
    FileLogger.log(context, "V2RAY DNS", "après redirectOutboundsThroughDnstt: outbounds redirigés vers 127.0.0.1:$dnsttPort (TLS/transport conservés pour Trojan/VMess)")
    root.optJSONObject("log")?.put("loglevel", "warning") ?: root.put("log", JSONObject().put("loglevel", "warning"))
    return root.toString()
  }

  private fun normalizeInbounds(root: JSONObject) {
    val normalized = JSONArray(); var found = false; val inbounds = root.optJSONArray("inbounds")
    if (inbounds != null) for (index in 0 until inbounds.length()) {
      val inbound = inbounds.optJSONObject(index) ?: continue
      if (inbound.optString("protocol") == "socks") {
        val settings = inbound.optJSONObject("settings") ?: JSONObject()
        inbound.put("listen", "127.0.0.1").put("port", socksPort).put("settings", settings.put("auth", "noauth").put("udp", true)); found = true
      } else if (inbound.optString("listen") == "0.0.0.0") inbound.put("listen", "127.0.0.1")
      normalized.put(inbound)
    }
    if (!found) normalized.put(JSONObject().put("listen", "127.0.0.1").put("port", socksPort).put("protocol", "socks").put("settings", JSONObject().put("auth", "noauth").put("udp", true)))
    root.put("inbounds", normalized)
  }

  /**
   * DNSTT fournit un hop TCP local transparent : on redirige uniquement l'adresse
   * du `vnext`/`servers` vers 127.0.0.1:dnsttPort. La `streamSettings` (TCP, ws,
   * gRPC, xhttp/splithttp, h2, httpupgrade, kcp, quic + TLS/Reality) est conservée
   * telle quelle par libopol afin que tous les transports fonctionnent avec ou sans TLS.
   */
  private fun redirectOutboundsThroughDnstt(root: JSONObject) {
    val outbounds = root.optJSONArray("outbounds") ?: return
    for (index in 0 until outbounds.length()) {
      val outbound = outbounds.optJSONObject(index) ?: continue; val protocol = outbound.optString("protocol"); val tag = outbound.optString("tag")
      if (protocol in setOf("freedom", "blackhole", "socks") || tag == "direct") continue
      val settings = outbound.optJSONObject("settings")
      val beforeV = settings?.optJSONArray("vnext")?.optJSONObject(0)?.let { "${it.optString("address")}:${it.optInt("port")}" } ?: "-"
      val beforeS = settings?.optJSONArray("servers")?.optJSONObject(0)?.let { "${it.optString("address")}:${it.optInt("port")}" } ?: "-"
      settings?.optJSONArray("vnext")?.optJSONObject(0)?.apply { put("address", "127.0.0.1"); put("port", dnsttPort) }
      settings?.optJSONArray("servers")?.optJSONObject(0)?.apply { put("address", "127.0.0.1"); put("port", dnsttPort) }
      FileLogger.log(context, "V2RAY DNS", "redirect outbound[$index] proto=$protocol tag=$tag $beforeV/$beforeS -> 127.0.0.1:$dnsttPort")
      // Ne pas altérer streamSettings : le TLS/Reality et le type de transport (tcp/ws/grpc/xhttp/h2/kcp/quic…)
      // doivent transiter chiffrés via le tunnel DNSTT, sinon trojan/vmess en TLS échouent (handshake timeout).
    }
  }

  private fun normalizeRouting(root: JSONObject) {
    val routing = root.optJSONObject("routing") ?: return; val rules = routing.optJSONArray("rules") ?: return; val cleaned = JSONArray()
    for (index in 0 until rules.length()) { val rule = rules.optJSONObject(index) ?: continue; if (!rule.optJSONArray("ip")?.toString().orEmpty().contains("geoip:") && !rule.optJSONArray("domain")?.toString().orEmpty().contains("geosite:")) cleaned.put(rule) }
    routing.put("rules", cleaned)
  }

  private fun compactLog(level: String, message: String) {
    val now = System.currentTimeMillis(); if (message == lastDiagnostic && now - lastDiagnosticAt < runtime.logDedupMs) return
    lastDiagnostic = message; lastDiagnosticAt = now
    FileLogger.log(context, "V2RAY DNS:$level", message.take(500))
    log(level, "V2RAY DNS", message.take(180))
  }
  private fun freePort(): Int = try { ServerSocket(0).use { it.localPort } } catch (_: Throwable) { 10808 }
}
