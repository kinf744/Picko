package expo.modules.kighmuvpnnative

import android.content.Context
import java.io.File
import java.net.Socket
import java.util.concurrent.TimeUnit

/**
 * Tunnel SSH sur DNS : la couche transport est assurée par un client dnstt local
 * (libdnstt.so) qui relaie un flux TCP vers le serveur SlowDNS. Ce flux est
 * ensuite traité par la base SshTransportTunnel, qui négocie la bannière SSH,
 * l'authentification, le banner post-auth et la sonde SOCKS — exactement comme
 * pour SSH SSL/TLS et HTTP Proxy Payload. Le journal de connexion expose donc
 * les mêmes étapes (SSH_BANNER, SSH_SERVER_MESSAGE, Auth complete, DNS, Connected).
 */
class SshSlowDnsTunnel(
  context: Context,
  profile: TunnelProfile,
  log: (String, String, String) -> Unit,
) : SshTransportTunnel(context, profile, COMPONENT, log, emptyList()) {
  private val dnsttPort: Int = freePort()
  private val runtime by lazy { OpolNative.slowDnsRuntimePolicy(profile, dnsttPort, socksPort) }
  private var dnsttProcess: Process? = null

  override fun start() {
    profile.validate()?.let { error(it) }
    startDnstt()
    if (!waitForTcp(dnsttPort, runtime.dnsttReadyTimeoutMs, runtime.probeIntervalMs)) {
      stop()
      error("DNSTT n’a pas ouvert son flux local sur 127.0.0.1:$dnsttPort dans les ${runtime.dnsttReadyTimeoutMs}ms")
    }
    super.start()
  }

  override fun openTransport(): Socket {
    val raw = Socket("127.0.0.1", dnsttPort)
    protect(raw)
    raw.tcpNoDelay = true
    raw.keepAlive = true
    compactLog("info", "Canal dnstt local connecté (127.0.0.1:$dnsttPort) — handshake SSH à venir")
    return raw
  }

  override fun stop() {
    try { dnsttProcess?.destroy() } catch (_: Throwable) {}
    try { dnsttProcess?.waitFor(500, TimeUnit.MILLISECONDS) } catch (_: Throwable) {}
    try { dnsttProcess?.destroyForcibly() } catch (_: Throwable) {}
    dnsttProcess = null
    super.stop()
  }

  private fun startDnstt() {
    val binary = File(context.applicationInfo.nativeLibraryDir, "libdnstt.so")
    require(binary.exists() && binary.length() > 0L) { "libdnstt.so absent de l’APK" }
    val policy = runtime
    val process = ProcessBuilder(listOf(binary.absolutePath) + policy.argumentPrefix)
      .directory(context.filesDir)
      .apply {
        environment()["HOME"] = context.filesDir.absolutePath
        environment()["TMPDIR"] = context.cacheDir.absolutePath
        redirectErrorStream(true)
      }
      .start()
    dnsttProcess = process
    compactLog("connection", "DNSTT démarré ; relais 127.0.0.1:$dnsttPort → ${profile.dnsServer}:${profile.dnsPort}")
    Thread {
      try {
        process.inputStream.bufferedReader().useLines { lines ->
          lines.forEach { line ->
            when (OpolNative.classifySlowDnsOutput(line)) {
              "ignore" -> Unit
              else -> compactLog("info", line.take(policy.logLineMaxChars))
            }
          }
        }
      } catch (_: Throwable) {}
    }.apply { isDaemon = true; name = "dnstt-log-$dnsttPort" }.start()
  }

  private fun waitForTcp(port: Int, timeoutMs: Long, probeIntervalMs: Long): Boolean {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline && dnsttProcess?.isAlive == true) {
      try { Socket("127.0.0.1", port).use { return true } } catch (_: Throwable) { Thread.sleep(probeIntervalMs) }
    }
    return false
  }

  companion object {
    private const val COMPONENT = "SLOWDNS"
  }
}
