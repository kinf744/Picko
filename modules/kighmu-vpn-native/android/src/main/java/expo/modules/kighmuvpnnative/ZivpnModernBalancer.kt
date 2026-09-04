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
 * Balancier moderne dédié uniquement à UDP-ZIVPN - version SOCKS-aware adaptée.
 *
 * Problème initial: round-robin transparent par connexion (TCP pipe) sans notion de destination.
 * Le bug silencieux après 2-5min venait d'un tunnel UDP mort (NAT/expiration serveur multi-session
 * même auth) encore considéré sain par un simple connect 127.0.0.1, puis 1/N des nouvelles connexions
 * (DNS 8.8.8.8, HTTP) partaient vers le mort -> navigateurs KO, Telegram (connexion longue pinnée) OK.
 *
 * Adaptations ZIVPN:
 * - Sonde réelle SOCKS5 CONNECT 1.1.1.1:80 (pas seulement TCP) toutes les 15s, RTT, exclusion
 * - SOCKS-aware: intercepte handshake hev (VER/NMETHODS) et requête CONNECT/UDP_ASSOCIATE,
 *   choisit l'amont par hachage de la destination (sticky) parmi les sains
 * - UDP_ASSOCIATE (CMD 0x03, utilisé par hev pour DNS) est épinglé sur l'amont primaire sain
 *   et non balancé, pour éviter de couper le DNS
 * - Failover automatique vers un autre sain si le choisi échoue
 * - N=1 : pas de round-robin, direct avec sonde quand même
 */
