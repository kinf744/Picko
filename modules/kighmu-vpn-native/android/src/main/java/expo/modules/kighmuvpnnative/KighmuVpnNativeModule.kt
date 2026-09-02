package expo.modules.kighmuvpnnative

import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.provider.Settings
import android.telephony.TelephonyManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest
import kotlin.concurrent.thread
import java.util.Locale

class KighmuVpnNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KighmuVpnNative")
    Events("onStateChanged", "onLog")

    OnCreate {
      KighmuVpnService.logSink = { level, component, message ->
        sendEvent("onLog", mapOf(
          "level" to level,
          "component" to component,
          "message" to message,
          "timestamp" to System.currentTimeMillis().toString(),
        ))
      }
      KighmuVpnService.stateSink = { status ->
        sendEvent("onStateChanged", mapOf("status" to status))
      }
    }

    OnDestroy {
      KighmuVpnService.logSink = null
      KighmuVpnService.stateSink = null
    }

    Function("getStatus") { KighmuVpnService.currentStatus }

    Function("getHardwareId") {
      val context = appContext.reactContext ?: return@Function "indisponible"
      Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)?.uppercase() ?: "indisponible"
    }

    // Restauré pour l'écran Paramètres de l'UI #154 : renvoie { hardwareId, mobileOperator, rooted }.
    // Logique identique au build #154 (hardwareId = MD5 hex 32 caractères attendu par settings.tsx).
    AsyncFunction("getDeviceSecurityInfo") {
      val context = appContext.reactContext ?: throw IllegalStateException("Contexte Android indisponible")
      val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID).orEmpty().ifBlank { "${Build.FINGERPRINT}:${context.packageName}" }
      val digest = MessageDigest.getInstance("MD5").digest(androidId.toByteArray(Charsets.UTF_8))
      val hardwareId = digest.joinToString("") { "%02X".format(Locale.US, it) }
      val mobileOperator = try {
        (context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager)?.simOperator.orEmpty().trim().uppercase(Locale.US)
      } catch (_: SecurityException) { "" }
      val rooted = Build.TAGS?.contains("test-keys") == true ||
        listOf("/system/bin/su", "/system/xbin/su", "/sbin/su", "/system/app/Superuser.apk").any { File(it).exists() }
      mapOf(
        "hardwareId" to hardwareId,
        "mobileOperator" to mobileOperator,
        "rooted" to rooted,
        "tamperRisk" to assessTamperRisk(context),
      )
    }

    private fun assessTamperRisk(context: Context): Boolean {
      val debugger = android.os.Debug.isDebuggerConnected()
      val frida = try {
        java.net.Socket().use { it.connect(java.net.InetSocketAddress("127.0.0.1", 27042), 200); true }
      } catch (_: Throwable) { false }
      val installerTrusted = try {
        val installer = context.packageManager.getInstallerPackageName(context.packageName)
        installer == null || installer == context.packageName || installer == "com.android.vending"
      } catch (_: Throwable) { true }
      return debugger || frida || !installerTrusted
    }

    AsyncFunction("prepareVpn") {
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      val intent = VpnService.prepare(activity)
      if (intent == null) true else {
        activity.startActivityForResult(intent, KighmuVpnService.PREPARE_REQUEST_CODE)
        false
      }
    }

    AsyncFunction("startVpn") { profilesJson: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("Contexte Android indisponible")
      val intent = Intent(context, KighmuVpnService::class.java).apply {
        action = KighmuVpnService.ACTION_START
        putExtra(KighmuVpnService.EXTRA_PROFILES_JSON, profilesJson)
      }
      context.startForegroundService(intent)
      sendEvent("onStateChanged", mapOf("status" to KighmuVpnService.STATUS_CONNECTING))
      true
    }

    AsyncFunction("stopVpn") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      context.startService(Intent(context, KighmuVpnService::class.java).apply { action = KighmuVpnService.ACTION_STOP })
      true
    }

    // --- Hotspot Share (100 % sans root) ------------------------------------

    // IP publique vue PAR LE TUNNEL (HTTP via le proxy SOCKS local du balancier).
    // Réponse vide = tunnel inactif ou sonde indisponible.
    AsyncFunction("probeVpnExitIp") {
      val port = KighmuVpnService.currentBalancerPort
      HotspotProbe.fetchExitIpViaSocks(port)
    }

    // Compteurs reellement relayes par la passerelle Hotspot (octets cumules
    // depuis le dernier start()). Hors session, (0, 0) — donc l'UI n'affiche
    // rien tant que le partage n'est pas reellement actif.
    Function("getTrafficTotals") {
      val (rx, tx) = LanShareGateway.getTrafficTotals()
      mapOf("rx" to rx, "tx" to tx)
    }

    // --- Proxy de partage Hotspot (un port HTTP + SOCKS5 sur le LAN) ---------

    AsyncFunction("startLanShare") { preferredPort: Int ->
      val actualPort = LanShareGateway.start(preferredPort)
      mapOf("port" to actualPort, "running" to LanShareGateway.isRunning())
    }

    AsyncFunction("stopLanShare") {
      LanShareGateway.stop()
      true
    }

    AsyncFunction("getLanShareStatus") {
      mapOf(
        "running" to LanShareGateway.isRunning(),
        "port" to (LanShareGateway.portOrNull() ?: -1),
        "balancerPort" to KighmuVpnService.currentBalancerPort,
      )
    }

    // --- Source du partage : tunnels KIGHMU ou routage système (VPN tiers) ---

    // true = la passerelle sort en direct (routage système : VPN tiers actif ou
    // connexion Internet) ; false = via le balancier local (tunnels KIGHMU).
    Function("setLanShareMode") { direct: Boolean ->
      LanShareGateway.directMode = direct
      direct
    }

    // Un réseau VPN est-il actif sur l'appareil (le nôtre ou un tiers) ?
    Function("isVpnActive") {
      val connectivity = appContext.reactContext?.getSystemService(Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
      if (connectivity == null) false
      else connectivity.allNetworks.any { network ->
        connectivity.getNetworkCapabilities(network)?.hasTransport(android.net.NetworkCapabilities.TRANSPORT_VPN) == true
      }
    }

    // IP publique vue par le routage système (suit le VPN tiers actif).
    AsyncFunction("probeDirectExitIp") {
      try {
        val connection = java.net.URL("http://api.ipify.org").openConnection() as java.net.HttpURLConnection
        connection.connectTimeout = 8_000
        connection.readTimeout = 8_000
        connection.setRequestProperty("Connection", "close")
        val code = connection.responseCode
        val body = if (code in 200..299) connection.inputStream.bufferedReader().use { it.readText().trim() } else ""
        connection.disconnect()
        body.takeIf { Regex("^[0-9a-fA-F.:]{3,45}$").matches(it) } ?: ""
      } catch (_: Throwable) { "" }
    }

    // --- Wi-Fi Direct (réseau de partage créé par l'app, technique PdaNet) ---

    AsyncFunction("startWifiDirect") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.reject("ERR_NO_CONTEXT", "Contexte Android indisponible", null); return@AsyncFunction }
      WifiDirectHotspot.createGroup(context) { ok, error ->
        if (ok) promise.resolve(mapOf("ok" to true))
        else promise.reject("ERR_WIFI_DIRECT", error ?: "échec Wi-Fi Direct", null)
      }
    }

    AsyncFunction("stopWifiDirect") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(false); return@AsyncFunction }
      WifiDirectHotspot.removeGroup { ok, _ -> promise.resolve(ok) }
    }

    AsyncFunction("getWifiDirectInfo") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(mapOf("active" to false, "ssid" to "", "passphrase" to "", "ip" to "")); return@AsyncFunction }
      thread(name = "picko-wd-info") { promise.resolve(WifiDirectHotspot.info(context)) }
    }

    // Adresses IPv4 du téléphone visibles depuis le réseau local/hotspot.
    Function("getPhoneLanIps") {
      val ips = java.util.Collections.list(java.net.NetworkInterface.getNetworkInterfaces())
        .flatMap { nif -> java.util.Collections.list(nif.inetAddresses) }
        .filter { it is java.net.Inet4Address && !it.isLoopbackAddress && it.isSiteLocalAddress }
        .map { it.hostAddress.orEmpty() }
        .filter { it.isNotBlank() }
      mapOf("ips" to ips)
    }
  }
}
