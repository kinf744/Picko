package expo.modules.kighmuvpnnative

import android.content.Context
import android.net.VpnService
import com.trilead.ssh2.Connection
import com.trilead.ssh2.DynamicPortForwarder
import org.json.JSONObject
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

/**
 * Owns one HTTP proxy + payload transport, one SSH session and one local SOCKS5
 * listener. Instances never share a socket, listener or process with another profile.
 */
class HttpPayloadSshTunnel(
  private val context: Context,
  private val vpnService: VpnService,
  private val emit: (level: String, component: String, message: String) -> Unit,
  private val runtimeLabel: String,
) {
  data class Settings(
    val proxyHost: String,
    val proxyPort: Int,
    val payload: String,
    val sshHost: String,
    val sshPort: Int,
    val sshUsername: String,
    val sshPassword: String,
  ) {
    companion object {
      fun fromProfile(profile: JSONObject): Settings = Settings(
        proxyHost = profile.optString("proxyHost").trim(),
        proxyPort = profile.optString("proxyPort", "8080").toIntOrNull() ?: 8080,
        payload = profile.optString("payload").trim(),
        sshHost = profile.optString("sshHost").trim(),
        sshPort = profile.optString("sshPort", "22").toIntOrNull() ?: 22,
        sshUsername = profile.optString("sshUsername").trim(),
        sshPassword = profile.optString("sshPassword").trim(),
      )
    }

    fun validate() {
      require(proxyHost.isNotBlank()) { "Hôte du proxy HTTP manquant" }
      require(proxyPort in 1..65535) { "Port du proxy HTTP invalide" }
      require(payload.isNotBlank()) { "Payload HTTP manquant" }
      require(sshHost.isNotBlank()) { "Hôte SSH cible manquant" }
      require(sshPort in 1..65535) { "Port SSH cible invalide" }
      require(sshUsername.isNotBlank()) { "Identifiant SSH manquant" }
      require(sshPassword.isNotBlank()) { "Mot de passe SSH manquant" }
    }
  }

  @Volatile private var running = false
  private var proxySocket: Socket? = null
  private var bridgeServer: ServerSocket? = null
  private var sshConnection: Connection? = null
  private var dynamicForwarder: DynamicPortForwarder? = null

  @Synchronized
  fun start(settings: Settings): Int {
    settings.validate()
    check(!running) { "HTTP Proxy+Payload déjà en cours" }
    running = true
    try {
      val proxy = Socket()
      vpnService.protect(proxy)
      LocalTunnelIo.configure(proxy, LocalTunnelIo.HANDSHAKE_TIMEOUT_MS)
      proxy.connect(InetSocketAddress(settings.proxyHost, settings.proxyPort), LocalTunnelIo.HANDSHAKE_TIMEOUT_MS)
      proxySocket = proxy
      val payload = interpolatePayload(settings)
      sendPayload(proxy.getOutputStream(), payload, settings.payload)
      val response = readHttpLine(proxy.getInputStream())
      require(response.contains(" 200 ") || response.contains(" 101 ")) { "Proxy HTTP a refusé le payload : $response" }
      consumeHeaders(proxy.getInputStream())
      LocalTunnelIo.configure(proxy)
      emit("info", "HTTP_PAYLOAD", "[$runtimeLabel] proxy accepté : ${response.take(120)}")

      val bridgePort = startBridge(proxy)
      val socksPort = findFreePort()
      val connection = Connection("127.0.0.1", bridgePort)
      connection.connect(null, 20_000, 30_000)
      if (!connection.authenticateWithPassword(settings.sshUsername, settings.sshPassword)) {
        error("Authentification SSH refusée")
      }
      SshServerMessage.capture(connection) { message -> emit("connection", "SSH_SERVER_MESSAGE", message) }
      dynamicForwarder = connection.createDynamicPortForwarder(InetSocketAddress("127.0.0.1", socksPort))
      sshConnection = connection
      waitForSocksListener(socksPort)
      emit("info", "HTTP_PAYLOAD", "[$runtimeLabel] SSH authentifié ; SOCKS5 local 127.0.0.1:$socksPort")
      return socksPort
    } catch (error: Throwable) {
      stop()
      throw error
    }
  }

  @Synchronized
  fun stop() {
    running = false
    try { bridgeServer?.close() } catch (_: Throwable) {}
    bridgeServer = null
    try { dynamicForwarder?.close() } catch (_: Throwable) {}
    dynamicForwarder = null
    try { sshConnection?.close() } catch (_: Throwable) {}
    sshConnection = null
    try { proxySocket?.close() } catch (_: Throwable) {}
    proxySocket = null
  }

  private fun interpolatePayload(settings: Settings): String = settings.payload
    .replace("[host]", settings.sshHost, ignoreCase = true)
    .replace("[real_host]", settings.sshHost, ignoreCase = true)
    .replace("[port]", settings.sshPort.toString(), ignoreCase = true)
    .replace("[proxy_host]", settings.proxyHost, ignoreCase = true)
    .replace("[proxy_port]", settings.proxyPort.toString(), ignoreCase = true)
    .replace("[crlf]", "\r\n", ignoreCase = true)
    .replace("[cr]", "\r", ignoreCase = true)
    .replace("[lf]", "\n", ignoreCase = true)
    .replace("\\r\\n", "\r\n")
    .replace("\\r", "\r")
    .replace("\\n", "\n")

  private fun sendPayload(output: OutputStream, payload: String, rawPayload: String) {
    when {
      rawPayload.contains("[split]", ignoreCase = true) -> payload.split("[split]", ignoreCase = true).forEachIndexed { index, part ->
        output.write(part.toByteArray(Charsets.ISO_8859_1))
        output.flush()
        if (index < payload.split("[split]", ignoreCase = true).lastIndex) Thread.sleep(30)
      }
      rawPayload.contains("[delay]", ignoreCase = true) -> payload.split("\r\n").forEachIndexed { index, line ->
        output.write((line + if (index < payload.split("\r\n").lastIndex) "\r\n" else "").toByteArray(Charsets.ISO_8859_1))
        output.flush()
        Thread.sleep(20)
      }
      else -> {
        output.write(payload.toByteArray(Charsets.ISO_8859_1))
        output.flush()
      }
    }
  }

  private fun startBridge(remote: Socket): Int {
    val server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
    bridgeServer = server
    thread(isDaemon = true, name = "$runtimeLabel-http-ssh-bridge") {
      var client: Socket? = null
      try {
        client = server.accept()
        LocalTunnelIo.configure(client)
        val remoteInput = remote.getInputStream()
        val banner = readSshBanner(remoteInput)
        client.getOutputStream().write(banner.toByteArray())
        client.getOutputStream().flush()
        emit("connection", "SSH_BANNER", banner.trim().take(240))
        val returnPipe = thread(isDaemon = true) { pipe(remoteInput, client.getOutputStream()) }
        pipe(client.getInputStream(), remote.getOutputStream())
        returnPipe.join(300)
      } catch (error: Throwable) {
        if (running) emit("warning", "HTTP_PAYLOAD", "[$runtimeLabel] canal SSH interrompu : ${error.message ?: "erreur réseau"}")
      } finally {
        try { client?.close() } catch (_: Throwable) {}
        try { remote.close() } catch (_: Throwable) {}
        try { server.close() } catch (_: Throwable) {}
      }
    }
    return server.localPort
  }

  private fun readSshBanner(input: InputStream): String {
    val banner = StringBuilder()
    while (true) {
      val value = input.read()
      if (value < 0) error("Bannière SSH indisponible via proxy HTTP")
      banner.append(value.toChar())
      if (value == '\n'.code) break
      if (banner.length > 512) error("Bannière SSH invalide")
    }
    return banner.toString()
  }

  private fun consumeHeaders(input: InputStream) {
    while (readHttpLine(input).isNotEmpty()) { /* consume HTTP response headers */ }
  }

  private fun readHttpLine(input: InputStream): String {
    val line = StringBuilder()
    var previous = -1
    while (true) {
      val value = input.read()
      if (value < 0) break
      if (previous == '\r'.code && value == '\n'.code) {
        if (line.isNotEmpty()) line.deleteCharAt(line.length - 1)
        break
      }
      if (value == '\n'.code) break
      line.append(value.toChar())
      previous = value
    }
    return line.toString()
  }

  private fun findFreePort(): Int = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { it.localPort }

  private fun waitForSocksListener(port: Int) {
    var lastError: Throwable? = null
    repeat(15) {
      try {
        Socket().use { probe ->
          LocalTunnelIo.configure(probe, 500)
          probe.connect(InetSocketAddress("127.0.0.1", port), 500)
        }
        return
      } catch (error: Throwable) {
        lastError = error
        Thread.sleep(80)
      }
    }
    throw IllegalStateException("SOCKS5 HTTP Payload local indisponible sur 127.0.0.1:$port", lastError)
  }

  private fun pipe(input: InputStream, output: OutputStream) = LocalTunnelIo.pipe(input, output) { running }
}
