package expo.modules.kighmuvpnnative

import android.content.Intent
import android.net.VpnService
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

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
    }

    OnDestroy {
      KighmuVpnService.logSink = null
    }

    Function("getStatus") {
      KighmuVpnService.currentStatus
    }

    AsyncFunction("prepareVpn") {
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      val intent = VpnService.prepare(activity)
      if (intent == null) {
        true
      } else {
        activity.startActivityForResult(intent, KighmuVpnService.PREPARE_REQUEST_CODE)
        false
      }
    }

    AsyncFunction("startVpn") { host: String, port: String, obfs: String, password: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("Contexte Android indisponible")
      val intent = Intent(context, KighmuVpnService::class.java).apply {
        action = KighmuVpnService.ACTION_START
        putExtra(KighmuVpnService.EXTRA_HOST, host)
        putExtra(KighmuVpnService.EXTRA_PORT, port)
        putExtra(KighmuVpnService.EXTRA_OBFS, obfs)
        putExtra(KighmuVpnService.EXTRA_PASSWORD, password)
      }
      context.startForegroundService(intent)
      sendEvent("onStateChanged", mapOf("status" to KighmuVpnService.STATUS_CONNECTING))
      true
    }

    AsyncFunction("stopVpn") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      context.startService(Intent(context, KighmuVpnService::class.java).apply {
        action = KighmuVpnService.ACTION_STOP
      })
      sendEvent("onStateChanged", mapOf("status" to KighmuVpnService.STATUS_DISCONNECTED))
      true
    }
  }
}
