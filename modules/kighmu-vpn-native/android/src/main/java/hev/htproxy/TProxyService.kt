package hev.htproxy

import android.util.Log

object TProxyService {
  private const val TAG = "TProxyService"
  @Volatile var isAvailable: Boolean = false
    private set

  fun load() {
    if (isAvailable) return
    try {
      System.loadLibrary("hev_jni")
      isAvailable = true
      Log.i(TAG, "hev_jni loaded")
    } catch (error: Throwable) {
      isAvailable = false
      Log.e(TAG, "Unable to load hev_jni: ${error.message}")
    }
  }

  @JvmStatic external fun TProxyStartService(configPath: String, fd: Int)
  @JvmStatic external fun TProxyStopService()
  @JvmStatic external fun TProxyGetStats(): LongArray
}
