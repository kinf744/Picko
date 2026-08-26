package expo.modules.kighmuvpnnative

import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors

/**
 * Passerelle de partage Hotspot (100 % sans root).
 *
 * Ouvre UN port sur toutes les interfaces (0.0.0.0) qui accepte deux protocoles
 * (détection au premier octet) :
 *  - HTTP : CONNECT host:port (HTTPS) et requêtes en forme absolue (http://) —
 *    c'est ce que proposent les réglages proxy Wi-Fi d'Android/iOS ;
 *  - SOCKS5 sans authentification — pour PC et applications avancées.
 *
 * Chaque connexion cliente est relayée vers le balancier local
 * (127.0.0.1:KighmuVpnService.currentBalancerPort) qui distribue dans les
 * tunnels actifs : le trafic des clients sort donc par le VPN, et la
 * résolution des noms de domaine se fait côté tunnel (anti-fuite DNS).
 *
 * Sécurité : la passerelle n'est joignable que depuis le réseau du hotspot,
 * protégé par le mot de passe WPA2/WPA3 défini par l'utilisateur.
 */
object LanShareGateway {
  private val workers = Executors.newCachedThreadPool()
  private var server: ServerSocket? = null
  @Volatile private var running = false
  @Volatile private var activePort: Int = 0

  /** Démarre la passerelle ; retourne le port réel (repli sur un port libre si préféré occupé). */
  fun start(preferredPort: Int): Int {
    stop()
    val socket = ServerSocket()
    socket.reuseAddress = true
    try {
      socket.bind(InetSocketAddress(InetAddress.getByName("0.0.0.0"), preferredPort.coerceIn(1024, 65535)), 64)
    } catch (_: Throwable) {
      socket.bind(InetSocketAddress(InetAddress.getByName("0.0.0.0"), 0), 64)
    }
    server = socket
    activePort = socket.localPort
    running = true
    Thread {
      while (running) {
        try {
          val client = socket.accept() ?: break
          workers.execute { handle(client) }
        } catch (_: Throwable) {
          if (running) continue else break
        }
      }
    }.apply { isDaemon = true; name = "picko-lan-share" }.start()
    return socket.localPort
  }

  fun stop() {
    running = false
    try { server?.close() } catch (_: Throwable) {}
    server = null
    activePort = 0
  }

  fun isRunning(): Boolean = running && server?.isClosed == false

  fun portOrNull(): Int? = if (isRunning()) server?.localPort else null

  private fun handle(client: Socket) {
    try {
      client.soTimeout = 20_000
      val input = DataInputStream(client.getInputStream())
      val first = input.readUnsignedByte() // SO_TIMEOUT : le client doit parler vite
      // Handshake borné dans le temps (client lent/malveillant ne bloque pas un worker).
      client.soTimeout = 10_000
      // Premier octet 0x05 = version SOCKS5 ; sinon protocole HTTP.
      val remote = if (first == 5) SocksBridge.connect(input, client.getOutputStream()) ?: run { closeQuietly(client); return }
      else HttpBridge.connect(first, input, client.getOutputStream()) ?: run { closeQuietly(client); return }
      client.soTimeout = 0
      remote.soTimeout = 0
      pumpBoth(client, remote)
    } catch (_: Throwable) {
      try { client.close() } catch (_: Throwable) {}
    }
  }

  private fun closeQuietly(socket: Socket) {
    try { socket.close() } catch (_: Throwable) {}
  }

  private fun balancerPort(): Int = KighmuVpnService.currentBalancerPort.takeIf { it > 0 } ?: -1

  private fun pumpBoth(a: Socket, b: Socket) {
    val toRemote = Thread {
      try { a.getInputStream().copyTo(b.getOutputStream()) } catch (_: Throwable) {} finally { try { b.shutdownOutput() } catch (_: Throwable) {} }
    }
    val toClient = Thread {
      try { b.getInputStream().copyTo(a.getOutputStream()) } catch (_: Throwable) {} finally { try { a.shutdownOutput() } catch (_: Throwable) {} }
    }
    toRemote.isDaemon = true; toClient.isDaemon = true
    toRemote.start(); toClient.start()
    try { toRemote.join(); toClient.join() } finally {
      try { a.close() } catch (_: Throwable) {}
      try { b.close() } catch (_: Throwable) {}
    }
  }

