package expo.modules.kighmuvpnnative

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
      val prefs = context.getSharedPreferences("kighmu_vpn_state", Context.MODE_PRIVATE)
      val enc = prefs.getString("last_profiles_json", null).orEmpty()
      if (enc.isBlank()) return
      val payload = try { CryptoPrefs.decrypt(enc) } catch (_: Throwable) { enc }
      if (payload.isBlank()) return
      val serviceIntent = Intent(context, KighmuVpnService::class.java).apply {
        action = KighmuVpnService.ACTION_START
        putExtra(KighmuVpnService.EXTRA_PROFILES_JSON, payload)
      }
      try { context.startForegroundService(serviceIntent) } catch (_: Throwable) {}
    }
  }
}
