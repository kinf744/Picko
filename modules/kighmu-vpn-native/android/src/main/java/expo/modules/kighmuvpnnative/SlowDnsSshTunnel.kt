package expo.modules.kighmuvpnnative

import android.content.Context
import android.net.VpnService
import com.trilead.ssh2.Connection
import org.json.JSONObject
import java.io.File
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * One SSH-over-SlowDNS session. This class deliberately owns one dnstt process,
 * one SSH connection and one local SOCKS5 listener: no balancing or parallel sessions.
 */
class SlowDnsSshTunnel(
  private val context: Context,
  private val vpnService: VpnService,
  private val emit: (level: String, component: String, message: String) -> Unit,
  private val dnsttBinaryName: String = "libdnstt-slowdns.so",
  private val runtimeLabel: String = "slowdns",
) {
  data class Settings(
    val dnsServer: String,
    val dnsPort: Int,
    val nameserver: String,
    val publicKey: String,
    val sshUsername: String,
    val sshPassword: String,
    val sshLabel: String,
  ) {
    companion object {
      fun fromJson(root: JSONObject): Settings {
        val slowDns = root.optJSONObject("slowDns") ?: JSONObject()
        return Settings(
          dnsServer = slowDns.optString("dnsServer").trim(),
          dnsPort = slowDns.optInt("dnsPort", 53),
          nameserver = slowDns.optString("nameserver").trim().trimEnd('.'),
          publicKey = slowDns.optString("publicKey").trim().replace(Regex("\\s+"), ""),
          sshUsername = slowDns.optString("sshUsername").trim(),
          sshPassword = slowDns.optString("sshPassword").trim(),
          sshLabel = slowDns.optString("sshHost").trim(),
        )
      }

      fun fromProfile(profile: JSONObject): Settings = Settings(
        dnsServer = profile.optString("dnsServer").trim(),
        dnsPort = profile.optString("dnsPort", "53").toIntOrNull() ?: 53,
        nameserver = profile.optString("nameserver").trim().trimEnd('.'),
        publicKey = profile.optString("publicKey").trim().replace(Regex("\\s+"), ""),
        sshUsername = profile.optString("sshUsername").trim(),
        sshPassword = profile.optString("sshPassword").trim(),
        sshLabel = profile.optString("sshHost").trim(),
      )
    }

    fun validate() {
      require(dnsServer.isNotBlank()) { "Serveur DNS SlowDNS manquant" }
      require(dnsPort in 1..65535) { "Port DNS SlowDNS invalide" }
      require(nameserver.isNotBlank()) { "Nameserver SlowDNS manquant" }
      require(nameserver.matches(Regex("[A-Za-z0-9.-]+"))) { "Nameserver SlowDNS invalide" }
      require(publicKey.isNotBlank()) { "Clé publique SlowDNS manquante" }
      require(sshUsername.isNotBlank()) { "Identifiant SSH manquant" }
      require(sshPassword.isNotBlank()) { "Mot de passe SSH manquant" }
    }
  }

  @Volatile private var running = false
  private var dnsttProcess: Process? = null
  private var sshConnection: Connection? = null
  private var bannerServer: ServerSocket? = null
  private var dnsttPort = -1
  private var socksPort = -1

  @Synchronized
  fun start(settings: Settings): Int {
    settings.validate()
    check(!running) { "SlowDNS déjà en cours" }
    running = true
    try {
      dnsttPort = findFreePort()
      socksPort = findFreePort()
      startDnstt(settings)
      waitForAlive(dnsttProcess ?: error("Processus dnstt absent"), 800L)
      val bannerPort = startBannerProxy()
      emit("info", "SSH", "Ouverture du canal SSH via SlowDNS")
      val connection = Connection("127.0.0.1", bannerPort)
      connection.connect(null, 20_000, 30_000)
      if (!connection.authenticateWithPassword(settings.sshUsername, settings.sshPassword)) {
        throw IllegalStateException("Authentification SSH refusée")
      }
      connection.createDynamicPortForwarder(InetSocketAddress("127.0.0.1", socksPort))
      sshConnection = connection
      emit("info", "SSH", "Authentification réussie ; SOCKS5 local prêt sur 127.0.0.1:$socksPort")
      return socksPort
    } catch (error: Throwable) {
      stop()
      throw error
    }
  }

  @Synchronized
  fun stop() {
    running = false
    try { bannerServer?.close() } catch (_: Throwable) {}
    bannerServer = null
    try { sshConnection?.close() } catch (_: Throwable) {}
    sshConnection = null
    val process = dnsttProcess
    dnsttProcess = null
    if (process != null) {
      try { process.destroy() } catch (_: Throwable) {}
      try { process.waitFor(700, TimeUnit.MILLISECONDS) } catch (_: Throwable) {}
      if (process.isAlive) try { process.destroyForcibly() } catch (_: Throwable) {}
    }
    dnsttPort = -1
    socksPort = -1
  }

  private fun startDnstt(settings: Settings) {
    val binary = File(context.applicationInfo.nativeLibraryDir, dnsttBinaryName)
    require(binary.exists() && binary.length() > 0L && binary.canExecute()) {
      "$dnsttBinaryName ARMv7 est absent ou non exécutable"
    }
    val command = listOf(
      binary.absolutePath,
      "-udp", "${settings.dnsServer}:${settings.dnsPort}",
      "-pubkey", settings.publicKey,
      settings.nameserver,
      "127.0.0.1:$dnsttPort",
    )
    val process = ProcessBuilder(command)
      .directory(context.filesDir)
      .apply {
        environment()["LD_LIBRARY_PATH"] = context.applicationInfo.nativeLibraryDir
        environment()["HOME"] = context.filesDir.absolutePath
        environment()["TMPDIR"] = context.cacheDir.absolutePath
        redirectErrorStream(true)
      }
      .start()
    dnsttProcess = process
    emit("info", "SLOWDNS", "[$runtimeLabel] client dnstt ARMv7 démarré ; canal local 127.0.0.1:$dnsttPort")
    thread(isDaemon = true, name = "$runtimeLabel-native-log") {
      try {
        process.inputStream.bufferedReader().useLines { lines ->
          lines.forEach { line ->
            if (running && line.isNotBlank()) emit("info", "SLOWDNS", line.take(350))
          }
        }
      } catch (error: Throwable) {
        if (running) emit("warning", "SLOWDNS", "Lecture du journal dnstt interrompue")
      }
    }
  }

  private fun startBannerProxy(): Int {
    val server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
    bannerServer = server
    thread(isDaemon = true, name = "slowdns-ssh-banner") {
      var client: Socket? = null
      var remote: Socket? = null
      try {
        client = server.accept()
        remote = Socket()
        vpnService.protect(remote)
        LocalTunnelIo.configure(remote, LocalTunnelIo.HANDSHAKE_TIMEOUT_MS)
        remote.connect(InetSocketAddress("127.0.0.1", dnsttPort), LocalTunnelIo.HANDSHAKE_TIMEOUT_MS)
        val remoteInput = remote.getInputStream()
        val banner = StringBuilder()
        while (true) {
          val value = remoteInput.read()
          if (value < 0) throw IllegalStateException("Bannière SSH indisponible via SlowDNS")
          banner.append(value.toChar())
          if (value == '\n'.code) break
          if (banner.length > 512) throw IllegalStateException("Bannière SSH invalide")
        }
        LocalTunnelIo.configure(client)
        client.getOutputStream().write(banner.toString().toByteArray())
        client.getOutputStream().flush()
        LocalTunnelIo.configure(remote)
        emit("info", "SSH", "Bannière SSH reçue via SlowDNS")
        val clientInput = client.getInputStream()
        val clientOutput = client.getOutputStream()
        val remoteOutput = remote.getOutputStream()
        val toClient = thread(isDaemon = true) { pipe(remoteInput, clientOutput) }
        pipe(clientInput, remoteOutput)
        toClient.join(300)
      } catch (error: Throwable) {
        if (running) emit("warning", "SSH", "Canal SSH SlowDNS interrompu : ${error.message ?: "erreur réseau"}")
      } finally {
        try { client?.close() } catch (_: Throwable) {}
        try { remote?.close() } catch (_: Throwable) {}
      }
    }
    return server.localPort
  }

  private fun waitForAlive(process: Process, delayMs: Long) {
    Thread.sleep(delayMs)
    if (!process.isAlive) throw IllegalStateException("dnstt s’est arrêté au démarrage")
  }

  private fun findFreePort(): Int = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { it.localPort }

  private fun pipe(input: java.io.InputStream, output: java.io.OutputStream) =
    LocalTunnelIo.pipe(input, output) { running }
}
