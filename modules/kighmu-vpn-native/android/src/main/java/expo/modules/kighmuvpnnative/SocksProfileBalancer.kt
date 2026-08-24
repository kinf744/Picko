package expo.modules.kighmuvpnnative

import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

/**
 * Family-local SOCKS5 balancer. It only receives localhost upstream ports belonging to one
 * selected tunnel family; it never discovers, kills or mixes processes from another family.
 */
class SocksProfileBalancer(
  ports: List<Int>,
  private val emit: (level: String, component: String, message: String) -> Unit,
) : AutoCloseable {
  private val upstreamPorts = ports.distinct().filter { it in 1..65535 }
  private val running = AtomicBoolean(false)
  private val cursor = AtomicInteger(0)
  private val lastFailureMs = mutableMapOf<Int, Long>()
  private val failureLock = Any()
  private val workers = Executors.newCachedThreadPool { runnable -> Thread(runnable, "kighmu-socks-balancer").apply { isDaemon = true } }
  private var server: ServerSocket? = null
  var port: Int = -1
    private set

  fun start(): Int {
    require(upstreamPorts.isNotEmpty()) { "Le relais local requiert au moins une sortie SOCKS" }
    check(running.compareAndSet(false, true)) { "Balancier déjà démarré" }
    val listener = ServerSocket(0, 32, InetAddress.getByName("127.0.0.1"))
    server = listener
    port = listener.localPort
    thread(isDaemon = true, name = "kighmu-socks-balancer-accept") {
      while (running.get()) {
        try {
          val client = listener.accept()
          workers.execute { relay(client) }
        } catch (error: Throwable) {
          if (running.get()) emit("warning", "BALANCER", "Acceptation locale interrompue : ${error.message ?: "erreur"}")
        }
      }
    }
    val mode = if (upstreamPorts.size == 1) "Relais local direct" else "Round-robin local"
    emit("info", "BALANCER", "$mode prêt sur 127.0.0.1:$port pour ${upstreamPorts.size} profil(s)")
    return port
  }

  override fun close() {
    if (!running.compareAndSet(true, false)) return
    try { server?.close() } catch (_: Throwable) {}
    server = null
    workers.shutdownNow()
    emit("info", "BALANCER", "Balancier local arrêté")
  }

  private fun relay(client: Socket) {
    var upstream: Socket? = null
    try {
      LocalTunnelIo.configure(client)
      val baseIndex = cursor.getAndIncrement().and(Int.MAX_VALUE)
      val now = System.currentTimeMillis()
      // Construit l'ordre round-robin en sautant les ports en échec <10s
      val orderedIndices = (0 until upstreamPorts.size).map { (baseIndex + it) % upstreamPorts.size }
        .sortedWith(compareBy { idx ->
          val port = upstreamPorts[idx]
          val lastFail = synchronized(failureLock) { lastFailureMs[port] ?: 0L }
          if (now - lastFail < 10_000) 1 else 0
        })
      for (profileIndex in orderedIndices) {
        val upstreamPort = upstreamPorts[profileIndex]
        // Skip temporairement un port en cooldown 10s sauf si tous sont en cooldown
        val inCooldown = synchronized(failureLock) { now - (lastFailureMs[upstreamPort] ?: 0L) < 10_000 }
        if (inCooldown && orderedIndices.any { idx -> System.currentTimeMillis() - (synchronized(failureLock){lastFailureMs[upstreamPorts[idx]] ?: 0L}) >= 10_000 }) continue
        var candidate: Socket? = null
        try {
          candidate = Socket()
          LocalTunnelIo.configure(candidate, 1_500)
          candidate.connect(InetSocketAddress("127.0.0.1", upstreamPort), 1_500)
          LocalTunnelIo.configure(candidate)
          upstream = candidate
          synchronized(failureLock) { lastFailureMs.remove(upstreamPort) }
          if (upstreamPorts.size > 1) {
            emit("connection", "BALANCER", "Round-robin : connexion ${baseIndex + 1} vers profil ${profileIndex + 1}/${upstreamPorts.size} (SOCKS $upstreamPort) — débit agrégé via ${upstreamPorts.size} profils")
          }
          break
        } catch (_: Throwable) {
          try { candidate?.close() } catch (_: Throwable) {}
          synchronized(failureLock) { lastFailureMs[upstreamPort] = System.currentTimeMillis() }
          emit("warning", "BALANCER", "Profil SOCKS local indisponible sur le port $upstreamPort (exclu 10s)")
        }
      }
      val target = upstream ?: throw IllegalStateException("Aucune sortie SOCKS locale disponible")
      val forward = thread(isDaemon = true, name = "kighmu-socks-balancer-up") { pipe(client.getInputStream(), target.getOutputStream()) }
      pipe(target.getInputStream(), client.getOutputStream())
      forward.join(250)
    } catch (error: Throwable) {
      if (running.get()) emit("warning", "BALANCER", "Relai local interrompu : ${error.message ?: "erreur"}")
    } finally {
      try { client.close() } catch (_: Throwable) {}
      try { upstream?.close() } catch (_: Throwable) {}
    }
  }

  private fun pipe(input: InputStream, output: OutputStream) = LocalTunnelIo.pipe(input, output) { running.get() }
}
