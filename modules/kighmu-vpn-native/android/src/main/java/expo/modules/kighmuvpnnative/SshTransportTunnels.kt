package expo.modules.kighmuvpnnative

import android.content.Context
import com.trilead.ssh2.Connection
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.Charset
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.SNIHostName
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLParameters
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/**
 * Base commune aux tunnels qui font passer SSH au travers d’un transport TCP déjà établi.
 * Le tunnel expose un SOCKS SSH local pour être inclus dans LocalSocksBalancer.
 */
abstract class SshTransportTunnel(
  protected val context: Context,
  protected val profile: TunnelProfile,
  private val component: String,
  protected val log: (String, String, String) -> Unit,
) : LocalTunnel {
  override val label: String = profile.name
  override val socksPort: Int = freePort()

  @Volatile private var transport: Socket? = null
  @Volatile private var connection: Connection? = null
  @Volatile private var bridgeServer: ServerSocket? = null
  @Volatile private var bridgeClient: Socket? = null
  @Volatile private var recovering = false
  private val stopRequested = AtomicBoolean(false)
  @Volatile private var recoveryThread: Thread? = null
  @Volatile private var lastDiagnostic = ""
  @Volatile private var lastDiagnosticAt = 0L

  protected abstract fun openTransport(): Socket

  override fun start() {
    profile.validate()?.let { error(it) }
    stopRequested.set(false)
    recovering = false
    try {
      openAndAuthenticate()
      compactLog("connection", "$component prêt : proxy SOCKS 127.0.0.1:$socksPort")
      startHealthWatcher()
    } catch (error: Throwable) {
      stop()
      throw error
    }
  }

  override fun isHealthy(): Boolean =
    !recovering && connection?.isAuthenticationComplete == true && transport?.isConnected == true &&
      transport?.isClosed == false && LocalSocksBalancer.hasSocksGreeting(socksPort)

  override fun isRecovering(): Boolean = recovering

  override fun stop() {
    stopRequested.set(true)
    recovering = false
    recoveryThread?.interrupt()
    recoveryThread = null
    closeResources()
  }

  private fun openAndAuthenticate() {
    val opened = openTransport()
    transport = opened
    establishSshBridge(opened)
    if (!waitForSocks(SSH_SOCKS_TIMEOUT_MS)) error("$component n’a pas ouvert le proxy SOCKS local")
  }

  private fun establishSshBridge(remote: Socket) {
    val listener = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
    bridgeServer = listener
    val bridgeReady = CountDownLatch(1)
    Thread {
      bridgeReady.countDown()
      try {
        val client = listener.accept()
        bridgeClient = client
        try { listener.close() } catch (_: Throwable) {}
        client.tcpNoDelay = true
        val remoteInput = remote.getInputStream()
        val banner = readSshBanner(remoteInput)
        client.getOutputStream().apply { write(banner.toByteArray(Charsets.ISO_8859_1)); flush() }
        compactLog("info", "Bannière SSH reçue : ${banner.trim().take(120)}")
        Thread { pipe(remoteInput, client.getOutputStream()) }.apply { isDaemon = true; name = "picko-$component-remote-${profile.id.takeLast(8)}" }.start()
        pipe(client.getInputStream(), remote.getOutputStream())
      } catch (error: Throwable) {
        if (!stopRequested.get()) compactLog("warning", "Pont $component interrompu : ${error.message ?: "connexion fermée"}")
      } finally {
        if (!stopRequested.get()) scheduleRecovery()
      }
    }.apply { isDaemon = true; name = "picko-$component-bridge-${profile.id.takeLast(8)}" }.start()
    bridgeReady.await(1, TimeUnit.SECONDS)

    val ssh = Connection("127.0.0.1", listener.localPort)
    try {
      ssh.connect(null, SSH_CONNECT_TIMEOUT_MS, SSH_KEX_TIMEOUT_MS)
      if (!ssh.authenticateWithPassword(profile.sshUser, profile.password)) error("authentification SSH refusée")
      ssh.createDynamicPortForwarder(InetSocketAddress("127.0.0.1", socksPort))
      connection = ssh
    } catch (error: Throwable) {
      try { ssh.close() } catch (_: Throwable) {}
      throw error
    }
  }

  private fun startHealthWatcher() {
    Thread {
      while (!stopRequested.get()) {
        try { Thread.sleep(HEALTH_INTERVAL_MS) } catch (_: InterruptedException) { return@Thread }
        if (!stopRequested.get() && !recovering && !isHealthy()) scheduleRecovery()
      }
    }.apply { isDaemon = true; name = "picko-$component-health-${profile.id.takeLast(8)}" }.start()
  }

  private fun scheduleRecovery() {
    if (stopRequested.get() || recovering) return
    recovering = true
    compactLog("warning", "$component temporairement indisponible ; reconnexion automatique")
    recoveryThread = Thread {
      try {
        repeat(MAX_RECOVERY_ATTEMPTS) { index ->
          if (stopRequested.get()) return@Thread
          compactLog("info", "Reconnexion $component ${index + 1}/$MAX_RECOVERY_ATTEMPTS")
          try {
            closeResources()
            openAndAuthenticate()
            recovering = false
            compactLog("connection", "$component reconnecté ; trafic rétabli")
            return@Thread
          } catch (_: Throwable) {
            closeResources()
            if (!stopRequested.get()) Thread.sleep(RECOVERY_DELAY_MS)
          }
        }
        recovering = false
        compactLog("error", "$component ne peut pas se reconnecter après $MAX_RECOVERY_ATTEMPTS tentatives")
      } catch (_: InterruptedException) {
        // Arrêt demandé ou nouveau cycle de connexion.
      } finally {
        if (Thread.currentThread() === recoveryThread) recoveryThread = null
      }
    }.apply { isDaemon = true; name = "picko-$component-recovery-${profile.id.takeLast(8)}" }
    recoveryThread?.start()
  }

  private fun closeResources() {
    try { connection?.close() } catch (_: Throwable) {}
    connection = null
    try { bridgeClient?.close() } catch (_: Throwable) {}
    bridgeClient = null
    try { bridgeServer?.close() } catch (_: Throwable) {}
    bridgeServer = null
    try { transport?.close() } catch (_: Throwable) {}
    transport = null
  }

  private fun waitForSocks(timeoutMs: Long): Boolean {
    val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs)
    while (System.nanoTime() < deadline) {
      if (LocalSocksBalancer.hasSocksGreeting(socksPort)) return true
      if (transport?.isClosed != false) return false
      Thread.sleep(100)
    }
    return false
  }

  private fun readSshBanner(input: InputStream): String {
    val banner = StringBuilder()
    while (banner.length < MAX_BANNER_BYTES) {
      val next = input.read()
      if (next < 0) error("bannière SSH absente")
      banner.append(next.toChar())
      if (next == '\n'.code) return banner.toString()
    }
    error("bannière SSH trop longue")
  }

  private fun pipe(input: InputStream, output: OutputStream) {
    val buffer = ByteArray(64 * 1024)
    try {
      while (!stopRequested.get()) {
        val count = input.read(buffer)
        if (count < 0) break
        output.write(buffer, 0, count)
        output.flush()
      }
    } catch (_: Throwable) {
      // La perte de transport est traitée par le watcher et le pont.
    }
  }

  protected fun protect(socket: Socket) {
    try { (context as? android.net.VpnService)?.protect(socket) } catch (_: Throwable) {}
  }

  protected fun compactLog(level: String, message: String) {
    val now = System.currentTimeMillis()
    if (message == lastDiagnostic && now - lastDiagnosticAt < LOG_DEDUP_MS) return
    lastDiagnostic = message
    lastDiagnosticAt = now
    log(level, component, message.take(220))
  }

  companion object {
    private const val SSH_CONNECT_TIMEOUT_MS = 30_000
    private const val SSH_KEX_TIMEOUT_MS = 30_000
    private const val SSH_SOCKS_TIMEOUT_MS = 7_000L
    private const val HEALTH_INTERVAL_MS = 2_500L
    private const val MAX_RECOVERY_ATTEMPTS = 12
    private const val RECOVERY_DELAY_MS = 2_000L
    private const val LOG_DEDUP_MS = 5_000L
    private const val MAX_BANNER_BYTES = 1_024

    fun freePort(): Int = try { ServerSocket(0).use { it.localPort } } catch (_: Throwable) { 10808 }
  }
}