class ZivpnModernBalancer(
  ports: List<Int>,
  private val emit: (level: String, component: String, message: String) -> Unit,
) : AutoCloseable {
  private val upstreamPorts = ports.distinct().filter { it in 1..65535 }
  private val running = AtomicBoolean(false)
  private val cursor = AtomicInteger(0)
  private val lock = Any()
  private val health = mutableMapOf<Int, Boolean>()
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
    val listener = ServerSocket(0, 64, InetAddress.getByName("127.0.0.1"))
    server = listener
    port = listener.localPort
    upstreamPorts.forEach { probeUpstream(it) }
    scheduler = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "zivpn-probe").apply { isDaemon = true } }
    scheduler?.scheduleWithFixedDelay({ probeAll() }, 10, 15, TimeUnit.SECONDS)
    thread(isDaemon = true, name = "zivpn-balancer-accept") {
      while (running.get()) {
        try {
          val client = listener.accept()
          workers.execute { relaySocksAware(client) }
        } catch (e: Throwable) {
          if (running.get()) emit("warning", "ZIVPN-BALANCER", "Accept interrompu: ${e.message ?: "erreur"}")
        }
      }
    }
    val mode = if (upstreamPorts.size == 1) "Relais ZIVPN direct (1 profil) SOCKS-aware" else "Balancier ZIVPN SOCKS-aware (${upstreamPorts.size} profils) sticky+probe"
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
      out.write(byteArrayOf(0x05, 0x01, 0x00))
      out.flush()
      val hResp = ByteArray(2)
      if (readFully(inp, hResp, 3000) != 2) throw IllegalStateException("handshake incomplet")
      if (hResp[0] != 0x05.toByte() || hResp[1] != 0x00.toByte()) throw IllegalStateException("SOCKS rejeté ${hResp[1]}")
      out.write(byteArrayOf(0x05, 0x01, 0x00, 0x01, 1, 1, 1, 1, 0x00, 0x50))
      out.flush()
      val cResp = ByteArray(10)
      val n = readAtLeast(inp, cResp, 4, 3000)
      if (n < 4) throw IllegalStateException("connect incomplet")
      if (cResp[1] != 0x00.toByte()) throw IllegalStateException("CONNECT échoué REP=${cResp[1]}")
      val atyp = cResp[3].toInt() and 0xFF
      val extra = when (atyp) {
        0x01 -> 6
        0x03 -> (cResp[4].toInt() and 0xFF) + 2
        0x04 -> 18
        else -> 0
      }
      if (n < 4 + extra) {
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

  private fun healthyPorts(): List<Int> = synchronized(lock) {
    val h = upstreamPorts.filter { health[it] != false }
    if (h.isNotEmpty()) h else upstreamPorts.sortedBy { lastProbeMs[it] ?: 0L }
  }

  private fun chooseForDestination(dstHash: Int, cmd: Int): Int {
    val candidates = healthyPorts()
    if (candidates.size == 1) return candidates[0]
    // UDP_ASSOCIATE : toujours le primaire (plus faible RTT ou premier sain) pour stabilité DNS
    if (cmd == 0x03) {
      return candidates.minByOrNull { rttMs[it] ?: Long.MAX_VALUE } ?: candidates[0]
    }
    // CONNECT : sticky par hachage de la destination
    val idx = Math.floorMod(dstHash, candidates.size)
    // 10% du temps on privilégie la latence pour rééquilibrer si un amont est nettement plus rapide
    val useLatency = (cursor.get() % 10 == 0) && candidates.all { rttMs[it] != null }
    return if (useLatency) candidates.minByOrNull { rttMs[it]!! } ?: candidates[idx] else candidates[idx]
  }

  private fun relaySocksAware(client: Socket) {
    var upstream: Socket? = null
    try {
      LocalTunnelIo.configure(client)
      client.soTimeout = 5000
      val cIn = client.getInputStream()
      val cOut = client.getOutputStream()

      // 1. Handshake client (hev) : VER, NMETHODS, METHODS
      val ver = cIn.read()
      if (ver != 0x05) throw IllegalStateException("VER SOCKS invalide $ver")
      val nmethods = cIn.read()
      if (nmethods <= 0) throw IllegalStateException("NMETHODS invalide")
      val methods = ByteArray(nmethods)
      readFully(cIn, methods, 3000)
      // Répond : NO AUTH
      cOut.write(byteArrayOf(0x05, 0x00))
      cOut.flush()

      // 2. Requête : VER CMD RSV ATYP DST.ADDR DST.PORT
      val reqHeader = ByteArray(4)
      readFully(cIn, reqHeader, 3000)
      if (reqHeader[0] != 0x05.toByte()) throw IllegalStateException("REQ VER invalide")
      val cmd = reqHeader[1].toInt() and 0xFF
      val atyp = reqHeader[3].toInt() and 0xFF
      val dstAddr: ByteArray = when (atyp) {
        0x01 -> { val b = ByteArray(4); readFully(cIn, b, 3000); b }
        0x03 -> { val len = cIn.read(); if (len < 0) throw IllegalStateException("DOMAIN len"); val b = ByteArray(len); readFully(cIn, b, 3000); byteArrayOf(len.toByte()) + b }
        0x04 -> { val b = ByteArray(16); readFully(cIn, b, 3000); b }
        else -> throw IllegalStateException("ATYP invalide $atyp")
      }
      val dstPortBytes = ByteArray(2)
      readFully(cIn, dstPortBytes, 3000)
      val dstPort = ((dstPortBytes[0].toInt() and 0xFF) shl 8) or (dstPortBytes[1].toInt() and 0xFF)
      val dstHash = dstAddr.contentHashCode() * 31 + dstPort

      // Choix amont sticky
      var chosen: Int? = null
      var lastError: Throwable? = null
      val tried = mutableSetOf<Int>()
      for (attempt in 0 until upstreamPorts.size) {
        val port = if (attempt == 0) chooseForDestination(dstHash, cmd) else healthyPorts().firstOrNull { it !in tried } ?: break
        if (port in tried) continue
        tried.add(port)
        var cand: Socket? = null
        try {
          cand = Socket()
          LocalTunnelIo.configure(cand, 1500)
          cand.connect(InetSocketAddress("127.0.0.1", port), 1500)
          cand.soTimeout = 5000
          val uOut = cand.getOutputStream()
          val uIn = cand.getInputStream()
          // Handshake amont
          uOut.write(byteArrayOf(0x05, 0x01, 0x00))
          uOut.flush()
          val hResp = ByteArray(2)
          readFully(uIn, hResp, 3000)
          if (hResp[0] != 0x05.toByte() || hResp[1] != 0x00.toByte()) throw IllegalStateException("amont $port handshake rejeté")
          // Transfère la requête originale telle quelle
          uOut.write(reqHeader)
          // Pour ATYP DOMAIN, dstAddr contient déjà len+domain, sinon 4 ou 16
          if (atyp == 0x03) {
            uOut.write(dstAddr)
          } else {
            uOut.write(dstAddr)
          }
          uOut.write(dstPortBytes)
          uOut.flush()
          // Réponse amont
          val repHeader = ByteArray(4)
          readFully(uIn, repHeader, 3000)
          if (repHeader[1] != 0x00.toByte()) throw IllegalStateException("amont $port CONNECT REP=${repHeader[1]} ${repHeader[1].toInt() and 0xFF}")
          val repAtyp = repHeader[3].toInt() and 0xFF
          val repAddrLen = when (repAtyp) {
            0x01 -> 4
            0x03 -> { val l = uIn.read(); if (l < 0) throw IllegalStateException("rep domain len"); l }
            0x04 -> 16
            else -> 0
          }
          val repAddr = if (repAtyp == 0x03) {
            val b = ByteArray(repAddrLen)
            readFully(uIn, b, 3000)
            byteArrayOf(repAddrLen.toByte()) + b
          } else if (repAddrLen > 0) {
            val b = ByteArray(repAddrLen)
            readFully(uIn, b, 3000)
            b
          } else ByteArray(0)
          val repPort = ByteArray(2)
          readFully(uIn, repPort, 3000)
          // Succès : transfère la réponse au client hev
          cOut.write(repHeader)
          if (repAtyp == 0x03) cOut.write(repAddr) else if (repAddr.isNotEmpty()) cOut.write(repAddr)
          cOut.write(repPort)
          cOut.flush()
          upstream = cand
          chosen = port
          synchronized(lock) {
            if (health[port] == false) { health[port] = true; failCount[port] = 0 }
          }
          if (upstreamPorts.size > 1) {
            val kind = if (cmd == 0x03) "UDP-ASSOC" else "CONNECT"
            emit("connection", "ZIVPN-BALANCER", "$kind ${dstAddr.size}b:$dstPort -> SOCKS $port sticky (RTT ${rttMs[port] ?: "?"}ms) [essai ${attempt+1}]")
          }
          break
        } catch (e: Throwable) {
          lastError = e
          try { cand?.close() } catch (_: Throwable) {}
          synchronized(lock) {
            health[port] = false
            failCount[port] = (failCount[port] ?: 0) + 1
            lastProbeMs[port] = SystemClock.elapsedRealtime()
            rttMs.remove(port)
          }
          emit("warning", "ZIVPN-BALANCER", "Amont $port échoué pour dst $dstPort CMD $cmd -> failover (${e.message ?: "erreur"})")
        }
      }
      val up = upstream ?: throw IllegalStateException("Aucune sortie ZIVPN disponible (tous exclus) last=${lastError?.message}")

      // 3. Pipe bidirectionnel (après SOCKS handshake, le tunnel est établi)
      client.soTimeout = 0
      up.soTimeout = 0
      LocalTunnelIo.configure(client, 0)
      LocalTunnelIo.configure(up, 0)
      val forward = thread(isDaemon = true, name = "zivpn-balancer-up") { pipe(client.getInputStream(), up.getOutputStream()) }
      pipe(up.getInputStream(), client.getOutputStream())
      forward.join(300)
    } catch (e: Throwable) {
      if (running.get()) {
        // Ne pas spammer pour les fermetures normales
        val msg = e.message ?: "erreur"
        if (!msg.contains("SOCKS") || msg.contains("REP=")) {
          emit("warning", "ZIVPN-BALANCER", "Relay SOCKS interrompu: $msg")
        }
        // Répondre en erreur SOCKS si possible
        try {
          client.getOutputStream().write(byteArrayOf(0x05, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0))
          client.getOutputStream().flush()
        } catch (_: Throwable) {}
      }
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
      if (n < 0) throw IllegalStateException("EOF SOCKS")
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
