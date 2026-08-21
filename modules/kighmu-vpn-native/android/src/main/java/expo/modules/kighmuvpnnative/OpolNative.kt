package expo.modules.kighmuvpnnative

import org.json.JSONObject

/**
 * Interface limitée de libopol. À ce stade, seule la politique d’exécution
 * Xray est exposée ; les autres tunnels continuent d’utiliser leur code validé.
 */
internal object OpolNative {
  internal data class XrayRuntimePolicy(
    val socksListen: String,
    val socksPort: Int,
    val logLevel: String,
    val domainStrategy: String,
  )

  private val available: Boolean = try {
    System.loadLibrary("opol")
    true
  } catch (_: Throwable) {
    false
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
}
