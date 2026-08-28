package expo.modules.kighmuvpnnative

import org.json.JSONObject

/**
 * Interface réduite de libopol pour les politiques et générateurs validés.
 * Les opérations dépendantes du cycle de vie Android restent côté Kotlin.
 */
internal object OpolNative {
  internal data class SlowDnsRuntimePolicy(
    val argumentPrefix: List<String>,
    val dnsttReadyTimeoutMs: Long,
    val probeIntervalMs: Long,
    val sshConnectTimeoutMs: Int,
    val sshKexTimeoutMs: Int,
    val sshSocksTimeoutMs: Long,
    val bannerMaxBytes: Int,
    val logLineMaxChars: Int,
  )

  internal data class ZiVpnRuntimePolicy(
    val argumentPrefix: List<String>,
    val startupTimeoutMs: Long,
    val logLineMaxChars: Int,
  )

  internal data class HysteriaRuntimePolicy(
    val startupTimeoutMs: Long,
    val recoveryTimeoutMs: Long,
    val recoveryDelayMs: Long,
    val maxRecoveryAttempts: Int,
    val logDedupMs: Long,
  )

  internal data class XrayRuntimePolicy(
    val socksListen: String,
    val socksPort: Int,
    val logLevel: String,
    val domainStrategy: String,
  )

  internal data class V2RayDnsRuntimePolicy(
    val argumentPrefix: List<String>,
    val dnsttReadyTimeoutMs: Long,
    val xrayReadyTimeoutMs: Long,
    val probeIntervalMs: Long,
    val maxRecoveryAttempts: Int,
    val recoveryDelayMs: Long,
    val logDedupMs: Long,
  )

  internal data class HttpProxyPayloadRuntimePolicy(
    val payload: String,
    val split: Boolean,
    val delay: Boolean,
    val connectTimeoutMs: Int,
    val responseTimeoutMs: Int,
  )

  internal data class SshSslTlsRuntimePolicy(
    val candidates: List<String>,
    val sni: String,
    val connectTimeoutMs: Int,
    val handshakeTimeoutMs: Int,
  )

  private val available: Boolean = try {
    System.loadLibrary("opol")
    true
  } catch (_: Throwable) {
    false
  }

  fun slowDnsRuntimePolicy(profile: TunnelProfile, dnsttPort: Int, socksPort: Int): SlowDnsRuntimePolicy {
    check(available) { "libopol est absent de cette installation" }
    val source = try {
      JSONObject(nativeBuildSlowDnsRuntimePolicy(profile.dnsServer, profile.dnsPort, profile.normalizedPublicKey(), profile.nameserver, dnsttPort, socksPort))
    } catch (_: Throwable) {
      error("libopol a retourné une politique SlowDNS invalide")
    }
    val prefix = source.optJSONArray("argumentPrefix") ?: error("libopol a retourné une politique SlowDNS invalide")
    val arguments = buildList { for (index in 0 until prefix.length()) add(prefix.optString(index)) }
    return SlowDnsRuntimePolicy(
      argumentPrefix = arguments,
      dnsttReadyTimeoutMs = source.optLong("dnsttReadyTimeoutMs", 0L),
      probeIntervalMs = source.optLong("probeIntervalMs", 0L),
      sshConnectTimeoutMs = source.optInt("sshConnectTimeoutMs", 0),
      sshKexTimeoutMs = source.optInt("sshKexTimeoutMs", 0),
      sshSocksTimeoutMs = source.optLong("sshSocksTimeoutMs", 0L),
      bannerMaxBytes = source.optInt("bannerMaxBytes", 0),
      logLineMaxChars = source.optInt("logLineMaxChars", 0),
    ).also { policy ->
      check(policy.argumentPrefix.all { it.isNotBlank() } && policy.dnsttReadyTimeoutMs > 0L && policy.probeIntervalMs > 0L &&
        policy.sshConnectTimeoutMs > 0 && policy.sshKexTimeoutMs > 0 && policy.sshSocksTimeoutMs > 0L &&
        policy.bannerMaxBytes > 0 && policy.logLineMaxChars > 0) { "libopol a retourné une politique SlowDNS invalide" }
    }
  }

  fun classifySlowDnsOutput(line: String): String {
    check(available) { "libopol est absent de cette installation" }
    return nativeClassifySlowDnsOutput(line).ifBlank { "info" }
  }

  fun ziVpnRuntimePolicy(obfs: String): ZiVpnRuntimePolicy {
    check(available) { "libopol est absent de cette installation" }
    val source = try { JSONObject(nativeBuildZiVpnRuntimePolicy(obfs)) } catch (_: Throwable) {
      error("libopol a retourné une politique ZiVPN invalide")
    }
    val prefix = source.optJSONArray("argumentPrefix") ?: error("libopol a retourné une politique ZiVPN invalide")
    val arguments = buildList {
      for (index in 0 until prefix.length()) add(prefix.optString(index))
    }
    return ZiVpnRuntimePolicy(
      argumentPrefix = arguments,
      startupTimeoutMs = source.optLong("startupTimeoutMs", 0L),
      logLineMaxChars = source.optInt("logLineMaxChars", 0),
    ).also { policy ->
      check(policy.argumentPrefix.all { it.isNotBlank() } && policy.startupTimeoutMs > 0L && policy.logLineMaxChars > 0) {
        "libopol a retourné une politique ZiVPN invalide"
      }
    }
  }