  /** Ouvre une connexion SOCKS5 vers le balancier local pour host:port. */
  internal fun dialBalanced(host: String, port: Int): Socket? {
    val balancer = balancerPort()
    if (balancer <= 0) return null
    val sock = Socket()
    sock.connect(InetSocketAddress(InetAddress.getByName("127.0.0.1"), balancer), 5000)
    sock.soTimeout = 10_000
    val out = DataOutputStream(sock.getOutputStream())
    val input = DataInputStream(sock.getInputStream())
    out.write(byteArrayOf(5, 1, 0)); out.flush()
    if (input.readByte() != 5.toByte() || input.readByte() != 0.toByte()) { sock.close(); return null }
    val hostBytes = host.toByteArray(Charsets.US_ASCII)
    out.write(byteArrayOf(5, 1, 0, 3, hostBytes.size.toByte())); out.write(hostBytes)
    out.writeShort(port); out.flush()
    if (input.readByte() != 5.toByte()) { sock.close(); return null }
    if (input.readByte().toInt() != 0) { sock.close(); return null }
    input.readByte() // RSV
    when (input.readByte().toInt()) {
      1 -> input.skipBytes(6)
      3 -> { val len = input.readUnsignedByte(); input.skipBytes(len + 2) }
      4 -> input.skipBytes(18)
      else -> { sock.close(); return null }
    }
    sock.soTimeout = 0
    return sock
  }

  // --- protocole HTTP (CONNECT + forme absolue) -----------------------------

  private object HttpBridge {
    fun connect(firstByte: Int, input: DataInputStream, output: java.io.OutputStream): Socket? {
      val head = buildString {
        append(firstByte.toChar())
        while (true) {
          val b = input.read()
          if (b < 0) return null
          append(b.toChar())
          if (length >= 4 && substring(length - 4) == "\r\n\r\n") break
          if (length > 16_384) return null
        }
      }
      val lines = head.split("\r\n")
      val requestLine = lines.firstOrNull()?.trim().orEmpty()
      val parts = requestLine.split(" ")
      if (parts.size < 3) { respond(output, "400 Bad Request"); return null }
      val method = parts[0].uppercase()
      val target = parts[1]

      val host: String
      val port: Int
      var path = "/"
      if (method == "CONNECT") {
        val idx = target.lastIndexOf(":")
        if (idx <= 0) { respond(output, "400 Bad Request"); return null }
        host = target.substring(0, idx)
        port = target.substring(idx + 1).toIntOrNull() ?: 443
      } else {
        val schemeIdx = target.indexOf("://")
        if (schemeIdx <= 0 || !target.startsWith("http", ignoreCase = true)) { respond(output, "400 Only proxied http:// is supported"); return null }
        val authority = target.substring(schemeIdx + 3).substringBefore('/')
        path = "/" + target.substring(schemeIdx + 3).substringAfter('/', "")
        val idx = authority.lastIndexOf(":")
        host = if (idx > 0) authority.substring(0, idx) else authority
        port = if (idx > 0) authority.substring(idx + 1).toIntOrNull() ?: 80 else 80
      }

      // Script PAC (technique PdaNet) : une requête HTTP locale (GET / ou /wpad.dat)
      // renvoie la configuration de proxy automatique — config client en un seul champ.
      if (isPacRequest(host, path)) {
        respondPac(output)
        return null
      }

      val remote = dialBalanced(host, port) ?: run { respond(output, "502 VPN tunnel unavailable"); return null }

      if (method == "CONNECT") {
        respond(output, "200 Connection established")
      } else {
        // Reécrit la ligne en forme origine et retire les entêtes de saut.
        val rewritten = StringBuilder("$method $path HTTP/1.1\r\n")
        var hasHost = false
        lines.drop(1).takeWhile { it.isNotBlank() }.forEach { header ->
          val lower = header.lowercase()
          if (lower.startsWith("proxy-connection:") || lower.startsWith("proxy-authorization:")) return@forEach
          if (lower.startsWith("host:")) hasHost = true
          rewritten.append(header).append("\r\n")
        }
        if (!hasHost) rewritten.append("Host: ").append(host).append(if (port != 80) ":$port" else "").append("\r\n")
        rewritten.append("Connection: close\r\n\r\n")
        remote.getOutputStream().write(rewritten.toString().toByteArray(Charsets.US_ASCII))
        remote.getOutputStream().flush()
      }
      return remote
    }

