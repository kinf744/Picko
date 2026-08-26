package expo.modules.kighmuvpnnative

import android.content.Context
import android.net.wifi.p2p.WifiP2pGroup
import android.net.wifi.p2p.WifiP2pInfo
import android.net.wifi.p2p.WifiP2pManager
import android.os.Handler
import android.os.Looper
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Réseau de partage créé directement par l'app via Wi-Fi Direct — la technique
 * de PdaNet (« WiFi Direct Hotspot ») : aucune permission privilégiée n'est
 * requise (contrairement au point d'accès système), le groupe est créé en mode
 * legacy (les clients standards se connectent comme à un point d'accès normal)
 * et l'adresse du propriétaire de groupe est FIXE (192.168.49.1 sur la quasi
 * totalité des appareils Android) — l'adresse du proxy devient prévisible.
 */
object WifiDirectHotspot {
  @Volatile private var manager: WifiP2pManager? = null
  @Volatile private var channel: WifiP2pManager.Channel? = null
  private val main = Handler(Looper.getMainLooper())

  private fun ensure(context: Context): Pair<WifiP2pManager, WifiP2pManager.Channel> {
    if (manager == null || channel == null) {
      val app = context.applicationContext
      val m = app.getSystemService(Context.WIFI_P2P_SERVICE) as? WifiP2pManager
        ?: error("Wi-Fi Direct indisponible sur cet appareil")
      val c = m.initialize(app, Looper.getMainLooper(), null)
        ?: error("Initialisation Wi-Fi Direct impossible")
      manager = m
      channel = c
    }
    return manager!! to channel!!
  }

  /** Crée (ou recrée proprement) le groupe Wi-Fi Direct. */
  fun createGroup(context: Context, onDone: (ok: Boolean, error: String?) -> Unit) {
    val pair = try { ensure(context) } catch (error: Throwable) { onDone(false, error.message); return }
    val (m, c) = pair
    main.post {
      m.requestGroupInfo(c) { existing ->
        if (existing != null) {
          // Groupe déjà actif : on le recrée pour repartir propre (SSID/passphrase neuves).
          m.removeGroup(c, object : WifiP2pManager.ActionListener {
            override fun onSuccess() = doCreate(m, c, onDone)
            override fun onFailure(reason: Int) = doCreate(m, c, onDone)
          })
        } else doCreate(m, c, onDone)
      }
    }
  }

  private fun doCreate(m: WifiP2pManager, c: WifiP2pManager.Channel, onDone: (Boolean, String?) -> Unit) {
    m.createGroup(c, object : WifiP2pManager.ActionListener {
      override fun onSuccess() {
        // Laisser le groupe se stabiliser avant la lecture SSID/passphrase/IP.
        main.postDelayed({ onDone(true, null) }, 1_200)
      }
      override fun onFailure(reason: Int) = onDone(false, p2pError(reason))
    })
  }

  fun removeGroup(onDone: (ok: Boolean, error: String?) -> Unit) {
    val m = manager
    val c = channel
    if (m == null || c == null) { onDone(true, null); return }
    main.post {
      m.requestGroupInfo(c) { group ->
        if (group == null) { onDone(true, null); return@requestGroupInfo }
        m.removeGroup(c, object : WifiP2pManager.ActionListener {
          override fun onSuccess() = onDone(true, null)
          override fun onFailure(reason: Int) = onDone(false, p2pError(reason))
        })
      }
    }
  }

  /** Info synchrone côté appelant (thread de travail) : active, ssid, passphrase, ip. */
  fun info(context: Context): Map<String, Any> {
    val pair = try { ensure(context) } catch (_: Throwable) {
      return mapOf("active" to false, "ssid" to "", "passphrase" to "", "ip" to "")
    }
    val (m, c) = pair
    val latch = CountDownLatch(2)
    var group: WifiP2pGroup? = null
    var conn: WifiP2pInfo? = null
    main.post {
      m.requestGroupInfo(c) { group = it; latch.countDown() }
      m.requestConnectionInfo(c) { conn = it; latch.countDown() }
    }
    latch.await(3, TimeUnit.SECONDS)
    val g = group
    val active = g != null && !g.networkName.isNullOrBlank()
    val ssid = g?.networkName.orEmpty()
    val passphrase = try { g?.passphrase.orEmpty() } catch (_: Throwable) { "" }
    // Quand NOUS créons le groupe, nous sommes le propriétaire : adresse fixe.
    val ip = if (conn?.isGroupOwner == true && conn?.groupOwnerAddress?.hostAddress != null) {
      conn!!.groupOwnerAddress.hostAddress!!
    } else "192.168.49.1"
    return mapOf("active" to active, "ssid" to ssid, "passphrase" to passphrase, "ip" to ip)
  }

  private fun p2pError(reason: Int): String = when (reason) {
    WifiP2pManager.ERROR -> "erreur interne Wi-Fi Direct"
    WifiP2pManager.P2P_UNSUPPORTED -> "Wi-Fi Direct non pris en charge"
    WifiP2pManager.BUSY -> "système occupé, réessayez"
    else -> "erreur $reason"
  }
}
