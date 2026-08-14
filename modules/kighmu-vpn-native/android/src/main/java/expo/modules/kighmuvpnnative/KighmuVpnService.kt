package expo.modules.kighmuvpnnative

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.IBinder
import android.os.ParcelFileDescriptor
import java.io.File
import java.util.concurrent.TimeUnit
import androidx.core.app.NotificationCompat
import kotlin.concurrent.thread

class KighmuVpnService : VpnService() {
  private val lifecycleLock = Any()
  private var tunInterface: android.os.ParcelFileDescriptor? = null
  private var nativeProcess: Process? = null
  private var nativeFd: Int = -1
  private var attemptGeneration: Long = 0L

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> stopVpn()
      ACTION_START -> {
        val generation = beginStart() ?: return START_NOT_STICKY
        // VpnService callbacks run on the main thread. Never perform establish(),
        // ProcessBuilder.start() or any native setup there, otherwise STOP is
        // queued behind a slow connection attempt.
        thread(isDaemon = true, name = "kighmu-vpn-start") {
          startVpn(intent, generation)
        }
      }
    }
    return START_NOT_STICKY
  }

  private fun beginStart(): Long? = synchronized(lifecycleLock) {
    if (currentStatus == STATUS_CONNECTED || currentStatus == STATUS_CONNECTING) return@synchronized null
    attemptGeneration += 1
    currentStatus = STATUS_CONNECTING
    stateSink?.invoke(STATUS_CONNECTING)
    attemptGeneration
  }

  private fun isActive(generation: Long): Boolean = synchronized(lifecycleLock) {
    generation == attemptGeneration && currentStatus == STATUS_CONNECTING
  }

  private fun startVpn(intent: Intent, generation: Long) {
    val host = intent.getStringExtra(EXTRA_HOST).orEmpty().trim()
    // Hysteria 2 accepts a multi-port address as host:start-end. Normalize
    // harmless spaces entered in the mobile form before writing YAML.
    val port = intent.getStringExtra(EXTRA_PORT).orEmpty().trim().replace(Regex("\\s+"), "")
    val obfs = intent.getStringExtra(EXTRA_OBFS).orEmpty()
    val password = intent.getStringExtra(EXTRA_PASSWORD).orEmpty()
    if (host.isBlank() || port.isBlank() || obfs.isBlank() || password.isBlank()) {
      currentStatus = STATUS_ERROR
      return
    }

    if (!isActive(generation)) return
    createNotificationChannel()
    startForeground(NOTIFICATION_ID, notification("Connexion à $host:$port"))

    try {
      val builder = Builder()
        .setSession("KIGHMU VPN")
        .setMtu(1500)
        .addAddress("100.100.100.101", 30)
        .addRoute("0.0.0.0", 0)
      val established = builder.establish() ?: error("Android n’a pas fourni d’interface VPN")
      val localFd = established.detachFd()
      synchronized(lifecycleLock) {
        if (!isActive(generation)) {
          ParcelFileDescriptor.adoptFd(localFd).close()
          return
        }
        nativeFd = localFd
        tunInterface = null
      }
      val executable = copyNativeBinary()
      if (!isActive(generation)) {
        ParcelFileDescriptor.adoptFd(localFd).close()
        return
      }
      val config = writeNativeConfig(host, port, obfs, password, localFd)
      val connectivity = getSystemService(CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
      val physicalNetwork = connectivity.activeNetwork
      if (physicalNetwork == null) {
        error("Aucun réseau physique disponible pour le handshake KIGHMU")
      }
      if (!connectivity.bindProcessToNetwork(physicalNetwork)) {
        error("Impossible de lier le client KIGHMU au réseau physique")
      }
      emitLog("info", "NATIVE", "Client KIGHMU lié au réseau physique avant le handshake (${physicalNetwork}).")
      val nativeDir = applicationInfo.nativeLibraryDir
      emitLog("info", "NATIVE", "Binaire prêt: ${executable.name}, taille=${executable.length()}, abi=${Build.SUPPORTED_ABIS.firstOrNull() ?: "inconnue"}.")
      val localProcess = ProcessBuilder(executable.absolutePath, "client", "--config", config.absolutePath)
        .directory(filesDir)
        .apply {
          environment()["LD_LIBRARY_PATH"] = nativeDir
          environment()["HOME"] = filesDir.absolutePath
          environment()["TMPDIR"] = cacheDir.absolutePath
          redirectErrorStream(true)
        }
        .start()
      synchronized(lifecycleLock) {
        if (!isActive(generation)) {
          localProcess.destroy()
          ParcelFileDescriptor.adoptFd(localFd).close()
          config.delete()
          return
        }
        nativeProcess = localProcess
      }
      emitLog("info", "NATIVE", "Processus KIGHMU démarré depuis nativeLibraryDir avec l’interface TUN Android.")
      thread(isDaemon = true, name = "kighmu-native-log") {
        try {
          localProcess.inputStream.bufferedReader().useLines { lines -> lines.forEach { line ->
            if (line.isNotBlank()) emitLog("info", "KIGHMU", line.take(500))
          } }
        } catch (error: Throwable) {
          emitLog("warning", "NATIVE", "Lecture du journal natif interrompue : ${error.message ?: "erreur inconnue"}")
        }
      }
      synchronized(lifecycleLock) {
        if (!isActive(generation)) return
        currentStatus = STATUS_CONNECTED
        stateSink?.invoke(STATUS_CONNECTED)
      }
      startForeground(NOTIFICATION_ID, notification("KIGHMU connecté à $host:$port"))
    } catch (error: Throwable) {
      if (isActive(generation)) {
        currentStatus = STATUS_ERROR
        stateSink?.invoke(STATUS_ERROR)
        emitLog("error", "NATIVE", "Échec de démarrage : ${errorMessage(error)}")
        stopVpn(STATUS_ERROR)
      } else {
        emitLog("info", "NATIVE", "Tentative KIGHMU annulée avant la fin du démarrage.")
      }
    }
  }

  private fun emitLog(level: String, component: String, message: String) {
    logSink?.invoke(level, component, message)
  }

  private fun errorMessage(error: Throwable): String = error.message?.take(500) ?: error::class.java.simpleName

  private fun stopVpn(finalStatus: String = STATUS_DISCONNECTED) {
    // Invalidate the current attempt first. Any worker still inside establish()
    // or ProcessBuilder.start() must abandon its result instead of reviving the
    // cancelled tunnel after the user has pressed Disconnect.
    val process: Process?
    val fd: Int
    val tun: ParcelFileDescriptor?
    synchronized(lifecycleLock) {
      attemptGeneration += 1
      process = nativeProcess
      nativeProcess = null
      fd = nativeFd
      nativeFd = -1
      tun = tunInterface
      tunInterface = null
      currentStatus = finalStatus
      stateSink?.invoke(finalStatus)
    }

    process?.destroy()
    // Reaping is deliberately asynchronous: the STOP intent must return without
    // waiting for a misbehaving native process or a pending QUIC handshake.
    if (process != null) {
      thread(isDaemon = true, name = "kighmu-vpn-reaper") {
        try {
          if (!process.waitFor(1500, TimeUnit.MILLISECONDS)) process.destroyForcibly()
        } catch (_: InterruptedException) {
          process.destroyForcibly()
          Thread.currentThread().interrupt()
        }
      }
    }

    // detachFd() transfers ownership away from ParcelFileDescriptor. Adopt and
    // close it explicitly, otherwise the parent process keeps the TUN descriptor
    // alive even after the native child has exited.
    if (fd >= 0) {
      try {
        ParcelFileDescriptor.adoptFd(fd).close()
      } catch (error: Throwable) {
        emitLog("warning", "NATIVE", "Fermeture du descripteur TUN : ${errorMessage(error)}")
      }
    }
    try {
      tun?.close()
    } catch (error: Throwable) {
      emitLog("warning", "NATIVE", "Fermeture de l’interface TUN : ${errorMessage(error)}")
    }
    try {
      val connectivity = getSystemService(CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
      connectivity.bindProcessToNetwork(null)
    } catch (error: Throwable) {
      emitLog("warning", "NATIVE", "Libération du réseau physique : ${errorMessage(error)}")
    }
    File(filesDir, "kighmu-client.yaml").delete()
    emitLog("info", "NATIVE", "Arrêt immédiat demandé : processus KIGHMU, TUN et binding réseau libérés.")
    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
    stopSelf()
  }

  private fun copyNativeBinary(): File {
    // The ELF is packaged as a native library so Android extracts it under
    // nativeLibraryDir, which is executable. Running an asset copied to filesDir
    // can fail with EACCES on devices mounting app data with noexec.
    val nativeTarget = File(applicationInfo.nativeLibraryDir, "libkighmu.so")
    if (!nativeTarget.exists() || nativeTarget.length() == 0L) {
      error("Binaire KIGHMU absent de nativeLibraryDir : ${nativeTarget.absolutePath}")
    }
    if (!nativeTarget.canExecute()) {
      error("Binaire KIGHMU non exécutable dans nativeLibraryDir : ${nativeTarget.absolutePath}")
    }
    return nativeTarget
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
      transport:
        type: udp
        udp:
          hopInterval: 30s
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
    val stopPending = PendingIntent.getService(
      this,
      NOTIFICATION_ID,
      Intent(this, KighmuVpnService::class.java).apply { action = ACTION_STOP },
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_warning)
      .setContentTitle("KIGHMU VPN")
      .setContentText(text)
      .setOngoing(true)
      .setContentIntent(pending)
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Arrêter", stopPending)
      .build()
  }

  override fun onRevoke() {
    stopVpn()
    super.onRevoke()
  }

  override fun onDestroy() {
    stopVpn()
    super.onDestroy()
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
    @Volatile var stateSink: ((String) -> Unit)? = null
  }
}