    private fun respond(output: java.io.OutputStream, status: String) {
      try { output.write("HTTP/1.1 $status\r\nConnection: close\r\n\r\n".toByteArray(Charsets.US_ASCII)); output.flush() } catch (_: Throwable) {}
    }

    private fun isPacRequest(host: String, path: String): Boolean {
      if (path.endsWith("/wpad.dat")) return true
      return localIps().contains(host) // navigation vers http://<ip-du-téléphone>:<port>/
    }

    private fun localIps(): List<String> = try {
      java.util.Collections.list(java.net.NetworkInterface.getNetworkInterfaces())
        .flatMap { nif -> java.util.Collections.list(nif.inetAddresses) }
        .filter { it is java.net.Inet4Address && !it.isLoopbackAddress && it.isSiteLocalAddress }
        .map { it.hostAddress.orEmpty() }
        .filter { it.isNotBlank() }
    } catch (_: Throwable) { emptyList() }

    private fun respondPac(output: java.io.OutputStream) {
      // IP préférée : 192.168.49.1 (adresse fixe du propriétaire Wi-Fi Direct, comme PdaNet),
      // sinon la première IP locale disponible.
      val preferred = listOf("192.168.49.1") + localIps()
      val proxyIp = preferred.firstOrNull { localIps().contains(it) } ?: "127.0.0.1"
      val port = activePort
      val body = "function FindProxyForURL(url, host) {\r\n" +
        "  if (isPlainHostName(host) || shExpMatch(host, \"127.*\") || shExpMatch(host, \"192.168.*\") || shExpMatch(host, \"10.*\")) return \"DIRECT\";\r\n" +
        "  return \"PROXY $proxyIp:$port; DIRECT\";\r\n" +
        "}\r\n"
      try {
        val head = "HTTP/1.1 200 OK\r\nContent-Type: application/x-ns-proxy-autoconfig\r\nContent-Length: ${body.toByteArray(Charsets.US_ASCII).size}\r\nConnection: close\r\n\r\n"
        output.write(head.toByteArray(Charsets.US_ASCII))
        output.write(body.toByteArray(Charsets.US_ASCII))
        output.flush()
      } catch (_: Throwable) {}
    }
  }

  // --- protocole SOCKS5 (serveur frontal sans auth) --------------------------

  private object SocksBridge {
    fun connect(input: DataInputStream, output: java.io.OutputStream): Socket? {
      if (input.readByte() != 0.toByte()) return null // RSV
      val methodCount = input.readByte().toInt()
      repeat(methodCount) { input.readByte() }
      // Le balancier n'accepte pas d'authentification : annoncer NO-AUTH seulement.
      output.write(byteArrayOf(5, 0)); output.flush()

      if (input.readByte() != 5.toByte()) return null
      val command = input.readByte().toInt()
      if (command != 1) { output.write(byteArrayOf(5, 7, 0, 1, 0, 0, 0, 0, 0, 0)); return null } // COMMAND NOT SUPPORTED
      input.readByte() // RSV
      val atyp = input.readByte().toInt()
      val host: String
      when (atyp) {
        1 -> host = ByteArray(4).also { input.readFully(it) }.joinToString(".") { (it.toInt() and 0xFF).toString() }
        3 -> { val len = input.readUnsignedByte(); host = ByteArray(len).also { input.readFully(it) }.toString(Charsets.US_ASCII) }
        4 -> { val raw = ByteArray(16); input.readFully(raw); host = ipv6ToString(raw) }
        else -> return null
      }
      val port = input.readUnsignedShort()

      val remote = dialBalanced(host, port)
      if (remote == null) {
        output.write(byteArrayOf(5, 5, 0, 1, 0, 0, 0, 0, 0, 0)); output.flush() // CONNECTION REFUSED
        return null
      }
      output.write(byteArrayOf(5, 0, 0, 1, 0, 0, 0, 0, 0, 0)); output.flush() // succeeded (BND factice)
      return remote
    }

    private fun ipv6ToString(raw: ByteArray): String =
      (0 until 8).joinToString(":") { "%02x%02x".format(raw[it * 2], raw[it * 2 + 1]) }
  }
}
