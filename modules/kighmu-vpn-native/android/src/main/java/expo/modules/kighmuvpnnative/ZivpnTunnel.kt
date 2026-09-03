package expo.modules.kighmuvpnnative

import android.content.Context
import java.io.File
import java.net.ServerSocket
import java.net.Socket

class ZivpnTunnel(
  private val context: Context,
  private val profile: TunnelProfile,
  private val log: (String, String, String) -> Unit,
  private val dnsServers: List<String> = emptyList(),
) : LocalTunnel {
  override val label: String = profile.name
  override val socksPort: Int = findFreePort()
  private var process: Process? = null
  private var configFile: File? = null
  @Volatile private var authFailed = false

  override fun start() {
    profile.validate()?.let { throw IllegalArgumentException(it) }
    log("connection", "ZIVPN", "ZiVPN")
    val binary = File(context.applicationInfo.nativeLibraryDir, "libuz_core.so")
    require(binary.exists() && binary.length() > 0L) { "libuz_core.so absent de l’APK" }
    val runtime = OpolNative.ziVpnRuntimePolicy(profile.obfs)
    val config = File(context.cacheDir, "zivpn-${safeToken(profile.id)}.json")
    // The complete ZiVPN JSON is generated and validated in libopol.
    config.writeText(OpolNative.buildZiVpnConfig(profile, socksPort))
    configFile = config
    val nativeDir = context.applicationInfo.nativeLibraryDir
    process = ProcessBuilder(listOf(binary.absolutePath) + runtime.argumentPrefix + config.readText())
      .directory(context.filesDir)
      .apply {
        environment()["LD_LIBRARY_PATH"] = nativeDir
        environment()["HOME"] = context.cacheDir.absolutePath
        environment()["TMPDIR"] = context.cacheDir.absolutePath
        redirectErrorStream(true)
      }
      .start()
    val started = process ?: error("processus ZiVPN indisponible")
    Thread {
      try {
        started.inputStream.bufferedReader().useLines { lines ->
          lines.forEach { line ->
            if (line.isBlank()) return@forEach
            if (AUTH_FAILURE_REGEX.containsMatchIn(line)) notifyAuthFailure()
            // Journal propre : on n'affiche plus chaque ligne verbeuse du natif
          }
        }
      } catch (_: Throwable) {}
    }.apply { isDaemon = true; name = "zivpn-log-$socksPort" }.start()
    if (!waitForPort(socksPort, runtime.startupTimeoutMs)) {
      stop()
      if (authFailed) error("Échec de l’authentification, mot de passe incorrect")
      error("ZiVPN n’a pas ouvert le proxy SOCKS local")
    }
    log("success", "ZIVPN", "Auth complete")
    dnsServers.forEach { log("connection", "ZIVPN", "DNS $it") }
    log("success", "ZIVPN", "Connected")
  }

  /** Affiche 4 fois le message rouge d'échec d'authentification (une seule fois par profil). */
  private fun notifyAuthFailure() {
    if (authFailed) return
    authFailed = true
    repeat(4) {
      log("error", "ZIVPN", "Échec de l’authentification, mot de passe incorrect")
    }
  }

  override fun isHealthy(): Boolean = process?.isAlive == true && LocalSocksBalancer.hasSocksGreeting(socksPort)

  override fun stop() {
    try { process?.destroy() } catch (_: Throwable) {}
    try { process?.waitFor(500, java.util.concurrent.TimeUnit.MILLISECONDS) } catch (_: Throwable) {}
    try { process?.destroyForcibly() } catch (_: Throwable) {}
    process = null
    FileLogger.secureDelete(configFile)
    configFile = null
  }

  private fun waitForPort(port: Int, timeoutMs: Long): Boolean {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline && process?.isAlive == true) {
      if (LocalSocksBalancer.hasSocksGreeting(port)) return true
      Thread.sleep(80)
    }
    return false
  }

  companion object {
    // Mots-clés typiques d'un refus d'authentification uz_core (insensible à la casse).
    private val AUTH_FAILURE_REGEX = Regex(
      "(?i)(auth[^\\n]*(?:fail|invalid|incorrect|reject|denied)|password[^\\n]*(?:fail|invalid|incorrect|wrong|reject|denied)|unauthorized|403)",
    )

    fun findFreePort(): Int = ServerSocket(0).use { it.localPort }
    fun safeToken(value: String) = value.replace(Regex("[^A-Za-z0-9_-]"), "_").take(80)
  }
}
