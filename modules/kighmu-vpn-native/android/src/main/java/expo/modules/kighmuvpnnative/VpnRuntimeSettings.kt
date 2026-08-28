package expo.modules.kighmuvpnnative

import org.json.JSONObject
import java.net.InetAddress
import java.net.URI

data class VpnRuntimeSettings(
  val customDnsEnabled: Boolean = false,
  val dnsPrimary: String = "1.1.1.1",
  val dnsSecondary: String = "1.0.0.1",
  val mtu: Int = 1400,
  val wakeLockEnabled: Boolean = false,
  val profileNameInNotification: Boolean = true,
  val debugMode: Boolean = false,
  val pingEnabled: Boolean = true,
  val httpPingEnabled: Boolean = true,
  val httpPingUrl: String = "https://www.google.com/generate_204",
  val httpPingIntervalMs: Long = 5_000L,
  val httpPingTimeoutMs: Int = 5_000,
  val reconnectAfterFailures: Int = 3,
  val alwaysReconnect: Boolean = true,
) {
  fun dnsServers(): List<String> {
    if (!customDnsEnabled) return listOf("8.8.8.8", "1.1.1.1")
    return listOf(dnsPrimary, dnsSecondary).mapNotNull { value ->
      runCatching { InetAddress.getByName(value.trim()).hostAddress }.getOrNull()
    }.distinct().ifEmpty { listOf("8.8.8.8", "1.1.1.1") }
  }

  companion object {
    fun parse(root: JSONObject): VpnRuntimeSettings {
      val source = root.optJSONObject("settings") ?: JSONObject()
      val default = VpnRuntimeSettings()
      val url = source.optString("httpPingUrl", default.httpPingUrl).trim()
      val verifiedUrl = runCatching {
        URI(url).let { uri -> if (uri.scheme in setOf("http", "https") && !uri.host.isNullOrBlank()) url else default.httpPingUrl }
      }.getOrDefault(default.httpPingUrl)
      val interval = source.optString("httpPingIntervalMs", default.httpPingIntervalMs.toString()).toLongOrNull()?.coerceIn(1_000L, 120_000L) ?: default.httpPingIntervalMs
      val timeout = source.optString("httpPingTimeoutMs", default.httpPingTimeoutMs.toString()).toIntOrNull()?.coerceIn(1_000, minOf(60_000, interval.toInt())) ?: default.httpPingTimeoutMs
      return VpnRuntimeSettings(
        customDnsEnabled = source.optBoolean("customDnsEnabled", default.customDnsEnabled),
        dnsPrimary = source.optString("dnsPrimary", default.dnsPrimary).trim().take(255).ifBlank { default.dnsPrimary },
        dnsSecondary = source.optString("dnsSecondary", default.dnsSecondary).trim().take(255).ifBlank { default.dnsSecondary },
        mtu = source.optString("mtu", default.mtu.toString()).toIntOrNull()?.coerceIn(1280, 1500) ?: default.mtu,
        wakeLockEnabled = source.optBoolean("wakeLockEnabled", default.wakeLockEnabled),
        profileNameInNotification = source.optBoolean("profileNameInNotification", default.profileNameInNotification),
        debugMode = source.optBoolean("debugMode", default.debugMode),
        pingEnabled = source.optBoolean("pingEnabled", default.pingEnabled),
        httpPingEnabled = source.optBoolean("httpPingEnabled", default.httpPingEnabled),
        httpPingUrl = verifiedUrl,
        httpPingIntervalMs = interval,
        httpPingTimeoutMs = timeout,
        reconnectAfterFailures = source.optString("reconnectAfterFailures", default.reconnectAfterFailures.toString()).toIntOrNull()?.coerceIn(0, 20) ?: default.reconnectAfterFailures,
        alwaysReconnect = source.optBoolean("alwaysReconnect", default.alwaysReconnect),
      )
    }
  }
}
