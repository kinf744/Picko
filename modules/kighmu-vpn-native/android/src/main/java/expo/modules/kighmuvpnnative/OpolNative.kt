package expo.modules.kighmuvpnnative

import org.json.JSONObject

/**
 * Narrow Kotlin boundary for libopol. The React Native layer never accesses the
 * policy material or serialized configuration assembled by this library.
 */
internal object OpolNative {
  internal data class DnsttPlan(
    val resolver: String,
    val publicKey: String,
    val nameserver: String,
    val localEndpoint: String,
  )

  internal data class TlsPolicy(
    val host: String,
    val sni: String,
    val tlsVersion: String,
  )

  internal data class XrayRuntimePolicy(
    val socksListen: String,
    val socksPort: Int,
    val dnsttPort: Int,
    val viaDnstt: Boolean,
    val logLevel: String,
  )

  private val available: Boolean = try {
    System.loadLibrary("opol")
    true
  } catch (_: Throwable) {
    false
  }

  fun requireAvailable() {
    check(available) { "libopol indisponible dans cette installation" }
  }

  fun ziVpnObfs(): String {
    requireAvailable()
    return nativeZiVpnObfs()
  }

  fun buildZiVpnConfig(profile: TunnelProfile, socksPort: Int): String {
    requireAvailable()
    return nativeBuildZiVpnConfig(profile.host, profile.port, profile.password, socksPort)
  }

  fun buildHysteriaConfig(profile: TunnelProfile, socksPort: Int): String {
    requireAvailable()
    return nativeBuildHysteriaConfig(
      profile.hysteriaHost,
      profile.hysteriaPort,
      profile.hysteriaAuth,
      profile.hysteriaUpMbps,
      profile.hysteriaDownMbps,
      profile.hysteriaObfs,
      socksPort,
    )
  }

  fun dnsttPlan(profile: TunnelProfile, localPort: Int): DnsttPlan {
    requireAvailable()
    val source = JSONObject(nativeBuildDnsttPlan(
      profile.dnsServer,
      profile.dnsPort,
      profile.normalizedPublicKey(),
      profile.nameserver,
      localPort,
    ))
    return DnsttPlan(
      resolver = source.getString("resolver"),
      publicKey = source.getString("publicKey"),
      nameserver = source.getString("nameserver"),
      localEndpoint = source.getString("localEndpoint"),
    )
  }

  fun expandHttpPayload(profile: TunnelProfile, fallback: String): String {
    requireAvailable()
    return nativeExpandHttpPayload(
      profile.httpPayload.ifBlank { fallback },
      profile.sshHost,
      profile.sshPort,
      profile.proxyHost,
      profile.proxyPort,
    )
  }

  fun tlsPolicy(profile: TunnelProfile): TlsPolicy {
    requireAvailable()
    val source = JSONObject(nativeBuildTlsPolicy(profile.sshHost, profile.sslSni, profile.sslTlsVersion))
    return TlsPolicy(
      host = source.getString("host"),
      sni = source.getString("sni"),
      tlsVersion = source.getString("tlsVersion"),
    )
  }

  fun xrayRuntimePolicy(socksPort: Int, dnsttPort: Int = 0, viaDnstt: Boolean = false): XrayRuntimePolicy {
    requireAvailable()
    val source = JSONObject(nativeBuildXrayRuntimePolicy(socksPort, dnsttPort, viaDnstt))
    return XrayRuntimePolicy(
      socksListen = source.getString("socksListen"),
      socksPort = source.getInt("socksPort"),
      dnsttPort = source.getInt("dnsttPort"),
      viaDnstt = source.getBoolean("viaDnstt"),
      logLevel = source.getString("logLevel"),
    )
  }

  private external fun nativeZiVpnObfs(): String
  private external fun nativeBuildZiVpnConfig(host: String, port: String, password: String, socksPort: Int): String
  private external fun nativeBuildHysteriaConfig(host: String, port: String, auth: String, upMbps: String, downMbps: String, obfs: String, socksPort: Int): String
  private external fun nativeBuildDnsttPlan(dnsServer: String, dnsPort: String, publicKey: String, nameserver: String, localPort: Int): String
  private external fun nativeExpandHttpPayload(payload: String, sshHost: String, sshPort: String, proxyHost: String, proxyPort: String): String
  private external fun nativeBuildTlsPolicy(sshHost: String, sni: String, tlsVersion: String): String
  private external fun nativeBuildXrayRuntimePolicy(socksPort: Int, dnsttPort: Int, viaDnstt: Boolean): String
}