  fun hysteriaRuntimePolicy(): HysteriaRuntimePolicy {
    check(available) { "libopol est absent de cette installation" }
    val source = try { JSONObject(nativeBuildHysteriaRuntimePolicy()) } catch (_: Throwable) {
      error("libopol a retourné une politique Hysteria invalide")
    }
    return HysteriaRuntimePolicy(
      startupTimeoutMs = source.optLong("startupTimeoutMs", 0L),
      recoveryTimeoutMs = source.optLong("recoveryTimeoutMs", 0L),
      recoveryDelayMs = source.optLong("recoveryDelayMs", 0L),
      maxRecoveryAttempts = source.optInt("maxRecoveryAttempts", 0),
      logDedupMs = source.optLong("logDedupMs", 0L),
    ).also { policy ->
      check(policy.startupTimeoutMs > 0L && policy.recoveryTimeoutMs > 0L && policy.recoveryDelayMs > 0L &&
        policy.maxRecoveryAttempts > 0 && policy.logDedupMs > 0L) {
        "libopol a retourné une politique Hysteria invalide"
      }
    }
  }

  fun classifyHysteriaOutput(line: String): String {
    check(available) { "libopol est absent de cette installation" }
    return nativeClassifyHysteriaOutput(line).ifBlank { "ignore" }
  }

  fun buildZiVpnConfig(profile: TunnelProfile, socksPort: Int): String {
    check(available) { "libopol est absent de cette installation" }
    return nativeBuildZiVpnConfig(
      profile.host,
      profile.port,
      profile.obfs,
      profile.password,
      socksPort,
    ) ?: error("libopol a refusé la configuration ZiVPN")
  }

  fun buildHysteriaConfig(profile: TunnelProfile, socksPort: Int): String {
    check(available) { "libopol est absent de cette installation" }
    return nativeBuildHysteriaConfig(
      profile.hysteriaHost,
      profile.hysteriaPort,
      profile.hysteriaAuth,
      profile.hysteriaUpMbps,
      profile.hysteriaDownMbps,
      profile.hysteriaObfs,
      socksPort,
    ) ?: error("libopol a refusé la configuration Hysteria")
  }

  fun sshSslTlsRuntimePolicy(profile: TunnelProfile): SshSslTlsRuntimePolicy {
    check(available) { "libopol est absent de cette installation" }
    val source = try {
      JSONObject(nativeBuildSshSslTlsRuntimePolicy(profile.sshHost, profile.sshPort, profile.sslTlsVersion, profile.sslSni))
    } catch (_: Throwable) {
      error("libopol a retourné une politique SSH SSL/TLS invalide")
    }
    val candidates = source.optJSONArray("candidates") ?: error("libopol a retourné une politique SSH SSL/TLS invalide")
    return SshSslTlsRuntimePolicy(
      candidates = buildList { for (index in 0 until candidates.length()) add(candidates.optString(index)) },
      sni = source.optString("sni"),
      connectTimeoutMs = source.optInt("connectTimeoutMs", 0),
      handshakeTimeoutMs = source.optInt("handshakeTimeoutMs", 0),
    ).also { policy ->
      check(policy.candidates.isNotEmpty() && policy.candidates.all { it in setOf("TLS", "TLSv1.2", "TLSv1.3") } &&
        policy.connectTimeoutMs > 0 && policy.handshakeTimeoutMs > 0) { "libopol a retourné une politique SSH SSL/TLS invalide" }
    }
  }

  fun httpProxyPayloadRuntimePolicy(profile: TunnelProfile): HttpProxyPayloadRuntimePolicy {
    check(available) { "libopol est absent de cette installation" }
    val source = try {
      JSONObject(nativeBuildHttpProxyPayloadRuntimePolicy(profile.sshHost, profile.sshPort, profile.proxyHost, profile.proxyPort, profile.httpPayload))
    } catch (_: Throwable) {
      error("libopol a retourné une politique HTTP Proxy invalide")
    }
    return HttpProxyPayloadRuntimePolicy(
      payload = source.optString("payload"),
      split = source.optBoolean("split", false),
      delay = source.optBoolean("delay", false),
      connectTimeoutMs = source.optInt("connectTimeoutMs", 0),
      responseTimeoutMs = source.optInt("responseTimeoutMs", 0),
    ).also { policy ->
      check(policy.payload.isNotEmpty() && policy.connectTimeoutMs > 0 && policy.responseTimeoutMs > 0) {
        "libopol a retourné une politique HTTP Proxy invalide"
      }
    }
  }

