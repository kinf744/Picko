package expo.modules.kighmuvpnnative

import android.content.Context
import android.net.VpnService
import com.trilead.ssh2.Connection
import org.json.JSONObject
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import javax.net.ssl.SNIHostName
import javax.net.ssl.SSLParameters
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory
import kotlin.concurrent.thread

/**
 * One SSH-over-TLS profile. The transport socket, TLS bridge, SSH connection and
 * SOCKS5 listener are owned by this instance and never shared with other profiles.
 */
class SshTlsTunnel(
  private val context: Context,
  private val vpnService: VpnService,
  private val emit: (level: String, component: String, message: String) -> Unit,
  private val runtimeLabel: String,
) {
  data class Settings(
    val tlsHost: String,
    val tlsPort: Int,
    val sni: String,
    val sshUsername: String,
    val sshPassword: String,
  ) {
    companion object {
      fun fromProfile(profile: JSONObject): Settings = Settings(
        tlsHost = profile.optString("tlsHost").trim(),
        tlsPort = profile.optString("tlsPort", "443").toIntOrNull() ?: 443,
        sni = profile.optString("sni").trim(),
        sshUsername = profile.optString("sshUsername").trim(),
        sshPassword = profile.optString("sshPassword").trim(),
      )
    }

    fun validate() {
      require(tlsHost.isNotBlank()) { "Hôte SSL/TLS manquant" }
      require(tlsPort in 1..65535) { "Port SSL/TLS invalide" }
      require(sshUsername.isNotBlank()) { "Identifiant SSH manquant" }
      require(sshPassword.isNotBlank()) { "Mot de passe SSH manquant" }
    }
  }

  @Volatile private var running = false
  private var tlsSocket: SSLSocket? = null
  private var bridgeServer: ServerSocket? = null
  private var sshConnection: Connection? = null

  @Synchronized
  fun start(settings: Settings): Int {
    settings.validate()
    check(!running) { "SSH SSL/TLS déjà en cours" }
    running = true
    try {
      val tls = openTlsSocket(settings)
      tlsSocket = tls
      val bridgePort = startBridge(tls)
      val socksPort = findFreePort()
      val connection = Connection("127.0.0.1", bridgePort)
      connection.connect(null, 20_000, 30_000)
      if (!connection.authenticateWithPassword(settings.sshUsername, settings.sshPassword)) {
        error("Authentification SSH refusée")
      }
      connection.createDynamicPortForwarder(InetSocketAddress("127.0.0.1", socksPort))
      sshConnection = connection
      emit("info", "SSH_TLS", "[$runtimeLabel] TLS validé et SSH authentifié ; SOCKS5 local 127.0.0.1:$socksPort")
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
    try { sshConnection?.close() } catch (_: Throwable) {}
    sshConnection = null
    try { tlsSocket?.close() } catch (_: Throwable) {}
    tlsSocket = null
  }

  private fun openTlsSocket(settings: Settings): SSLSocket {
    val plainSocket = Socket()
    vpnService.protect(plainSocket)
    LocalTunnelIo.configure(plainSocket, LocalTunnelIo.HANDSHAKE_TIMEOUT_MS)
    plainSocket.connect(InetSocketAddress(settings.tlsHost, settings.tlsPort), LocalTunnelIo.HANDSHAKE_TIMEOUT_MS)
    val serverName = settings.sni.ifBlank { settings.tlsHost }
    val factory = SSLSocketFactory.getDefault() as SSLSocketFactory
    val socket = factory.createSocket(plainSocket, serverName, settings.tlsPort, true) as SSLSocket
    val parameters: SSLParameters = socket.sslParameters
    parameters.endpointIdentificationAlgorithm = "HTTPS"
    parameters.serverNames = listOf(SNIHostName(serverName))
    socket.sslParameters = parameters
    socket.enabledProtocols = socket.supportedProtocols.filter { it == "TLSv1.2" || it == "TLSv1.3" }.toTypedArray()
    require(socket.enabledProtocols.isNotEmpty()) { "Aucun protocole TLS moderne disponible" }
    socket.startHandshake()
    LocalTunnelIo.configure(socket)
    emit("info", "SSH_TLS", "[$runtimeLabel] handshake TLS validé vers $serverName")
    return socket
  }

  private fun startBridge(remote: SSLSocket): Int {
    val server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
    bridgeServer = server
    thread(isDaemon = true, name = "$runtimeLabel-ssh-tls-bridge") {
      var client: Socket? = null
      try {
        client = server.accept()
        LocalTunnelIo.configure(client)
        val remoteInput = remote.inputStream
        val banner = readSshBanner(remoteInput)
        client.getOutputStream().write(banner.toByteArray())
        client.getOutputStream().flush()
        emit("info", "SSH_TLS", "[$runtimeLabel] bannière SSH reçue à travers TLS")
        val returnPipe = thread(isDaemon = true) { pipe(remoteInput, client.getOutputStream()) }
        pipe(client.getInputStream(), remote.outputStream)
        returnPipe.join(300)
      } catch (error: Throwable) {
        if (running) emit("warning", "SSH_TLS", "[$runtimeLabel] canal SSH/TLS interrompu : ${error.message ?: "erreur réseau"}")
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
      if (value < 0) error("Bannière SSH indisponible à travers TLS")
      banner.append(value.toChar())
      if (value == '\n'.code) break
      if (banner.length > 512) error("Bannière SSH invalide")
    }
    return banner.toString()
  }

  private fun findFreePort(): Int = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { it.localPort }

  private fun pipe(input: InputStream, output: OutputStream) = LocalTunnelIo.pipe(input, output) { running }
}