class HttpProxyPayloadTunnel(
  context: Context,
  profile: TunnelProfile,
  log: (String, String, String) -> Unit,
) : SshTransportTunnel(context, profile, "HTTP PROXY", log) {

  override fun openTransport(): Socket {
    val socket = Socket()
    protect(socket)
    socket.tcpNoDelay = true
    socket.keepAlive = true
    socket.receiveBufferSize = 128 * 1024
    socket.sendBufferSize = 128 * 1024
    socket.soTimeout = HTTP_RESPONSE_TIMEOUT_MS
    socket.connect(InetSocketAddress(profile.proxyHost, profile.proxyPort.toInt()), HTTP_CONNECT_TIMEOUT_MS)
    try {
      val rawPayload = profile.httpPayload.ifBlank { DEFAULT_PAYLOAD }
      val payload = expandPayload(rawPayload)
      sendPayload(socket.getOutputStream(), rawPayload, payload)
      val firstLine = readHttpLine(socket.getInputStream())
      val isConnect = rawPayload.trimStart().startsWith("CONNECT", ignoreCase = true)
      val isError = listOf(" 400", " 403", " 404", " 407", " 500", " 502").any { firstLine.contains(it) }
      if ((isConnect && !firstLine.contains(" 200") && !firstLine.contains(" 101")) || isError) {
        consumeHeaders(socket.getInputStream())
        error("Proxy HTTP a refusé la requête : ${firstLine.take(160)}")
      }
      consumeHeaders(socket.getInputStream())
      socket.soTimeout = 0
      compactLog("info", "Proxy HTTP accepté : ${firstLine.take(120)}")
      return socket
    } catch (error: Throwable) {
      try { socket.close() } catch (_: Throwable) {}
      throw error
    }
  }

  private fun expandPayload(raw: String): String = raw
    .replace("[host]", profile.sshHost, ignoreCase = true)
    .replace("[real_host]", profile.sshHost, ignoreCase = true)
    .replace("[port]", profile.sshPort, ignoreCase = true)
    .replace("[proxy_host]", profile.proxyHost, ignoreCase = true)
    .replace("[proxy_port]", profile.proxyPort, ignoreCase = true)
    .replace("[crlf]", "\r\n", ignoreCase = true)
    .replace("[cr]", "\r", ignoreCase = true)
    .replace("[lf]", "\n", ignoreCase = true)
    .replace("\\r\\n", "\r\n")
    .replace("\\r", "\r")
    .replace("\\n", "\n")

  private fun sendPayload(output: OutputStream, raw: String, payload: String) {
    when {
      raw.contains("[split]", ignoreCase = true) -> payload.split(Regex("\\[split]", RegexOption.IGNORE_CASE)).forEachIndexed { index, part ->
        output.write(part.toByteArray(HTTP_CHARSET)); output.flush()
        if (index < payload.split(Regex("\\[split]", RegexOption.IGNORE_CASE)).lastIndex) Thread.sleep(30)
      }
      raw.contains("[delay]", ignoreCase = true) -> payload.split("\r\n").forEach { line ->
        output.write((line + "\r\n").toByteArray(HTTP_CHARSET)); output.flush(); Thread.sleep(20)
      }
      else -> { output.write(payload.toByteArray(HTTP_CHARSET)); output.flush() }
    }
  }

  private fun readHttpLine(input: InputStream): String {
    val result = StringBuilder()
    var previous = -1
    while (result.length < 8_192) {
      val next = input.read()
      if (next < 0) break
      if (previous == '\r'.code && next == '\n'.code) {
        if (result.isNotEmpty()) result.deleteCharAt(result.lastIndex)
        break
      }
      if (next == '\n'.code) break
      result.append(next.toChar())
      previous = next
    }
    return result.toString()
  }

  private fun consumeHeaders(input: InputStream) {
    while (readHttpLine(input).isNotEmpty()) Unit
  }

  companion object {
    private const val HTTP_CONNECT_TIMEOUT_MS = 15_000
    private const val HTTP_RESPONSE_TIMEOUT_MS = 15_000
    private val HTTP_CHARSET: Charset = Charsets.ISO_8859_1
    private const val DEFAULT_PAYLOAD = "CONNECT [host]:[port] HTTP/1.1[crlf]Host: [host]:[port][crlf]Proxy-Connection: Keep-Alive[crlf][crlf]"
  }
}

