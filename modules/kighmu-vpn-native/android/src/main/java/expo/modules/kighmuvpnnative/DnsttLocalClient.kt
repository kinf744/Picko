package expo.modules.kighmuvpnnative

import android.content.Context
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/** One local dnstt client for a DNS-oriented tunnel family. */
class DnsttLocalClient(
  private val context: Context,
  private val binaryName: String,
  private val runtimeLabel: String,
  private val emit: (level: String, component: String, message: String) -> Unit,
) {
  private var process: Process? = null
  @Volatile private var running = false
  var port: Int = -1
    private set

  @Synchronized
  fun start(dnsServer: String, dnsPort: Int, nameserver: String, publicKey: String): Int {
    require(!running) { "dnstt $runtimeLabel déjà démarré" }
    require(dnsServer.isNotBlank() && dnsPort in 1..65535) { "Serveur DNS/UDP invalide" }
    require(nameserver.matches(Regex("[A-Za-z0-9.-]+"))) { "Nameserver DNS invalide" }
    require(publicKey.isNotBlank()) { "Clé publique dnstt manquante" }
    val binary = File(context.applicationInfo.nativeLibraryDir, binaryName)
    require(binary.exists() && binary.length() > 0L && binary.canExecute()) { "$binaryName ARMv7 absent ou non exécutable" }
    port = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { it.localPort }
    running = true
    try {
      val command = listOf(binary.absolutePath, "-udp", "$dnsServer:$dnsPort", "-pubkey", publicKey.replace(Regex("\\s+"), ""), nameserver.trim().trimEnd('.'), "127.0.0.1:$port")
      val started = ProcessBuilder(command).directory(context.filesDir).apply {
        environment()["LD_LIBRARY_PATH"] = context.applicationInfo.nativeLibraryDir
        environment()["HOME"] = context.filesDir.absolutePath
        environment()["TMPDIR"] = context.cacheDir.absolutePath
        redirectErrorStream(true)
      }.start()
      process = started
      thread(isDaemon = true, name = "dnstt-$runtimeLabel-log") {
        try { started.inputStream.bufferedReader().useLines { lines -> lines.forEach { line -> if (running && line.isNotBlank()) emit("info", "DNSTT", "[$runtimeLabel] ${line.take(300)}") } } }
        catch (_: Throwable) { if (running) emit("warning", "DNSTT", "[$runtimeLabel] lecture des logs interrompue") }
      }
      Thread.sleep(800)
      if (!started.isAlive) error("Le client dnstt $runtimeLabel s’est arrêté au démarrage")
      emit("info", "DNSTT", "[$runtimeLabel] prêt sur 127.0.0.1:$port")
      return port
    } catch (error: Throwable) {
      stop()
      throw error
    }
  }

  @Synchronized
  fun stop() {
    running = false
    val active = process
    process = null
    if (active != null) {
      try { active.destroy() } catch (_: Throwable) {}
      try { active.waitFor(700, TimeUnit.MILLISECONDS) } catch (_: Throwable) {}
      if (active.isAlive) try { active.destroyForcibly() } catch (_: Throwable) {}
    }
    port = -1
  }
}
