package expo.modules.kighmuvpnnative

import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket

/**
 * Balancier SOCKS5 local multi-profils.
 * Portage direct de Zamois-tun `com.kighmu.vpn.engines.SocksBalancer`
 * (round-robin + health-check SOCKS5 end-to-end + failover + rate-limit optionnel).
 * Remplace SocksProfileBalancer et ZivpnModernBalancer.
 *
 * Seule adaptation : `emit` remplace `KighmuLogger` (inexistant dans Picko).
 * Algo, seuils (5 échecs, sonde 10s, timeouts) et relais strictement identiques.
 */
class SocksBalancer(
  initialPorts: List<Int>,
  private val emit: (level: String, component: String, message: String) -> Unit = { _, _, _ -> },
  private val maxBytesPerSec: Long = 0,
) : AutoCloseable {
  companion object {
    const val TAG = "SocksBalancer"
    var BALANCER_PORT = 10900
    const val PIPE_BUFFER_SIZE = 65536
    const val MAX_THREADS = 500
  }

  private var serverSocket: ServerSocket? = null
  private var running = false
  private val counter = java.util.concurrent.atomic.AtomicInteger(0)
  private val globalTokens = java.util.concurrent.atomic.AtomicLong(0)
  private val lastRefillTime = java.util.concurrent.atomic.AtomicLong(System.currentTimeMillis())

  @Volatile private var activePorts: List<Int> = initialPorts.distinct().filter { it in 1..65535 }
  @Volatile private var healthyPorts: List<Int> = activePorts
  private val failCount = java.util.concurrent.ConcurrentHashMap<Int, Int>()
  private val threadPool = java.util.concurrent.ThreadPoolExecutor(
    20, MAX_THREADS, 60L, java.util.concurrent.TimeUnit.SECONDS,
    java.util.concurrent.SynchronousQueue(),
    java.util.concurrent.ThreadPoolExecutor.CallerRunsPolicy(),
  )

  private val totalConnections = java.util.concurrent.atomic.AtomicInteger(0)
  private val successConnections = java.util.concurrent.atomic.AtomicInteger(0)
  private val failedConnections = java.util.concurrent.atomic.AtomicInteger(0)
  private val totalBytesTransferred = java.util.concurrent.atomic.AtomicLong(0)

  var port: Int = -1
    private set

  fun getBytesTransferred(): Long = totalBytesTransferred.get()
  fun resetBytesTransferred() = totalBytesTransferred.set(0)

  fun start(): Int {
    require(activePorts.isNotEmpty()) { "Le relais local requiert au moins une sortie SOCKS" }
    check(!running) { "Balancier déjà démarré" }
    running = true
    val ss = ServerSocket(0)
    BALANCER_PORT = ss.localPort
    port = ss.localPort
    serverSocket = ss
    emit("info", TAG, "Balancer demarre sur 127.0.0.1:$port pour ${activePorts.size} profil(s)")
    Thread {
      while (running) {
        try {
          val client = serverSocket?.accept() ?: break
          totalConnections.incrementAndGet()
          val targetPort = nextPort()
          threadPool.execute { relay(client, targetPort) }
        } catch (e: Exception) {
          if (running) emit("warning", TAG, "Accept error: ${e.message}")
        }
      }
    }.apply { isDaemon = true; name = "kighmu-balancer" }.start()

    // Health check périodique des upstreams (toutes les 10s) — identique Zamois-tun
    Thread {
      while (running) {
        try { Thread.sleep(10_000) } catch (_: InterruptedException) { break }
        if (!running) break
        val ports = activePorts.toList()
        for (p in ports) {
          val ok = checkSocks5EndToEnd(p)
          if (ok) {
            markPortSuccess(p)
          } else {
            val fails = (failCount[p] ?: 0) + 1
            failCount[p] = fails
            if (fails >= 5) {
              val h = healthyPorts.filter { it != p }
              if (h.isNotEmpty()) {
                healthyPorts = h
                emit("warning", TAG, "Health: port $p hors ligne")
              }
            }
          }
        }
      }
    }.apply { isDaemon = true; name = "kighmu-health" }.start()
    return port
  }

  fun updatePorts(newPorts: List<Int>) {
    if (newPorts.isNotEmpty()) {
      activePorts = newPorts.toList()
      healthyPorts = newPorts.toList()
      failCount.clear()
      counter.set(0)
    }
  }

  fun stop() {
    running = false
    try { threadPool.shutdown() } catch (_: Exception) {}
    try { serverSocket?.close() } catch (_: Exception) {}
  }

  override fun close() {
    stop()
    emit("info", TAG, "Balancier local arrêté")
  }

  private fun nextPort(): Int {
    val current = healthyPorts.ifEmpty { activePorts }
    if (current.isEmpty()) return 10800
    return current[counter.getAndIncrement() % current.size]
  }

  private fun markPortFailed(port: Int) {
    val fails = (failCount[port] ?: 0) + 1
    failCount[port] = fails
    if (fails >= 5) {
      val h = healthyPorts.filter { it != port }
      if (h.isNotEmpty()) {
        healthyPorts = h
        emit("warning", TAG, "Port $port retire echecs=$fails healthy=$healthyPorts")
      }
    }
  }

  private fun markPortSuccess(port: Int) {
    failCount[port] = 0
    if (!healthyPorts.contains(port) && activePorts.contains(port)) {
      healthyPorts = (healthyPorts + port).distinct()
    }
  }

  private fun checkSocks5EndToEnd(port: Int): Boolean {
    return try {
      val sock = Socket()
      sock.connect(InetSocketAddress("127.0.0.1", port), 1500)
      sock.soTimeout = 2000
      val out = sock.getOutputStream()
      val inp = sock.getInputStream()
      out.write(byteArrayOf(0x05, 0x01, 0x00)); out.flush()
      val greet = ByteArray(2)
      val n = inp.read(greet)
      if (n < 2 || greet[1] != 0x00.toByte()) { sock.close(); return false }
      out.write(byteArrayOf(0x05, 0x01, 0x00, 0x01, 1, 1, 1, 1, 1, (443 shr 8).toByte(), (443 and 0xFF).toByte()))
      out.flush()
      val resp = ByteArray(10)
      var total = 0
      while (total < 10) {
        val r = inp.read(resp, total, 10 - total)
        if (r < 0) break
        total += r
      }
      sock.close()
      total >= 2 && resp[1] == 0x00.toByte()
    } catch (_: Exception) { false }
  }

  private fun connectToPort(targetPort: Int): Socket {
    val server = Socket()
    // NE PAS proteger les connexions vers 127.0.0.1 - elles sont locales
    server.receiveBufferSize = PIPE_BUFFER_SIZE
    server.sendBufferSize = PIPE_BUFFER_SIZE
    server.tcpNoDelay = true
    server.connect(InetSocketAddress("127.0.0.1", targetPort), 5000)
    return server
  }

  private fun relay(client: Socket, targetPort: Int) {
    try {
      client.soTimeout = 120_000
      client.setPerformancePreferences(0, 0, 1)
      client.receiveBufferSize = PIPE_BUFFER_SIZE
      client.sendBufferSize = PIPE_BUFFER_SIZE
      client.tcpNoDelay = true

      var server: Socket? = null
      val candidates = listOf(targetPort) + activePorts.filter { it != targetPort }
      for (p in candidates) {
        try {
          server = connectToPort(p)
          break
        } catch (_: Exception) {}
      }

      if (server == null) {
        failedConnections.incrementAndGet()
        markPortFailed(targetPort)
        try { client.close() } catch (_: Exception) {}
        return
      }

      successConnections.incrementAndGet()
      markPortSuccess(targetPort)

      val s = server!!
      s.soTimeout = 120_000
      s.tcpNoDelay = true

      threadPool.execute {
        try { pipe(client.getInputStream(), s.getOutputStream()) } catch (_: Exception) {}
      }
      try { pipe(s.getInputStream(), client.getOutputStream()) } catch (_: Exception) {}
      try { client.close() } catch (_: Exception) {}
      try { s.close() } catch (_: Exception) {}
    } catch (e: Exception) {
      val msg = e.message ?: ""
      if (!msg.contains("ECONNREFUSED") && !msg.contains("Connection refused") &&
        !msg.contains("failed to connect") && !msg.contains("isConnected failed")
      ) {
        emit("error", TAG, "Relay error $targetPort: $msg")
      }
      try { client.close() } catch (_: Exception) {}
    }
  }

  private fun acquireTokens(bytes: Int) {
    if (maxBytesPerSec <= 0) return
    while (true) {
      val now = System.currentTimeMillis()
      val elapsed = now - lastRefillTime.get()
      if (elapsed >= 50) {
        val refill = maxBytesPerSec * elapsed / 1000
        val current = globalTokens.get()
        val newVal = minOf(maxBytesPerSec, current + refill)
        if (globalTokens.compareAndSet(current, newVal)) lastRefillTime.set(now)
      }
      val current = globalTokens.get()
      if (current >= bytes) {
        if (globalTokens.compareAndSet(current, current - bytes)) return
      } else {
        Thread.sleep(((bytes - current) * 1000 / maxBytesPerSec) + 1)
      }
    }
  }

  private fun pipe(inp: InputStream, out: OutputStream) {
    val buf = ByteArray(PIPE_BUFFER_SIZE)
    try {
      while (true) {
        val n = inp.read(buf)
        if (n == -1) break
        acquireTokens(n)
        out.write(buf, 0, n)
        totalBytesTransferred.addAndGet(n.toLong())
        if (inp.available() <= 0) out.flush()
      }
    } catch (_: java.net.SocketTimeoutException) {
      // Timeout normal → connexion zombie tuée proprement
    } catch (_: Exception) {}
  }
}
