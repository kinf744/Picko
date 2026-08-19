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
      KighmuVpnService.stateSink = { status ->
        sendEvent("onStateChanged", mapOf("status" to status))
      }
    }

    OnDestroy {
      KighmuVpnService.logSink = null
      KighmuVpnService.stateSink = null
    }

    Function("getStatus") {
      KighmuVpnService.currentStatus
    }

    AsyncFunction("getDeviceSecurityInfo") {
      val context = appContext.reactContext ?: throw IllegalStateException("Contexte Android indisponible")
      KighmuVpnService.deviceSecurityInfo(context)
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

    AsyncFunction("startVpn") { configJson: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("Contexte Android indisponible")
      val intent = Intent(context, KighmuVpnService::class.java).apply {
        action = KighmuVpnService.ACTION_START
        putExtra(KighmuVpnService.EXTRA_CONFIG_JSON, configJson)
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
      // The service emits DISCONNECTED after process/TUN/network cleanup.
      true
    }
  }
}
