package expo.modules.kighmuvpnnative

import android.content.Context
import android.util.Log
import java.io.File
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

object ZivpnTun2Socks {
  private const val TAG = "ZivpnTun2Socks"
  private val lock = ReentrantLock()
  @Volatile private var running = false

  fun init(): Boolean {
    TProxyLoad.ensureLoaded()
    return hev.htproxy.TProxyService.isAvailable
  }

  fun start(context: Context, fd: Int, socksPort: Int, mtu: Int = 1400) {
    lock.withLock {
      if (!init()) error("hev_jni indisponible pour le relais ZIVPN")
      if (running) {
        hev.htproxy.TProxyService.TProxyStopService()
        running = false
      }
      val configFile = File(context.cacheDir, "zivpn-hev.yaml")
      configFile.writeText(
        """
        tunnel:
          mtu: $mtu
          ipv4: 198.18.0.1
        socks5:
          port: $socksPort
          address: 127.0.0.1
          udp: udp
        misc:
          log-level: warn
        """.trimIndent(),
      )
      hev.htproxy.TProxyService.TProxyStartService(configFile.absolutePath, fd)
      running = true
      Log.i(TAG, "ZIVPN TUN relay started fd=$fd socks=$socksPort")
    }
  }

  fun stop() {
    lock.withLock {
      if (running && hev.htproxy.TProxyService.isAvailable) {
        hev.htproxy.TProxyService.TProxyStopService()
      }
      running = false
      Log.i(TAG, "ZIVPN TUN relay stopped")
    }
  }
}

private object TProxyLoad {
  @Volatile private var attempted = false

  fun ensureLoaded() {
    if (!attempted) {
      synchronized(this) {
        if (!attempted) {
          hev.htproxy.TProxyService.load()
          attempted = true
        }
      }
    }
  }
}
