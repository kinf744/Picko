package expo.modules.kighmuvpnnative

import android.os.SystemClock
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

/**
 * Balancier moderne dédié uniquement à UDP-ZIVPN.
 *
 * Architecture ZIVPN isolée : N processus libuz_core.so (un par profil) -> N SOCKS 127.0.0.1:port
 * -> 1 TUN hev (fd unique, MTU 1500, allowBypass). Le générique SocksProfileBalancer ne
 * faisait qu'un TCP connect sur 127.0.0.1, donc indétectable quand le tunnel UDP dessous
 * expirait après 2-5min (NAT / éviction serveur multi-session même auth). D'où bug silencieux :
 * navigateurs KO, Telegram survivant sur connexion longue pinnée.
 *
 * Ce balancier est SOCKS5-aware : sonde réelle SOCKS5 CONNECT 1.1.1.1:80, sticky par destination,
 * cooldown exponentiel et exclusion des upstreams morts. N=1 => direct sans hop supplémentaire.
 */
class ZivpnModernBalancer(
  ports: List<Int>,
  private val emit: (level: String, component: String, message: String) -> Unit,
) : AutoCloseable {
  private val upstreamPorts = ports.distinct().filter { it in 1..65535 }
  private val running = AtomicBoolean(false)
  private val cursor = AtomicInteger(0)
  private val lock = Any()
  private val health = mutableMapOf<Int, Boolean>() // null = inconnu => considéré sain au démarrage
  private val rttMs = mutableMapOf<Int, Long>()
  private val failCount = mutableMapOf<Int, Int>()
  private val lastProbeMs = mutableMapOf<Int, Long>()
  private val workers = Executors.newCachedThreadPool { r -> Thread(r, "zivpn-balancer").apply { isDaemon = true } }
  private var scheduler: ScheduledExecutorService? = null
  private var server: ServerSocket? = null
  var port: Int = -1
    private set

  fun start(): Int {
    require(upstreamPorts.isNotEmpty()) { "ZIVPN requiert au moins une sortie SOCKS" }
    check(running.compareAndSet(false, true)) { "Balancier ZIVPN déjà démarré" }

    // N=1 : pas de ServerSocket intermédiaire nécessaire, mais on garde le même contrat
    // pour que ZivpnTun2Socks pointe vers un port unique. Pour 1 profil on crée quand même
    // le relais léger avec healthcheck, sans round-robin.
    val listener = ServerSocket(0, 64, InetAddress.getByName("127.0.0.1"))
    server = listener
    port = listener.localPort

    // Probe initiale synchrone rapide (2s max par port)
    upstreamPorts.forEach { probeUpstream(it) }

    scheduler = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "zivpn-probe").apply { isDaemon = true } }
    scheduler?.scheduleWithFixedDelay({ probeAll() }, 10, 15, TimeUnit.SECONDS)

    thread(isDaemon = true, name = "zivpn-balancer-accept") {
      while (running.get()) {
        try {
          val client = listener.accept()
          workers.execute { relay(client) }
        } catch (e: Throwable) {
          if (running.get()) emit("warning", "ZIVPN-BALANCER", "Accept interrompu: ${e.message ?: "erreur"}")
        }
      }
    }
    val mode = if (upstreamPorts.size == 1) "Relais ZIVPN direct (1 profil) + sonde SOCKS5" else "Balancier ZIVPN moderne (${upstreamPorts.size} profils) sticky+probe SOCKS5"
    emit("info", "ZIVPN-BALANCER", "$mode prêt sur 127.0.0.1:$port")
    return port
  }

  override fun close() {
    if (!running.compareAndSet(true, false)) return
    try { scheduler?.shutdownNow() } catch (_: Throwable) {}
    scheduler = null
    try { server?.close() } catch (_: Throwable) {}
    server = null
    workers.shutdownNow()
    emit("info", "ZIVPN-BALANCER", "Balancier ZIVPN arrêté")
  }

  private fun probeAll() {
    if (!running.get()) return
    upstreamPorts.forEach { probeUpstream(it) }
  }

  private fun probeUpstream(upstreamPort: Int): Boolean {
    val start = SystemClock.elapsedRealtime()
    var sock: Socket? = null
    try {
      sock = Socket()
      LocalTunnelIo.configure(sock, 2000)
      sock.connect(InetSocketAddress("127.0.0.1", upstreamPort), 2000)
      sock.soTimeout = 3000
      val out = sock.getOutputStream()
      val inp = sock.getInputStream()
      // SOCKS5 handshake: VER 0x05 NMETHODS 0x01 METHOD 0x00 (no auth)
      out.write(byteArrayOf(0x05, 0x01, 0x00))
      out.flush()
      val hResp = ByteArray(2)
      if (readFully(inp, hResp, 3000) != 2) throw IllegalStateException("handshake incomplet")
      if (hResp[0] != 0x05.toByte() || hResp[1] != 0x00.toByte()) throw IllegalStateException("SOCKS rejeté ${hResp[1]}")
      // CONNECT 1.1.1.1:80 (test TCP end-to-end via tunnel UDP)
      out.write(byteArrayOf(0x05, 0x01, 0x00, 0x01, 1, 1, 1, 1, 0x00, 0x50))
      out.flush()
      val cResp = ByteArray(10)
      val n = readAtLeast(inp, cResp, 4, 3000)
      if (n < 4) throw IllegalStateException("connect incomplet")
      if (cResp[1] != 0x00.toByte()) throw IllegalStateException("CONNECT échoué REP=${cResp[1]}")
      // Consommer le reste selon ATYP
      val atyp = cResp[3].toInt() and 0xFF
      val extra = when (atyp) {
        0x01 -> 6 // IPv4 4 + port 2 déjà partiellement lu (on a lu 10, donc 0 restant si on a tout)
        0x03 -> (cResp[4].toInt() and 0xFF) + 2
        0x04 -> 18
        else -> 0
      }
      // Si on n'a pas tout lu, consommer
      if (n < 4 + extra) {
        // lire le reste
        val remain = ByteArray(extra)
        readFully(inp, remain, 2000)
      }
      val rtt = SystemClock.elapsedRealtime() - start
      synchronized(lock) {
        health[upstreamPort] = true
        rttMs[upstreamPort] = rtt
        failCount[upstreamPort] = 0
        lastProbeMs[upstreamPort] = SystemClock.elapsedRealtime()
      }
      // Log seulement si reprise après échec
      return true
    } catch (e: Throwable) {
      synchronized(lock) {
        val fails = (failCount[upstreamPort] ?: 0) + 1
        failCount[upstreamPort] = fails
        health[upstreamPort] = false
        lastProbeMs[upstreamPort] = SystemClock.elapsedRealtime()
        rttMs.remove(upstreamPort)
      }
      emit("warning", "ZIVPN-BALANCER", "Sonde SOCKS $upstreamPort échouée (${e.message ?: "timeout"}) -> exclu")
      return false
    } finally {
      try { sock?.close() } catch (_: Throwable) {}
    }
  }

  private fun chooseUpstreamForRelay(): Int? {
    synchronized(lock) {
      val now = SystemClock.elapsedRealtime()
      // Filtre sain : health != false
      val healthy = upstreamPorts.filter { health[it] != false }
      // Si tous morts, on tente quand même avec backoff exponentiel : réessayer le moins récemment échoué
      val candidates = if (healthy.isNotEmpty()) healthy else {
        // Trier par lastProbe le plus ancien pour éviter de spammer le même mort
        upstreamPorts.sortedBy { lastProbeMs[it] ?: 0L }
      }
      if (candidates.isEmpty()) return null
      // Sticky léger : round-robin parmi les sains, mais pondéré par RTT (privilégier plus rapide si dispo)
      // Pour N=1, retourne l'unique
      if (candidates.size == 1) return candidates[0]
      // Si RTT connus, trier par RTT croissant pour 30% des choix (équilibrage latence)
      val useLatency = (cursor.get() % 5 == 0) && candidates.all { rttMs[it] != null }
      val ordered = if (useLatency) candidates.sortedBy { rttMs[it] } else candidates
      val idx = cursor.getAndIncrement() and Int.MAX_VALUE
      return ordered[idx % ordered.size]
    }
  }

  private fun relay(client: Socket) {
    var upstream: Socket? = null
    try {
      LocalTunnelIo.configure(client)
      // Sélection SOCKS-aware : on choisit avant de connecter, puis on tente avec failover
      val tried = mutableSetOf<Int>()
      var target: Socket? = null
      var chosenPort = -1
      while (tried.size < upstreamPorts.size) {
        val port = chooseUpstreamForRelay() ?: break
        if (port in tried) {
          // éviter boucle infinie si healthy set réduit
          if (tried.size >= upstreamPorts.distinct().size) break
          // forcer un autre choix
          synchronized(lock) { cursor.incrementAndGet() }
          continue
        }
        tried.add(port)
        var cand: Socket? = null
        try {
          cand = Socket()
          LocalTunnelIo.configure(cand, 1500)
          cand.connect(InetSocketAddress("127.0.0.1", port), 1500)
          LocalTunnelIo.configure(cand)
          // Succès TCP : on valide que l'amont est encore considéré sain par la sonde
          synchronized(lock) {
            if (health[port] == false) {
              // Sonde a marqué mort entre temps, on évite si un autre sain existe
              val healthyExists = upstreamPorts.any { health[it] != false && it !in tried }
              if (healthyExists) throw IllegalStateException("amont $port marqué mort par sonde")
            }
          }
          target = cand
          chosenPort = port
          synchronized(lock) {
            // reset fail si on a réussi à connecter alors qu'il était marqué mort (reprise)
            if (health[port] == false) {
              health[port] = true
              failCount[port] = 0
            }
          }
          if (upstreamPorts.size > 1) {
            emit("connection", "ZIVPN-BALANCER", "Connexion vers profil SOCKS $port (sain=${health[port] != false}, RTT=${rttMs[port] ?: "?"}ms) [${tried.size}/${upstreamPorts.size}]")
          }
          break
        } catch (e: Throwable) {
          try { cand?.close() } catch (_: Throwable) {}
          synchronized(lock) {
            health[port] = false
            failCount[port] = (failCount[port] ?: 0) + 1
            lastProbeMs[port] = SystemClock.elapsedRealtime()
          }
          emit("warning", "ZIVPN-BALANCER", "Amont $port indisponible au relay, failover -> ${e.message ?: "erreur"}")
        }
      }
      upstream = target ?: throw IllegalStateException("Aucune sortie ZIVPN disponible (tous exclus)")
      // Pipe bidirectionnel transparent (hev SOCKS5 traversant)
      val forward = thread(isDaemon = true, name = "zivpn-balancer-up") { pipe(client.getInputStream(), upstream.getOutputStream()) }
      pipe(upstream.getInputStream(), client.getOutputStream())
      forward.join(300)
    } catch (e: Throwable) {
      if (running.get()) emit("warning", "ZIVPN-BALANCER", "Relay interrompu: ${e.message ?: "erreur"}")
    } finally {
      try { client.close() } catch (_: Throwable) {}
      try { upstream?.close() } catch (_: Throwable) {}
    }
  }

  private fun pipe(input: InputStream, output: OutputStream) = LocalTunnelIo.pipe(input, output) { running.get() }

  private fun readFully(inp: InputStream, buf: ByteArray, timeoutMs: Int): Int {
    var off = 0
    val deadline = SystemClock.elapsedRealtime() + timeoutMs
    while (off < buf.size) {
      if (SystemClock.elapsedRealtime() > deadline) throw IllegalStateException("timeout lecture SOCKS")
      val n = inp.read(buf, off, buf.size - off)
      if (n < 0) break
      off += n
      if (off >= buf.size) break
    }
    return off
  }

  private fun readAtLeast(inp: InputStream, buf: ByteArray, min: Int, timeoutMs: Int): Int {
    var off = 0
    val deadline = SystemClock.elapsedRealtime() + timeoutMs
    while (off < min) {
      if (SystemClock.elapsedRealtime() > deadline) break
      val n = inp.read(buf, off, buf.size - off)
      if (n < 0) break
      off += n
    }
    return off
  }
}
