package expo.modules.kighmuvpnnative

import android.content.Context
import com.trilead.ssh2.Connection
import java.io.File
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class SshSlowDnsTunnel(
  private val context: Context,
  private val profile: TunnelProfile,
  private val log: (String, String, String) -> Unit,
) : LocalTunnel {
  override val label: String = profile.name
  override val socksPort: Int = ZivpnTunnel.findFreePort()
  private val dnsttPort = ZivpnTunnel.findFreePort()
  private var dnsttProcess: Process? = null
  private var connection: Connection? = null
  private var bridgeServer: ServerSocket? = null
  private var bridgeClient: Socket? = null
  private var bridgeRemote: Socket? = null

  override fun start() {
    profile.validate()?.let { throw IllegalArgumentException(it) }
    startDnstt()
    if (!waitForTcp(dnsttPort, 8_000L)) {
      stop()
      error("DNSTT n’a pas ouvert son flux local")
    }
    val bridgePort = startBannerBridge()
    val ssh = Connection("127.0.0.1", bridgePort)
    try {
      ssh.connect(null, 6_000, 15_000)
      if (!ssh.authenticateWithPassword(profile.sshUser, profile.password)) error("authentification SSH refusée")
      ssh.createDynamicPortForwarder(java.net.InetSocketAddress("127.0.0.1", socksPort))
      connection = ssh
    } catch (error: Throwable) {
      try { ssh.close() } catch (_: Throwable) {}
      stop()
      throw error
    }
    if (!waitForSocks(socksPort, 4_000L)) {
      stop()
      error("SSH SlowDNS n’a pas ouvert le proxy SOCKS local")
    }
    log("connection", "SLOWDNS", "${profile.name} prêt : DNSTT $dnsttPort, SOCKS $socksPort")
  }

  override fun isHealthy(): Boolean = dnsttProcess?.isAlive == true && connection != null && LocalSocksBalancer.hasSocksGreeting(socksPort)

  override fun stop() {
    try { connection?.close() } catch (_: Throwable) {}
    connection = null
    try { bridgeClient?.close() } catch (_: Throwable) {}
    try { bridgeRemote?.close() } catch (_: Throwable) {}
    try { bridgeServer?.close() } catch (_: Throwable) {}
    bridgeClient = null
    bridgeRemote = null
    bridgeServer = null
    try { dnsttProcess?.destroy() } catch (_: Throwable) {}
    try { dnsttProcess?.waitFor(500, TimeUnit.MILLISECONDS) } catch (_: Throwable) {}
    try { dnsttProcess?.destroyForcibly() } catch (_: Throwable) {}
    dnsttProcess = null
  }

  private fun startDnstt() {
    val binary = File(context.applicationInfo.nativeLibraryDir, "libdnstt.so")
    require(binary.exists() && binary.length() > 0L) { "libdnstt.so absent de l’APK" }
    val process = ProcessBuilder(
      binary.absolutePath,
      "-udp", "${profile.dnsServer}:${profile.dnsPort}",
      "-pubkey", profile.normalizedPublicKey(),
      profile.nameserver,
      "127.0.0.1:$dnsttPort",
    )
      .directory(context.filesDir)
      .apply {
        environment()["HOME"] = context.filesDir.absolutePath
        environment()["TMPDIR"] = context.cacheDir.absolutePath
        redirectErrorStream(true)
      }
      .start()
    dnsttProcess = process
    Thread {
      try {
        process.inputStream.bufferedReader().useLines { lines ->
          lines.forEach { line ->
            if (line.isNotBlank() && !line.contains("keepalive", ignoreCase = true)) log("info", "SLOWDNS", line.take(500))
          }
        }
      } catch (_: Throwable) {}
    }.apply { isDaemon = true; name = "dnstt-log-$dnsttPort" }.start()
  }

  private fun startBannerBridge(): Int {
    val listener = ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1"))
    bridgeServer = listener
    val ready = CountDownLatch(1)
    Thread {
      ready.countDown()
      try {
        val client = listener.accept()
        bridgeClient = client
        val remote = Socket("127.0.0.1", dnsttPort)
        bridgeRemote = remote
        val remoteInput = remote.getInputStream()
        val banner = StringBuilder()
        while (true) {
          val next = remoteInput.read()
          if (next < 0) error("bannière SSH absente")
          banner.append(next.toChar())
          if (next == '\n'.code) break
          if (banner.length > 1_024) error("bannière SSH trop longue")
        }
        client.getOutputStream().apply { write(banner.toString().toByteArray()); flush() }
        log("info", "SLOWDNS", banner.toString().trim().take(180))
        Thread { pipe(remoteInput, client.getOutputStream()) }.apply { isDaemon = true }.start()
        pipe(client.getInputStream(), remote.getOutputStream())
      } catch (error: Throwable) {
        if (dnsttProcess?.isAlive == true) log("warning", "SLOWDNS", "Pont SSH : ${error.message ?: "interrompu"}")
      }
    }.apply { isDaemon = true; name = "slowdns-banner-bridge" }.start()
    ready.await(1, TimeUnit.SECONDS)
    return listener.localPort
  }

  private fun waitForTcp(port: Int, timeoutMs: Long): Boolean {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline && dnsttProcess?.isAlive == true) {
      try { Socket("127.0.0.1", port).use { return true } } catch (_: Throwable) { Thread.sleep(100) }
    }
    return false
  }

  private fun waitForSocks(port: Int, timeoutMs: Long): Boolean {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline) {
      if (LocalSocksBalancer.hasSocksGreeting(port)) return true
      Thread.sleep(80)
    }
    return false
  }

  private fun pipe(input: java.io.InputStream, output: java.io.OutputStream) {
    val buffer = ByteArray(32 * 1024)
    try {
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        output.write(buffer, 0, count)
        output.flush()
      }
    } catch (_: Throwable) {}
  }
}
