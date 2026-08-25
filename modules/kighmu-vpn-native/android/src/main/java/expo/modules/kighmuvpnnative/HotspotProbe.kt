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

      // CONNECT api.ipify.org:80 (ATYP=domaine → résolution côté tunnel).
      val host = "api.ipify.org".toByteArray(Charsets.US_ASCII)
      out.write(byteArrayOf(5, 1, 0, 3, host.size.toByte())); out.write(host)
      out.writeShort(80); out.flush()
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

      // GET minimal en HTTP/1.0 (connexion fermée en fin de réponse).
      val request = "GET /?kighmu=hotspot HTTP/1.0\r\nHost: api.ipify.org\r\nUser-Agent: KIGHMU-HotspotProbe\r\n\r\n"
      out.write(request.toByteArray(Charsets.US_ASCII)); out.flush()

      val body = StringBuilder()
      val buffer = ByteArray(2048)
      var read: Int
      while (input.read(buffer).also { read = it } >= 0) body.append(String(buffer, 0, read, Charsets.US_ASCII))
      val text = body.toString()
      val separator = text.indexOf("\r\n\r\n")
      val payload = if (separator >= 0) text.substring(separator + 4).trim() else ""
      // Une adresse IPv4/IPv6 plausible seulement.
      payload.takeIf { Regex("""^[0-9a-fA-F.:]{3,45}$""").matches(it) } ?: ""
    } catch (_: Throwable) {
      ""
    } finally {
      try { socket?.close() } catch (_: Throwable) {}
    }
  }
}
