package expo.modules.kighmuvpnnative

import android.content.Context
import com.trilead.ssh2.Connection
import com.trilead.ssh2.DebugLogger
import com.trilead.ssh2.crypto.cipher.BlockCipherFactory
import com.trilead.ssh2.crypto.digest.HMAC
import java.io.InputStream
import java.security.Security
import org.bouncycastle.jce.provider.BouncyCastleProvider
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
  protected val dnsServers: List<String> = emptyList(),
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

  /** Log de diagnostic forcé (sans filtre) dans Download/kighmu.txt. */
  protected fun logDiag(message: String) {
    try { FileLogger.logForce(context, "SSHBridge", "[$component] $message") } catch (_: Throwable) {}
  }

  /** Transmet les logs de debug ganymed/sshlib vers kighmu.txt (composant SSHDBG). */
  private val sshDebugLogger = DebugLogger { level, className, message ->
    try { FileLogger.logForce(context, "SSHDBG", "[$className] $message") } catch (_: Throwable) {}
  }

  /** Enregistre BouncyCastle en position 1 pour fournir AES/CTR et Ed25519
   *  sans restriction JCE (contourne "Fatal error during MAC startup" sur les
   *  périphériques où le provider par défaut refuse AES). Android embarque un
   *  provider "BC" système souvent limité : on le retire pour insérer le nôtre
   *  (complet). BC n'implémente pas JSSE/SSLContext, donc le TLS de ssh-ssl-tls
   *  reste géré par Conscrypt. */
  private fun ensureBouncyCastle() {
    try {
      val ourName = BouncyCastleProvider.PROVIDER_NAME
      if (Security.getProvider(ourName)?.javaClass?.name != BouncyCastleProvider::class.java.name) {
        try { Security.removeProvider(ourName) } catch (_: Throwable) {}
        Security.insertProviderAt(BouncyCastleProvider(), 1)
      }
      logDiag("BouncyCastle prêt: ${Security.getProvider(ourName)?.javaClass?.name}")
    } catch (e: Throwable) {
      logDiag("BouncyCastle ignoré: ${e.message ?: "erreur"}")
    }
  }

  /** Sonde décisive : teste directement BlockCipherFactory.createCipher et HMAC
   *  sur le périphérique pour révéler l'exception réelle (sshlib la masque en
   *  "Fatal error during MAC startup"). */
  private fun probeCrypto() {
    for (c in arrayOf("aes128-ctr", "aes256-ctr", "aes128-cbc", "3des-ctr", "blowfish-ctr")) {
      try {
        val ks = BlockCipherFactory.getKeySize(c)
        val bs = BlockCipherFactory.getBlockSize(c)
        BlockCipherFactory.createCipher(c, true, ByteArray(ks), ByteArray(bs))
        logDiag("PROBE createCipher $c OK (ks=$ks bs=$bs)")
      } catch (e: Throwable) {
        logDiag("PROBE createCipher $c ÉCHEC: ${e::class.java.simpleName}: ${e.message ?: "sans message"}")
      }
    }
    for (m in arrayOf("hmac-sha1", "hmac-sha2-256", "hmac-md5")) {
      try {
        HMAC(m, ByteArray(64))
        logDiag("PROBE HMAC $m OK")
      } catch (e: Throwable) {
        logDiag("PROBE HMAC $m ÉCHEC: ${e::class.java.simpleName}: ${e.message ?: "sans message"}")
      }
    }
  }

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
    var lastError: Throwable? = null
    for (attempt in 0 until CONNECT_RETRY_ATTEMPTS) {
      if (stopRequested.get()) error(lastError?.message ?: "$component arrêté avant connexion")
      try {
        val opened = openTransport()
        transport = opened
        establishSshBridge(opened)
        if (!waitForSocks(SSH_SOCKS_TIMEOUT_MS)) error("$component n’a pas ouvert le proxy SOCKS local")
        return
      } catch (error: Throwable) {
        lastError = error
        logDiag("openAndAuthenticate tentative ${attempt + 1}/$CONNECT_RETRY_ATTEMPTS échouée : ${error.message}")
        compactLog("warning", "$component tentative ${attempt + 1}/$CONNECT_RETRY_ATTEMPTS échouée : ${error.message?.take(120)}")
        closeResources()
        if (attempt < CONNECT_RETRY_ATTEMPTS - 1) {
          // Le serveur (ex. EDOZTUNNEL/OpenSSH) renvoie parfois "Exceeded MaxStartups"
          // quand une nouvelle poignée de main SSH arrive trop tôt après la précédente :
          // on attend (backoff croissant) que sa fenêtre de connexions se libère.
          val delay = (CONNECT_BACKOFF_START_MS * (1 shl attempt)).coerceAtMost(CONNECT_BACKOFF_MAX_MS)
          compactLog("info", "$component nouvel essai dans ${delay / 1000}s…")
          try { Thread.sleep(delay) } catch (_: InterruptedException) { /* réveil anticipé, on continue */ }
        }
      }
    }
    error(lastError?.message ?: "$component échec de la connexion SSH")
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
        if (banner.startsWith("SSH-")) {
          // Bannière SSH valide : affichée dans sa propre zone du journal de connexion.
          log("connection", "SSH_BANNER", banner.trim())
          logDiag("Bannière SSH reçue : ${banner.trim().take(200)}")
        } else {
          // Message serveur (EDOZTUNNEL) autre que SSH : affiché coloré (balise <font>).
          log("warning", "SSH_SERVER_MESSAGE", "Server Message:\n\n${banner.trim()}")
          logDiag("Message serveur (non-SSH) reçu : ${banner.trim().take(200)}")
          error("Bannière SSH invalide du proxy ($component) : ${banner.trim().take(80)}")
        }
        Thread { pipe(remoteInput, client.getOutputStream()) }.apply { isDaemon = true; name = "picko-$component-remote-${profile.id.takeLast(8)}" }.start()
        pipe(client.getInputStream(), remote.getOutputStream())
      } catch (error: Throwable) {
        if (!stopRequested.get()) compactLog("warning", "Pont $component interrompu : ${error.message ?: "connexion fermée"}")
      } finally {
        // La reprise est assurée par la boucle de retry de openAndAuthenticate
        // (backoff) lors du démarrage, et par le health watcher en cours de route.
        // On n'enchaîne pas ici pour éviter une double reprise concurrentielle.
      }
    }.apply { isDaemon = true; name = "picko-$component-bridge-${profile.id.takeLast(8)}" }.start()
    bridgeReady.await(1, TimeUnit.SECONDS)

    val ssh = Connection("127.0.0.1", listener.localPort)
    try {
      // Active le debug ganymed pour journaliser la négociation (algorithmes
      // choisis + erreur réelle) dans kighmu.txt [SSHDBG].
      try { ssh.enableDebugging(true, sshDebugLogger) } catch (_: Throwable) {}
      // Enregistre BouncyCastle (AES/Ed25519 sans restriction JCE).
      ensureBouncyCastle()
      // Sonde : révèle l'exception réelle de createCipher/HMAC sur ce périphérique.
      probeCrypto()
      // Contourne "Fatal error during MAC startup" sur les périphériques où le
      // provider JCE refuse AES-256 (InvalidKeyException: Illegal key size).
      // On force des chiffrements 128 bits (aes128-ctr/cbc, 3des, blowfish),
      // tous gérés nativement par Conscrypt, et on évite aes256-*.
      try {
        val ciphers = arrayOf("aes128-ctr", "aes128-cbc", "3des-ctr", "3des-cbc", "blowfish-ctr", "blowfish-cbc")
        ssh.setClient2ServerCiphers(ciphers)
        ssh.setServer2ClientCiphers(ciphers)
        logDiag("SSH ciphers restreints à AES-128/3DES/Blowfish (contourne aes256 JCE)")
      } catch (cipherError: Throwable) {
        logDiag("SSH setCiphers ignoré: ${cipherError.message ?: "erreur"}")
      }
      // Restreint les MAC à hmac-sha1/md5 (que sshlib gère) pour éviter d'éventuels
      // algos ETM/hmac-sha2 que cette lib ne sait pas initialiser.
      try {
        val macs = arrayOf("hmac-sha1", "hmac-sha1-96", "hmac-md5", "hmac-md5-96")
        ssh.setClient2ServerMACs(macs)
        ssh.setServer2ClientMACs(macs)
        logDiag("SSH MAC restreint à hmac-sha1/md5")
      } catch (macError: Throwable) {
        logDiag("SSH setMAC ignoré: ${macError.message ?: "erreur"}")
      }
      logDiag("SSH connect -> 127.0.0.1:${listener.localPort} (timeout connect=${SSH_CONNECT_TIMEOUT_MS}ms kex=${SSH_KEX_TIMEOUT_MS}ms)")
      ssh.connect(null, SSH_CONNECT_TIMEOUT_MS, SSH_KEX_TIMEOUT_MS)
      logDiag("SSH connect OK ; auth user=${profile.sshUser}")
      if (!ssh.authenticateWithPassword(profile.sshUser, profile.password)) {
        logDiag("SSH AUTH REFUSÉE pour ${profile.sshUser}")
        error("authentification SSH refusée")
      }
      // Banner serveur post-auth (SSH_MSG_USERAUTH_BANNER) — ex. Edoztunnel :
      // "<h3><font color='blue'>This server is owned by Edoztunnel VPN...</font></h3>"
      // Centralisé dans le journal et coloré si HTML présent.
      try {
        val amField = ssh.javaClass.getDeclaredField("am")
        amField.isAccessible = true
        val am = amField.get(ssh)
        val bannerField = am.javaClass.getDeclaredField("banner")
        bannerField.isAccessible = true
        val serverBanner = bannerField.get(am) as? String
        if (!serverBanner.isNullOrBlank()) {
          log("warning", "SSH_SERVER_MESSAGE", "Server Message:\n\n${serverBanner.trim()}")
          logDiag("SSH banner serveur (post-auth): ${serverBanner.trim().take(500)}")
        }
      } catch (_: Throwable) {}
      log("success", "SSH", "Auth complete")
      ssh.createDynamicPortForwarder(InetSocketAddress("127.0.0.1", socksPort))
      connection = ssh
      logDiag("SSH port-forward SOCKS local créé sur 127.0.0.1:$socksPort")
      dnsServers.forEach { log("connection", "SSH", "DNS $it") }
      log("success", "SSH", "Connected")
    } catch (error: Throwable) {
      // Capture l'exception SSH complète (message + cause) pour diagnostiquer
      // la vraie cause (kex / host-key / identification) sans la masquer.
      val chain = generateSequence(error as Throwable?) { it.cause }
        .joinToString(" <- ") { "${it::class.java.simpleName}: ${it.message ?: "sans message"}" }
      logDiag("SSH ÉCHEC connect/auth: $chain")
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
    val raw = ByteArray(256)
    var rawCount = 0
    while (banner.length < MAX_BANNER_BYTES) {
      val next = input.read()
      if (next < 0) error("bannière SSH absente")
      if (rawCount < raw.size) raw[rawCount++] = next.toByte()
      banner.append(next.toChar())
      if (next == '\n'.code) {
        val text = banner.toString()
        logDiag("SSH flux brut (hex des ${rawCount} premiers octets après le 101): ${raw.copyOf(rawCount).toHex()}")
        // On ne rejette PAS ici : la bannière peut être un message serveur
        // (ex. EDOZTUNNEL « Exceeded MaxStartups » ou « server Is Dined… »).
        // L'appelant décide de l'affichage (SSH_BANNER vs SSH_SERVER_MESSAGE)
        // et lève l'erreur si la poignée de main SSH ne peut pas continuer.
        return text
      }
    }
    error("bannière SSH trop longue")
  }

  private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

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
    // Réessais avec backoff au démarrage : le serveur SSH (EDOZTUNNEL/OpenSSH)
    // renvoie parfois "Exceeded MaxStartups" si une nouvelle poignée de main arrive
    // trop tôt après une déconnexion. On attend (backoff croissant) que la fenêtre
    // de connexions du serveur se libère avant de rejouer le proxy+SSH.
    private const val CONNECT_RETRY_ATTEMPTS = 6
    private const val CONNECT_BACKOFF_START_MS = 6_000L
    private const val CONNECT_BACKOFF_MAX_MS = 30_000L

    fun freePort(): Int = try { ServerSocket(0).use { it.localPort } } catch (_: Throwable) { 10808 }
  }
}

