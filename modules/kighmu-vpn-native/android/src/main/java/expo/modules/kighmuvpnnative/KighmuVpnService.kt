package expo.modules.kighmuvpnnative

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.IBinder
import java.io.File
import androidx.core.app.NotificationCompat
import kotlin.concurrent.thread

class KighmuVpnService : VpnService() {
  private var tunInterface: android.os.ParcelFileDescriptor? = null
  private var nativeProcess: Process? = null
  private var nativeFd: Int = -1

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> stopVpn()
      ACTION_START -> startVpn(intent)
    }
    return START_NOT_STICKY
  }

  private fun startVpn(intent: Intent) {
    if (currentStatus == STATUS_CONNECTED || currentStatus == STATUS_CONNECTING) return
    val host = intent.getStringExtra(EXTRA_HOST).orEmpty()
    val port = intent.getStringExtra(EXTRA_PORT).orEmpty()
    val obfs = intent.getStringExtra(EXTRA_OBFS).orEmpty()
    val password = intent.getStringExtra(EXTRA_PASSWORD).orEmpty()
    if (host.isBlank() || port.isBlank() || obfs.isBlank() || password.isBlank()) {
      currentStatus = STATUS_ERROR
      return
    }

    currentStatus = STATUS_CONNECTING
    createNotificationChannel()
    startForeground(NOTIFICATION_ID, notification("Connexion à $host:$port"))

    try {
      val builder = Builder()
        .setSession("KIGHMU VPN")
        .setMtu(1500)
        .addAddress("100.100.100.101", 30)
        .addRoute("0.0.0.0", 0)
      val established = builder.establish() ?: error("Android n’a pas fourni d’interface VPN")
      nativeFd = established.detachFd()
      tunInterface = null
      val executable = copyNativeBinary()
      val config = writeNativeConfig(host, port, obfs, password, nativeFd)
      nativeProcess = ProcessBuilder(executable.absolutePath, "client", "--config", config.absolutePath)
        .redirectErrorStream(true)
        .start()
      emitLog("info", "NATIVE", "Processus KIGHMU démarré avec l’interface TUN Android.")
      thread(isDaemon = true, name = "kighmu-native-log") {
        try {
          nativeProcess?.inputStream?.bufferedReader()?.useLines { lines -> lines.forEach { line ->
            if (line.isNotBlank()) emitLog("info", "KIGHMU", line.take(500))
          } }
        } catch (error: Throwable) {
          emitLog("warning", "NATIVE", "Lecture du journal natif interrompue : ${error.message ?: "erreur inconnue"}")
        }
      }
      currentStatus = STATUS_CONNECTED
      startForeground(NOTIFICATION_ID, notification("KIGHMU connecté à $host:$port"))
    } catch (error: Throwable) {
      currentStatus = STATUS_ERROR
      emitLog("error", "NATIVE", "Échec de démarrage : ${errorMessage(error)}")
      stopVpn()
    }
  }

  private fun emitLog(level: String, component: String, message: String) {
    logSink?.invoke(level, component, message)
  }

  private fun errorMessage(error: Throwable): String = error.message?.take(500) ?: error::class.java.simpleName

  private fun stopVpn() {
    nativeProcess?.destroy()
    nativeProcess = null
    emitLog("info", "NATIVE", "Processus KIGHMU arrêté.")
    tunInterface?.close()
    tunInterface = null
    nativeFd = -1
    File(filesDir, "kighmu-client.yaml").delete()
    currentStatus = STATUS_DISCONNECTED
    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
    stopSelf()
  }

  private fun copyNativeBinary(): File {
    val target = File(filesDir, "kighmu-native-armeabi-v7a")
    if (!target.exists() || target.length() == 0L) {
      assets.open("kighmu-native-armeabi-v7a").use { input -> target.outputStream().use { output -> input.copyTo(output) } }
      target.setExecutable(true, true)
    }
    return target
  }

  private fun writeNativeConfig(host: String, port: String, obfs: String, password: String, fd: Int): File {
    val target = File(filesDir, "kighmu-client.yaml")
    val yaml = """
      server: ${yamlScalar("$host:$port")}
      auth: ${yamlScalar(password)}
      obfs:
        type: salamander
        salamander:
          password: ${yamlScalar(obfs)}
      tls:
        sni: ${yamlScalar(host)}
        insecure: true
      quic:
        disablePathMTUDiscovery: false
      tun:
        name: kighmu
        mtu: 1500
        fileDescriptor: $fd
        timeout: 5m
        address:
          ipv4: 100.100.100.101/30
          ipv6: 2001::ffff:ffff:ffff:fff1/126
        route:
          strict: true
          ipv4: [0.0.0.0/0]
          ipv6: ["2000::/3"]
    """.trimIndent()
    target.writeText(yaml)
    return target
  }

  private fun yamlScalar(value: String): String = "'" + value.replace("'", "''") + "'"

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= 26) {
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "KIGHMU VPN", NotificationManager.IMPORTANCE_LOW))
    }
  }

  private fun notification(text: String): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pending = launchIntent?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_warning)
      .setContentTitle("KIGHMU VPN")
      .setContentText(text)
      .setOngoing(true)
      .setContentIntent(pending)
      .build()
  }

  override fun onRevoke() {
    stopVpn()
    super.onRevoke()
  }

  override fun onBind(intent: Intent?): IBinder? = super.onBind(intent)

  companion object {
    const val ACTION_START = "expo.modules.kighmuvpnnative.START"
    const val ACTION_STOP = "expo.modules.kighmuvpnnative.STOP"
    const val EXTRA_HOST = "host"
    const val EXTRA_PORT = "port"
    const val EXTRA_OBFS = "obfs"
    const val EXTRA_PASSWORD = "password"
    const val PREPARE_REQUEST_CODE = 4007
    const val STATUS_DISCONNECTED = "disconnected"
    const val STATUS_CONNECTING = "connecting"
    const val STATUS_CONNECTED = "connected"
    const val STATUS_ERROR = "error"
    const val CHANNEL_ID = "kighmu-vpn"
    const val NOTIFICATION_ID = 4008
    @Volatile var currentStatus: String = STATUS_DISCONNECTED
    @Volatile var logSink: ((String, String, String) -> Unit)? = null
  }
}