class SshSslTlsTunnel(
  context: Context,
  profile: TunnelProfile,
  log: (String, String, String) -> Unit,
) : SshTransportTunnel(context, profile, "SSH SSL/TLS", log) {

  override fun openTransport(): Socket {
    val selected = profile.sslTlsVersion.ifBlank { "TLS" }
    // Many SSH-over-TLS endpoints accept TLS 1.2 but reject a ClientHello that
    // advertises newer protocol features. Only an automatic selection may fall
    // back; an explicit profile choice is always respected.
    val candidates = if (selected == "TLS") listOf("TLS", "TLSv1.2") else listOf(selected)
    var lastError: Throwable? = null
    for ((index, version) in candidates.withIndex()) {
      try {
        val socket = openTlsTransport(version)
        if (index > 0) compactLog("connection", "SSH SSL/TLS rétabli avec le repli $version")
        return socket
      } catch (error: Throwable) {
        lastError = error
        val sni = profile.sslSni.ifBlank { "aucun SNI" }
        compactLog("warning", "Handshake $version refusé par ${profile.sshHost}:${profile.sshPort} (SNI $sni) : ${error.message?.lineSequence()?.firstOrNull()?.take(120) ?: "erreur TLS"}")
      }
    }
    throw lastError ?: error("échec de négociation SSL/TLS")
  }

  private fun openTlsTransport(version: String): SSLSocket {
    val raw = Socket()
    protect(raw)
    raw.tcpNoDelay = true
    raw.keepAlive = true
    raw.connect(InetSocketAddress(profile.sshHost, profile.sshPort.toInt()), TLS_CONNECT_TIMEOUT_MS)
    try {
      val sslContext = SSLContext.getInstance(version).apply { init(null, TRUST_ALL, SecureRandom()) }
      val tls = sslContext.socketFactory.createSocket(raw, profile.sshHost, profile.sshPort.toInt(), true) as SSLSocket
      if (version == "TLSv1.2" || version == "TLSv1.3") tls.enabledProtocols = arrayOf(version)
      if (profile.sslSni.isNotBlank()) {
        tls.sslParameters = SSLParameters().apply { serverNames = listOf(SNIHostName(profile.sslSni)) }
      }
      tls.soTimeout = TLS_HANDSHAKE_TIMEOUT_MS
      tls.startHandshake()
      tls.soTimeout = 0
      compactLog("info", "Handshake SSL/TLS ${tls.session.protocol} réussi${if (profile.sslSni.isNotBlank()) " avec SNI ${profile.sslSni}" else ""}")
      return tls
    } catch (error: Throwable) {
      try { raw.close() } catch (_: Throwable) {}
      throw error
    }
  }

  companion object {
    private const val TLS_CONNECT_TIMEOUT_MS = 15_000
    private const val TLS_HANDSHAKE_TIMEOUT_MS = 20_000
    private val TRUST_ALL = arrayOf<TrustManager>(object : X509TrustManager {
      override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = Unit
      override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) = Unit
      override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    })
  }
}
