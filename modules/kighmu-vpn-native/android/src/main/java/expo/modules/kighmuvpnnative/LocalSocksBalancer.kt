package expo.modules.kighmuvpnnative

import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

class LocalSocksBalancer(private val log: (String, String, String) -> Unit) {
  private val ports = CopyOnWriteArrayList<Int>()
  private val healthy = CopyOnWriteArrayList<Int>()
  private val failures = ConcurrentHashMap<Int, Int>()
  private val cursor = AtomicInteger(0)
  private val workers = Executors.newCachedThreadPool()
  @Volatile private var running = false
  private var server: ServerSocket? = null
  var port: Int = 0
    private set

  fun start(initialPorts: List<Int>) {
    updatePorts(initialPorts)
    require(ports.isNotEmpty()) { "aucun proxy SOCKS à équilibrer" }
    server = ServerSocket(0, 32, InetAddress.getByName("127.0.0.1"))
    port = server?.localPort ?: error("port du balancier indisponible")
    running = true
    Thread {
      while (running) {
        try {
          val client = server?.accept() ?: break
          workers.execute { relay(client) }
        } catch (_: Throwable) {
          if (running) log("warning", "BALANCER", "Acceptation du flux local interrompue")
        }
      }
    }.apply { isDaemon = true; name = "picko-socks-balancer" }.start()
    Thread {
      while (running) {
        Thread.sleep(5_000)
        ports.toList().forEach { candidate ->
          if (hasSocksGreeting(candidate)) markSuccess(candidate) else markFailure(candidate)
        }
      }
    }.apply { isDaemon = true; name = "picko-socks-health" }.start()
    log("connection", "BALANCER", "Balancier SOCKS prêt sur 127.0.0.1:$port avec ${ports.size} tunnel(s)")
  }

  fun updatePorts(nextPorts: List<Int>) {
    val distinct = nextPorts.distinct().filter { it in 1..65535 }
    ports.clear(); ports.addAll(distinct)
    healthy.retainAll(distinct)
    failures.keys.retainAll(distinct.toSet())
    distinct.filter(::hasSocksGreeting).forEach { if (!healthy.contains(it)) healthy.add(it) }
    if (healthy.isEmpty() && distinct.isNotEmpty()) healthy.addAll(distinct)
  }

  fun stop() {
    running = false
    try { server?.close() } catch (_: Throwable) {}
    server = null
    workers.shutdownNow()
    ports.clear(); healthy.clear(); failures.clear()
  }

  private fun nextPort(): Int? {
    val candidates = healthy.ifEmpty { ports }
    if (candidates.isEmpty()) return null
    val index = Math.floorMod(cursor.getAndIncrement(), candidates.size)
    return candidates[index]
  }

  private fun relay(client: Socket) {
    var upstream: Socket? = null
    try {
      val preferred = nextPort() ?: return
      val candidates = listOf(preferred) + ports.filter { it != preferred }
      for (candidate in candidates) {
        try {
          upstream = Socket().apply {
            tcpNoDelay = true
            connect(InetSocketAddress("127.0.0.1", candidate), 2_500)
          }
          markSuccess(candidate)
          break
        } catch (_: Throwable) { markFailure(candidate) }
      }
      val serverSocket = upstream ?: return
      client.tcpNoDelay = true
      workers.execute { pipe(client.getInputStream(), serverSocket.getOutputStream()) }
      pipe(serverSocket.getInputStream(), client.getOutputStream())
    } catch (_: Throwable) {
      // La fermeture du flux client est attendue lors d’un basculement.
    } finally {
      try { client.close() } catch (_: Throwable) {}
      try { upstream?.close() } catch (_: Throwable) {}
    }
  }

  private fun markFailure(candidate: Int) {
    val count = (failures[candidate] ?: 0) + 1
    failures[candidate] = count
    if (count >= 3 && healthy.remove(candidate)) log("warning", "BALANCER", "Tunnel local $candidate retiré après $count échecs")
  }

  private fun markSuccess(candidate: Int) {
    failures[candidate] = 0
    if (ports.contains(candidate) && !healthy.contains(candidate)) {
      healthy.add(candidate)
      log("info", "BALANCER", "Tunnel local $candidate réintégré")
    }
  }

  private fun pipe(input: java.io.InputStream, output: java.io.OutputStream) {
    val buffer = ByteArray(32 * 1024)
    try {
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        output.write(buffer, 0, count)
        output.flush()
      }
    } catch (_: Throwable) {}
  }

  companion object {
    fun hasSocksGreeting(port: Int): Boolean = try {
      Socket().use { socket ->
        socket.connect(InetSocketAddress("127.0.0.1", port), 900)
        socket.soTimeout = 900
        socket.getOutputStream().apply { write(byteArrayOf(0x05, 0x01, 0x00)); flush() }
        val reply = ByteArray(2)
        val received = socket.getInputStream().read(reply)
        received == 2 && reply[0] == 0x05.toByte() && reply[1] == 0x00.toByte()
      }
    } catch (_: Throwable) { false }
  }
}
