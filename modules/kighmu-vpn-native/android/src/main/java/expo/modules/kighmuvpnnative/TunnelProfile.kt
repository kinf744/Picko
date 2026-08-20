package expo.modules.kighmuvpnnative

import org.json.JSONArray
import org.json.JSONObject

data class TunnelProfile(
  val id: String,
  val name: String,
  val method: String,
  val host: String = "",
  val port: String = "",
  val obfs: String = "",
  val password: String = "",
  val sshHost: String = "",
  val sshPort: String = "22",
  val sshUser: String = "",
  val dnsServer: String = "8.8.8.8",
  val dnsPort: String = "53",
  val nameserver: String = "",
  val publicKey: String = "",
) {
  companion object {
    private const val ZIVPN = "zivpn-udp"
    private const val SLOWDNS = "ssh-slowdns"

    fun parseMany(json: String): List<TunnelProfile> {
      val array = JSONObject(json).optJSONArray("profiles") ?: JSONArray()
      return buildList {
        for (index in 0 until array.length()) {
          val source = array.optJSONObject(index) ?: continue
          val method = source.optString("method").trim()
          if (method != ZIVPN && method != SLOWDNS) continue
          add(TunnelProfile(
            id = source.optString("id").trim().ifBlank { "profile-$index" },
            name = source.optString("name").trim().ifBlank { if (method == ZIVPN) "ZiVPN UDP" else "SSH SlowDNS" },
            method = method,
            host = source.optString("host").trim(),
            port = source.optString("port").trim(),
            obfs = source.optString("obfs").trim(),
            password = source.optString("password").trim(),
            sshHost = source.optString("sshHost").trim(),
            sshPort = source.optString("sshPort", "22").trim(),
            sshUser = source.optString("sshUser").trim(),
            dnsServer = source.optString("dnsServer", "8.8.8.8").trim(),
            dnsPort = source.optString("dnsPort", "53").trim(),
            nameserver = source.optString("nameserver").trim(),
            publicKey = source.optString("publicKey").trim(),
          ))
        }
      }
    }
  }

  fun validate(): String? = when (method) {
    ZIVPN -> when {
      host.isBlank() -> "hôte ZiVPN manquant"
      port.toIntOrNull()?.let { it in 1..65535 } != true -> "port ZiVPN invalide"
      obfs.isBlank() -> "Obfs ZiVPN manquant"
      password.isBlank() -> "mot de passe ZiVPN manquant"
      else -> null
    }
    SLOWDNS -> when {
      sshHost.isBlank() -> "serveur SSH manquant"
      sshPort.toIntOrNull()?.let { it in 1..65535 } != true -> "port SSH invalide"
      sshUser.isBlank() -> "utilisateur SSH manquant"
      password.isBlank() -> "mot de passe SSH manquant"
      dnsServer.isBlank() -> "résolveur DNS manquant"
      dnsPort.toIntOrNull()?.let { it in 1..65535 } != true -> "port DNS invalide"
      nameserver.isBlank() -> "domaine SlowDNS manquant"
      normalizedPublicKey().isBlank() -> "clé publique DNSTT manquante"
      else -> null
    }
    else -> "méthode de tunnel inconnue"
  }

  fun normalizedPublicKey(): String = publicKey.filterNot { it.isWhitespace() || it in "()'\"`;&|$" }
}
