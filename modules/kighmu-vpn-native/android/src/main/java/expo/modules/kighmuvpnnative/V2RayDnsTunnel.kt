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
    profile.validate()?.let { error(it) }
    stopRequested.set(false); recovering = false
    runtime = OpolNative.v2RayDnsRuntimePolicy(profile, dnsttPort, socksPort)
    writeConfig()
    try { launchComponents(); compactLog("connection", "V2Ray DNS prêt : DNSTT $dnsttPort, SOCKS $socksPort") }
    catch (error: Throwable) { stop(); throw error }
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
    require(dnstt.isFile && dnstt.length() > 0L) { "libdnstt.so absent de l’APK" }
    require(xray.isFile && xray.length() > 0L) { "libxray.so absent de l’APK" }
    xray.setExecutable(true)
    startDnstt(dnstt)
    if (!waitForTcp(dnsttPort, runtime.dnsttReadyTimeoutMs)) error("DNSTT n’a pas ouvert son flux local")
    startXray(xray, configFile ?: error("configuration Xray DNS absente"))
    if (!waitForSocks(socksPort, runtime.xrayReadyTimeoutMs)) error("V2Ray DNS n’a pas ouvert le proxy SOCKS local")
  }

  private fun startDnstt(binary: File) {
    val process = ProcessBuilder(listOf(binary.absolutePath) + runtime.argumentPrefix)
      .directory(context.filesDir).redirectErrorStream(true).apply {
        environment()["HOME"] = context.filesDir.absolutePath; environment()["TMPDIR"] = context.cacheDir.absolutePath
      }.start()
    dnsttProcess = process; observeDnstt(process)
  }

  private fun startXray(binary: File, config: File) {
    val process = ProcessBuilder(binary.absolutePath, "run", "-c", config.absolutePath)
      .directory(context.filesDir).redirectErrorStream(true).apply {
        environment()["HOME"] = context.filesDir.absolutePath; environment()["TMPDIR"] = context.cacheDir.absolutePath
        environment()["LD_LIBRARY_PATH"] = context.applicationInfo.nativeLibraryDir
      }.start()
    xrayProcess = process; observeXray(process)
  }

  private fun observeDnstt(running: Process) = observe(running, true)
  private fun observeXray(running: Process) = observe(running, false)

  private fun observe(running: Process, dnstt: Boolean) {
    Thread {
      try {
        running.inputStream.bufferedReader().useLines { lines -> lines.forEach { line ->
          val active = if (dnstt) dnsttProcess === running else xrayProcess === running
          if (stopRequested.get() || !active) return@forEach
          when (OpolNative.classifyV2RayDnsOutput(line)) {
            "ready" -> if (!dnstt) compactLog("info", "Xray DNS démarré")
            "retry" -> { compactLog("warning", if (dnstt) "DNSTT a signalé une erreur; reconnexion V2Ray DNS" else "Xray DNS a signalé une erreur; reconnexion"); scheduleRecovery() }
          }
        } }
      } catch (_: Throwable) {} finally {
        val active = if (dnstt) dnsttProcess === running else xrayProcess === running
        if (!stopRequested.get() && active) scheduleRecovery()
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
    configFile = File(context.cacheDir, "v2ray-dns-$safeId.json").also { it.writeText(buildConfig()) }
  }

  private fun buildConfig(): String {
    val root = if (profile.xrayMode == "json") JSONObject(profile.xrayJson) else JSONObject(OpolNative.buildXrayConfig(profile, socksPort))
    normalizeInbounds(root); redirectOutboundsThroughDnstt(root); normalizeRouting(root)
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

  /** DNSTT fournit un hop TCP local ; la sécurité TLS/Reality est retirée uniquement après parsing natif. */
  private fun redirectOutboundsThroughDnstt(root: JSONObject) {
    val outbounds = root.optJSONArray("outbounds") ?: return
    for (index in 0 until outbounds.length()) {
      val outbound = outbounds.optJSONObject(index) ?: continue; val protocol = outbound.optString("protocol"); val tag = outbound.optString("tag")
      if (protocol in setOf("freedom", "blackhole", "socks") || tag == "direct") continue
      val settings = outbound.optJSONObject("settings")
      settings?.optJSONArray("vnext")?.optJSONObject(0)?.apply { put("address", "127.0.0.1"); put("port", dnsttPort) }
      settings?.optJSONArray("servers")?.optJSONObject(0)?.apply { put("address", "127.0.0.1"); put("port", dnsttPort) }
      outbound.optJSONObject("streamSettings")?.apply { put("security", "none"); remove("tlsSettings"); remove("realitySettings") }
    }
  }

  private fun normalizeRouting(root: JSONObject) {
    val routing = root.optJSONObject("routing") ?: return; val rules = routing.optJSONArray("rules") ?: return; val cleaned = JSONArray()
    for (index in 0 until rules.length()) { val rule = rules.optJSONObject(index) ?: continue; if (!rule.optJSONArray("ip")?.toString().orEmpty().contains("geoip:") && !rule.optJSONArray("domain")?.toString().orEmpty().contains("geosite:")) cleaned.put(rule) }
    routing.put("rules", cleaned)
  }

  private fun compactLog(level: String, message: String) {
    val now = System.currentTimeMillis(); if (message == lastDiagnostic && now - lastDiagnosticAt < runtime.logDedupMs) return
    lastDiagnostic = message; lastDiagnosticAt = now; log(level, "V2RAY DNS", message.take(180))
  }
  private fun freePort(): Int = try { ServerSocket(0).use { it.localPort } } catch (_: Throwable) { 10808 }
}
