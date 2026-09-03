package expo.modules.kighmuvpnnative

import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.InetSocketAddress
import java.net.Socket

/**
 * Sonde Hotspot Share (100 % sans root) : récupère l'IP publique vue PAR LE
 * TUNNEL en passant une requête HTTP par le proxy SOCKS5 local du balancier.
 * L'app elle-même étant exclue du VPN (addDisallowedApplication), c'est le seul
 * moyen fidèle de connaître l'adresse de sortie réelle du tunnel.
 */
object HotspotProbe {
  fun fetchExitIpViaSocks(port: Int): String {
    if (port <= 0) return ""
    var socket: Socket? = null
    return try {
      socket = Socket()
      socket.connect(InetSocketAddress("127.0.0.1", port), 4000)
      socket.soTimeout = 8000
      val out = DataOutputStream(socket.getOutputStream())
      val input = DataInputStream(socket.getInputStream())

      // Négociation SOCKS5 sans authentification.
      out.write(byteArrayOf(5, 1, 0)); out.flush()
      if (input.readByte() != 5.toByte() || input.readByte() != 0.toByte()) return ""

      // CONNECT api.ipify.org:443 + TLS ClientHello (ATYP=domaine → résolution côté tunnel).
      val host = "api.ipify.org".toByteArray(Charsets.US_ASCII)
      out.write(byteArrayOf(5, 1, 0, 3, host.size.toByte())); out.write(host)
      out.writeShort(443); out.flush()
      // Réponse : VER REP RSV ATYP BND.ADDR BND.PORT
      if (input.readByte() != 5.toByte()) return ""
      if (input.readByte().toInt() != 0) return "" // REP != succeeded
      input.readByte() // RSV
      when (input.readByte().toInt()) { // ATYP
        1 -> input.skipBytes(6)
        3 -> { val len = input.readUnsignedByte(); input.skipBytes(len + 2) }
        4 -> input.skipBytes(18)
        else -> return ""
      }

      // TLS 1.2 ClientHello minimal + lecture ServerHello/Certificate puis extraction IP via HTTPS.
      // On encapsule la requête HTTPS dans le tunnel SOCKS : évite le HTTP clair spoofable par le FAI.
      val tlsSocket = try {
        val ctx = javax.net.ssl.SSLContext.getInstance("TLSv1.2")
        ctx.init(null, null, java.security.SecureRandom())
        val factory = ctx.socketFactory
        val ssl = factory.createSocket(socket, "api.ipify.org", 443, true) as javax.net.ssl.SSLSocket
        ssl.soTimeout = 8000
        ssl.startHandshake()
        ssl
      } catch (_: Throwable) { return "" }

      val out2 = tlsSocket.getOutputStream()
      val input2 = tlsSocket.getInputStream()
      val request = "GET /?kighmu=hotspot HTTP/1.0\r\nHost: api.ipify.org\r\nUser-Agent: KIGHMU-HotspotProbe\r\nConnection: close\r\n\r\n"
      out2.write(request.toByteArray(Charsets.US_ASCII)); out2.flush()

      val body = StringBuilder()
      val buffer = ByteArray(2048)
      var read: Int
      while (input2.read(buffer).also { read = it } >= 0) body.append(String(buffer, 0, read, Charsets.US_ASCII))
      try { tlsSocket.close() } catch (_: Throwable) {}
      val text = body.toString()
      val separator = text.indexOf("\r\n\r\n")
      val payload = if (separator >= 0) text.substring(separator + 4).trim() else ""
      payload.takeIf { Regex("""^[0-9a-fA-F.:]{3,45}$""").matches(it) } ?: ""
    } catch (_: Throwable) {
      ""
    } finally {
      try { socket?.close() } catch (_: Throwable) {}
    }
  }
}