class HttpProxyPayloadTunnel(
  context: Context,
  profile: TunnelProfile,
  log: (String, String, String) -> Unit,
  dnsServers: List<String> = emptyList(),
) : SshTransportTunnel(context, profile, "HTTP PROXY", log, dnsServers) {
  private val runtime by lazy { OpolNative.httpProxyPayloadRuntimePolicy(profile) }

  override fun openTransport(): Socket {
    val socket = Socket()
    protect(socket)
    socket.tcpNoDelay = true
    socket.keepAlive = true
    socket.receiveBufferSize = 128 * 1024
    socket.sendBufferSize = 128 * 1024
    socket.soTimeout = runtime.responseTimeoutMs
    diag("TENTATIVE connexion proxy ${profile.proxyHost}:${profile.proxyPort} connectMs=${runtime.connectTimeoutMs} responseMs=${runtime.responseTimeoutMs} split=${runtime.split} delay=${runtime.delay}")
    diag("PAYLOAD envoyé (masqué):\n${redactAuth(runtime.payload)}")
    val t0 = System.nanoTime()
    socket.connect(InetSocketAddress(profile.proxyHost, profile.proxyPort.toInt()), runtime.connectTimeoutMs)
    diag("Connecté au proxy en ${(System.nanoTime() - t0) / 1_000_000L} ms")
    try {
      sendPayload(socket.getOutputStream(), runtime.payload, runtime.split, runtime.delay)
      val firstLine = readHttpLine(socket.getInputStream())
      diag("RÉPONSE proxy (ligne 1 brute): $firstLine")
      val isConnect = runtime.payload.trimStart().startsWith("CONNECT", ignoreCase = true)
      val isError = listOf(" 400", " 403", " 404", " 407", " 500", " 502").any { firstLine.contains(it) }
      if ((isConnect && !firstLine.contains(" 200") && !firstLine.contains(" 101")) || isError) {
        consumeHeaders(socket.getInputStream())
        diag("REFUS proxy détecté: isConnect=$isConnect isError=$isError -> ${firstLine.take(300)}")
        error("Proxy HTTP a refusé la requête : ${firstLine.take(160)}")
      }
      consumeHeaders(socket.getInputStream())
      socket.soTimeout = 0
      // Réponse 101 du proxy EDOZTUNNEL : affichée colorée dans le journal de
      // connexion (la balise <font color> est interprétée par l'UI).
      log("connection", "SSH_SERVER_MESSAGE", "Response: $firstLine")
      diag("Proxy HTTP accepté: ${firstLine.take(200)}")
      return socket
    } catch (error: Throwable) {
      diag("EXCEPTION openTransport: ${error::class.java.simpleName}: ${error.message ?: "sans message"} ; cause=${error.cause?.message ?: "-"}")
      try { socket.close() } catch (_: Throwable) {}
      throw error
    }
  }

  /** Log de diagnostic forcé (sans filtre anti-verbeux) dans Download/kighmu.txt. */
  private fun diag(message: String) {
    try { FileLogger.logForce(context, "HTTPPAYLOAD", message) } catch (_: Throwable) {}
  }

  /** Masque les valeurs d'en-têtes d'authentification pour ne pas les écrire en clair. */
  private fun redactAuth(payload: String): String {
    return payload.lines().joinToString("\n") { line ->
      val idx = line.indexOf(':')
      if (idx > 0) {
        val name = line.substring(0, idx).trim()
        if (name.equals("Authorization", true) || name.equals("Proxy-Authorization", true)) {
          return@joinToString "${name}: ***MASQUÉ***"
        }
      }
      line
    }
  }

  private fun sendPayload(output: OutputStream, payload: String, split: Boolean, delay: Boolean) {
    when {
      split -> payload.split(Regex("\\[split]", RegexOption.IGNORE_CASE)).forEachIndexed { index, part ->
        output.write(part.toByteArray(HTTP_CHARSET)); output.flush()
        if (index < payload.split(Regex("\\[split]", RegexOption.IGNORE_CASE)).lastIndex) Thread.sleep(30)
      }
      delay -> payload.split("\r\n").forEach { line ->
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
    private val HTTP_CHARSET: Charset = Charsets.ISO_8859_1
  }
}

class SshSslTlsTunnel(
  context: Context,
  profile: TunnelProfile,
  log: (String, String, String) -> Unit,
  dnsServers: List<String> = emptyList(),
) : SshTransportTunnel(context, profile, "SSH SSL/TLS", log, dnsServers) {
  private val runtime by lazy { OpolNative.sshSslTlsRuntimePolicy(profile) }

  override fun openTransport(): Socket {
    val candidates = runtime.candidates
    var lastError: Throwable? = null
    for ((index, version) in candidates.withIndex()) {
      try {
        val socket = openTlsTransport(version)
        if (index > 0) compactLog("connection", "SSH SSL/TLS rétabli avec le repli $version")
        return socket
      } catch (error: Throwable) {
        lastError = error
        val sni = runtime.sni.ifBlank { "aucun SNI" }
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
    raw.connect(InetSocketAddress(profile.sshHost, profile.sshPort.toInt()), runtime.connectTimeoutMs)
    try {
      val sslContext = try {
        val tmf = javax.net.ssl.TrustManagerFactory.getInstance(javax.net.ssl.TrustManagerFactory.getDefaultAlgorithm())
        tmf.init(null as java.security.KeyStore?)
        val tm = tmf.trustManagers.filterIsInstance<X509TrustManager>().firstOrNull()
        if (tm != null) {
          SSLContext.getInstance(version).apply { init(null, arrayOf(tm), SecureRandom()) }
        } else SSLContext.getInstance(version).apply { init(null, TRUST_ALL, SecureRandom()) }
      } catch (_: Throwable) {
        SSLContext.getInstance(version).apply { init(null, TRUST_ALL, SecureRandom()) }
      }
      val tls = try {
        sslContext.socketFactory.createSocket(raw, profile.sshHost, profile.sshPort.toInt(), true) as SSLSocket
      } catch (e: Throwable) {
        // Fallback TRUST_ALL si le système refuse le cert auto-signé
        val fallback = SSLContext.getInstance(version).apply { init(null, TRUST_ALL, SecureRandom()) }
        logDiag("Fallback TRUST_ALL pour ${profile.sshHost} (cert auto-signé): ${e.message}")
        fallback.socketFactory.createSocket(raw, profile.sshHost, profile.sshPort.toInt(), true) as SSLSocket
      }
      if (version == "TLSv1.2" || version == "TLSv1.3") tls.enabledProtocols = arrayOf(version)
      if (runtime.sni.isNotBlank()) {
        tls.sslParameters = SSLParameters().apply { serverNames = listOf(SNIHostName(runtime.sni)) }
      }
      tls.soTimeout = runtime.handshakeTimeoutMs
      tls.startHandshake()
      tls.soTimeout = 0
      compactLog("info", "Handshake SSL/TLS ${tls.session.protocol} réussi${if (runtime.sni.isNotBlank()) " avec SNI ${runtime.sni}" else ""}")
      return tls
    } catch (error: Throwable) {
      try { raw.close() } catch (_: Throwable) {}
      throw error
    }
  }

  companion object {
    private val TRUST_ALL = arrayOf<TrustManager>(object : X509TrustManager {
      override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = Unit
      override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) = Unit
      override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    })
  }
}