  fun v2RayDnsRuntimePolicy(profile: TunnelProfile, dnsttPort: Int, socksPort: Int): V2RayDnsRuntimePolicy {
    check(available) { "libopol est absent de cette installation" }
    val source = try {
      JSONObject(nativeBuildV2RayDnsRuntimePolicy(profile.dnsServer, profile.dnsPort, profile.normalizedPublicKey(), profile.nameserver, dnsttPort, socksPort))
    } catch (_: Throwable) {
      error("libopol a retourné une politique V2Ray DNS invalide")
    }
    val prefix = source.optJSONArray("argumentPrefix") ?: error("libopol a retourné une politique V2Ray DNS invalide")
    return V2RayDnsRuntimePolicy(
      argumentPrefix = buildList { for (index in 0 until prefix.length()) add(prefix.optString(index)) },
      dnsttReadyTimeoutMs = source.optLong("dnsttReadyTimeoutMs", 0L),
      xrayReadyTimeoutMs = source.optLong("xrayReadyTimeoutMs", 0L),
      probeIntervalMs = source.optLong("probeIntervalMs", 0L),
      maxRecoveryAttempts = source.optInt("maxRecoveryAttempts", 0),
      recoveryDelayMs = source.optLong("recoveryDelayMs", 0L),
      logDedupMs = source.optLong("logDedupMs", 0L),
    ).also { policy ->
      check(policy.argumentPrefix.all { it.isNotBlank() } && policy.dnsttReadyTimeoutMs > 0L && policy.xrayReadyTimeoutMs > 0L &&
        policy.probeIntervalMs > 0L && policy.maxRecoveryAttempts > 0 && policy.recoveryDelayMs > 0L && policy.logDedupMs > 0L) {
        "libopol a retourné une politique V2Ray DNS invalide"
      }
    }
  }

  fun classifyV2RayDnsOutput(line: String): String {
    check(available) { "libopol est absent de cette installation" }
    return nativeClassifyV2RayDnsOutput(line).ifBlank { "ignore" }
  }

  private fun cleanXrayLink(link: String): String {
    // Retire le fragment #... (ex: #Lop-V2RAY-DNS-TROJAN) qui corrompt le parsing du transport
    // trojan://...?type=tcp#label -> trojan://...?type=tcp
    val hash = link.indexOf('#')
    return if (hash >= 0) link.substring(0, hash).trim() else link.trim()
  }

  fun buildXrayConfig(profile: TunnelProfile, socksPort: Int): String {
    check(available) { "libopol est absent de cette installation" }
    val cleanLink = cleanXrayLink(profile.xrayLink)
    return nativeBuildXrayConfig(profile.xrayMode, cleanLink, profile.xrayJson, socksPort)
      ?: error("libopol a refusé la configuration Xray")
  }

  fun xrayRuntimePolicy(socksPort: Int): XrayRuntimePolicy {
    check(available) { "libopol est absent de cette installation" }
    val source = try {
      JSONObject(nativeBuildXrayRuntimePolicy(socksPort))
    } catch (_: Throwable) {
      error("libopol a retourné une politique Xray invalide")
    }
    val listen = source.optString("socksListen")
    val port = source.optInt("socksPort", 0)
    val logLevel = source.optString("logLevel")
    val domainStrategy = source.optString("domainStrategy")
    check(listen == "127.0.0.1" && port == socksPort) { "libopol a retourné un proxy Xray local invalide" }
    check(logLevel == "warning" && domainStrategy == "AsIs") { "libopol a retourné une politique Xray invalide" }
    return XrayRuntimePolicy(
      socksListen = listen,
      socksPort = port,
      logLevel = logLevel,
      domainStrategy = domainStrategy,
    )
  }

  private external fun nativeBuildXrayRuntimePolicy(socksPort: Int): String
  private external fun nativeBuildHttpProxyPayloadRuntimePolicy(sshHost: String, sshPort: String, proxyHost: String, proxyPort: String, payload: String): String
  private external fun nativeBuildSshSslTlsRuntimePolicy(sshHost: String, sshPort: String, selectedVersion: String, sni: String): String
  private external fun nativeBuildV2RayDnsRuntimePolicy(dnsServer: String, dnsPort: String, publicKey: String, nameserver: String, dnsttPort: Int, socksPort: Int): String
  private external fun nativeClassifyV2RayDnsOutput(line: String): String
  private external fun nativeBuildXrayConfig(mode: String, link: String, json: String, socksPort: Int): String?
  private external fun nativeBuildZiVpnRuntimePolicy(obfs: String): String
  private external fun nativeBuildSlowDnsRuntimePolicy(dnsServer: String, dnsPort: String, publicKey: String, nameserver: String, dnsttPort: Int, socksPort: Int): String
  private external fun nativeClassifySlowDnsOutput(line: String): String
  private external fun nativeBuildHysteriaRuntimePolicy(): String
  private external fun nativeClassifyHysteriaOutput(line: String): String
  private external fun nativeBuildZiVpnConfig(
    host: String,
    port: String,
    obfs: String,
    auth: String,
    socksPort: Int,
  ): String?
  private external fun nativeBuildHysteriaConfig(
    host: String,
    port: String,
    auth: String,
    upMbps: String,
    downMbps: String,
    obfs: String,
    socksPort: Int,
  ): String?
}
