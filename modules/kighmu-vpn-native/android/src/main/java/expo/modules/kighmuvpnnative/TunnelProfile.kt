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
  val hysteriaHost: String = "",
  val hysteriaPort: String = "443",
  val hysteriaAuth: String = "",
  val hysteriaUpMbps: String = "100",
  val hysteriaDownMbps: String = "100",
  val hysteriaObfs: String = "",
  val xrayMode: String = "link",
  val xrayLink: String = "",
  val xrayJson: String = "",
  val proxyHost: String = "",
  val proxyPort: String = "8080",
  val httpPayload: String = "",
  val sslSni: String = "",
  val sslTlsVersion: String = "TLS",
) {
  companion object {
    private const val ZIVPN = "zivpn-udp"
    private const val SLOWDNS = "ssh-slowdns"
    private const val HYSTERIA = "hysteria-udp"
    private const val XRAY = "xray"
    private const val V2RAY_DNS = "v2ray-dns"
    private const val HTTP_PROXY_PAYLOAD = "http-proxy-payload"
    private const val SSH_SSL_TLS = "ssh-ssl-tls"

    fun parseMany(json: String): List<TunnelProfile> {
      val array = JSONObject(json).optJSONArray("profiles") ?: JSONArray()
      return buildList {
        for (index in 0 until array.length()) {
          val source = array.optJSONObject(index) ?: continue
          val method = source.optString("method").trim()
          if (method !in setOf(ZIVPN, SLOWDNS, HYSTERIA, XRAY, V2RAY_DNS, HTTP_PROXY_PAYLOAD, SSH_SSL_TLS)) continue
          val defaultName = when (method) {
            ZIVPN -> "ZiVPN UDP"
            SLOWDNS -> "SSH SlowDNS"
            HYSTERIA -> "Hysteria UDP"
            XRAY -> "Xray"
            V2RAY_DNS -> "V2Ray DNS"
            HTTP_PROXY_PAYLOAD -> "HTTP Proxy Payload"
            else -> "SSH SSL/TLS"
          }
          add(TunnelProfile(
            id = source.optString("id").trim().ifBlank { "profile-$index" },
            name = source.optString("name").trim().ifBlank { defaultName },
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
            hysteriaHost = source.optString("hysteriaHost").trim(),
            hysteriaPort = source.optString("hysteriaPort", "443").trim(),
            hysteriaAuth = source.optString("hysteriaAuth").trim(),
            hysteriaUpMbps = source.optString("hysteriaUpMbps", "100").trim(),
            hysteriaDownMbps = source.optString("hysteriaDownMbps", "100").trim(),
            hysteriaObfs = source.optString("hysteriaObfs").trim(),
            xrayMode = if (source.optString("xrayMode").trim() == "json") "json" else "link",
            xrayLink = source.optString("xrayLink").trim(),
            xrayJson = source.optString("xrayJson").trim(),
            proxyHost = source.optString("proxyHost").trim(),
            proxyPort = source.optString("proxyPort", "8080").trim(),
            httpPayload = source.optString("httpPayload").trim(),
            sslSni = source.optString("sslSni").trim(),
            sslTlsVersion = source.optString("sslTlsVersion", "TLS").trim().ifBlank { "TLS" },
          ))
        }
      }
    }
  }

  fun validate(): String? = when (method) {
    ZIVPN -> when {
      host.isBlank() -> "hôte ZiVPN manquant"
      !isValidPortOrRange(port) -> "port ZiVPN invalide"
      obfs.isBlank() -> "Obfs ZiVPN manquant"
      password.isBlank() -> "mot de passe ZiVPN manquant"
      else -> null
    }
    SLOWDNS -> when {
      sshHost.isBlank() -> "serveur SSH manquant"
      !isValidSinglePort(sshPort) -> "port SSH invalide"
      sshUser.isBlank() -> "utilisateur SSH manquant"
      password.isBlank() -> "mot de passe SSH manquant"
      dnsServer.isBlank() -> "résolveur DNS manquant"
      !isValidSinglePort(dnsPort) -> "port DNS invalide"
      nameserver.isBlank() -> "domaine SlowDNS manquant"
      normalizedPublicKey().isBlank() -> "clé publique DNSTT manquante"
      else -> null
    }
    HYSTERIA -> when {
      hysteriaHost.isBlank() -> "serveur Hysteria manquant"
      !isValidPortOrRange(hysteriaPort) -> "port Hysteria invalide"
      hysteriaAuth.isBlank() -> "mot de passe Hysteria manquant"
      !isValidMbps(hysteriaUpMbps) -> "débit montant Hysteria invalide"
      !isValidMbps(hysteriaDownMbps) -> "débit descendant Hysteria invalide"
      else -> null
    }
    XRAY -> validateXrayInput()
    V2RAY_DNS -> when {
      validateXrayInput() != null -> validateXrayInput()
      dnsServer.isBlank() -> "résolveur DNS manquant"
      !isValidSinglePort(dnsPort) -> "port DNS invalide"
      nameserver.isBlank() -> "domaine SlowDNS manquant"
      normalizedPublicKey().isBlank() -> "clé publique DNSTT manquante"
      else -> null
    }
    HTTP_PROXY_PAYLOAD -> when {
      sshHost.isBlank() -> "serveur SSH manquant"
      !isValidSinglePort(sshPort) -> "port SSH invalide"
      sshUser.isBlank() -> "utilisateur SSH manquant"
      password.isBlank() -> "mot de passe SSH manquant"
      proxyHost.isBlank() -> "serveur proxy HTTP manquant"
      !isValidSinglePort(proxyPort) -> "port proxy HTTP invalide"
      httpPayload.isBlank() -> "payload HTTP manquant"
      else -> null
    }
    SSH_SSL_TLS -> when {
      sshHost.isBlank() -> "serveur SSL/TLS manquant"
      !isValidSinglePort(sshPort) -> "port SSL/TLS invalide"
      sshUser.isBlank() -> "utilisateur SSH manquant"
      password.isBlank() -> "mot de passe SSH manquant"
      sslTlsVersion !in setOf("TLS", "TLSv1.2", "TLSv1.3") -> "version TLS invalide"
      else -> null
    }
    else -> "méthode de tunnel inconnue"
  }

  fun normalizedPublicKey(): String = publicKey.filterNot { it.isWhitespace() || it in "()'\"`;&|$" }

  private fun validateXrayInput(): String? = when {
    xrayMode == "json" && xrayJson.isBlank() -> "JSON Xray manquant"
    xrayMode == "link" && !xrayLink.matches(Regex("^(vmess|vless|trojan)://.+")) -> "lien Xray vmess, vless ou trojan invalide"
    xrayMode == "json" && !isJsonXray(xrayJson) -> "JSON Xray invalide ou sans outbounds"
    else -> null
  }

  private fun isJsonXray(value: String): Boolean = try {
    JSONObject(value).optJSONArray("outbounds") != null
  } catch (_: Throwable) { false }

  private fun isValidSinglePort(value: String): Boolean = value.toIntOrNull()?.let { it in 1..65535 } == true

  private fun isValidPortOrRange(value: String): Boolean {
    if (isValidSinglePort(value)) return true
    val match = Regex("^(\\d+)\\s*-\\s*(\\d+)$").matchEntire(value.trim()) ?: return false
    val start = match.groupValues[1].toIntOrNull() ?: return false
    val end = match.groupValues[2].toIntOrNull() ?: return false
    return start in 1..65535 && end in 1..65535 && start <= end
  }

  private fun isValidMbps(value: String): Boolean = value.toDoubleOrNull()?.let { it > 0.0 && it <= 100000.0 } == true
}
