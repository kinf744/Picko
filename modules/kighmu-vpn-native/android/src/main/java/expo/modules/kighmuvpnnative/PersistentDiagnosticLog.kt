package expo.modules.kighmuvpnnative

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Persists a redacted native diagnostic trace before it is forwarded to React Native.
 * Android 10+ uses MediaStore so no broad storage permission is needed for Downloads.
 */
object PersistentDiagnosticLog {
  private const val FILE_NAME = "kighmu.txt"
  private const val MAX_LINE_CHARS = 1_200
  private val lock = Any()
  private val timestampFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS Z", Locale.US)
  private val keyValueSecret = Regex("(?i)(\\\"?(?:password|pass|obfs|auth|token|authorization|secret|private[_-]?key)\\\"?\\s*[:=]\\s*)(?:\\\"[^\\\"]*\\\"|[^\\s,;}]+)")
  private val tunnelLink = Regex("(?i)(vmess|vless|trojan)://[^\\s]+")
  private val credentialUrl = Regex("//[^\\s/@]+@")

  @Volatile private var appContext: Context? = null
  @Volatile private var downloadsUri: Uri? = null
  @Volatile private var initialized = false

  fun initialize(context: Context) {
    val header: String?
    synchronized(lock) {
      appContext = context.applicationContext
      header = if (!initialized) {
        initialized = true
        "\n===== KIGHMU VPN diagnostic ${timestampFormat.format(Date())} =====\n" +
          "Trace native persistante. Les secrets sont masqués avant écriture.\n"
      } else null
    }
    header?.let { appendRaw(it) }
  }

  fun record(context: Context?, level: String, component: String, message: String) {
    if (context != null) initialize(context)
    val safeLevel = level.uppercase(Locale.US).take(16)
    val safeComponent = component.replace(Regex("[^A-Za-z0-9_/-]"), "_").take(48)
    val line = "${timestampFormat.format(Date())} [$safeLevel] [$safeComponent] ${redact(message)}\n"
    appendRaw(line)
  }

  fun recordThrowable(context: Context?, component: String, error: Throwable) {
    val detail = buildString {
      append(error::class.java.simpleName)
      error.message?.takeIf { it.isNotBlank() }?.let { append(": ").append(it) }
      error.stackTrace.take(12).forEach { append("\n  at ").append(it.toString()) }
    }
    record(context, "error", component, detail)
  }

  private fun appendRaw(line: String) {
    val context = appContext ?: return
    val safeLine = line.take(MAX_LINE_CHARS * 13).let { if (it.endsWith("\n")) it else "$it\n" }
    try { appendInternal(context, safeLine) } catch (_: Throwable) {}
    try { appendDownloads(context, safeLine) } catch (_: Throwable) {}
  }

  private fun appendInternal(context: Context, line: String) {
    FileOutputStream(File(context.filesDir, FILE_NAME), true).use { it.write(line.toByteArray(Charsets.UTF_8)) }
  }

  private fun appendDownloads(context: Context, line: String) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val resolver = context.contentResolver
      val uri = downloadsUri ?: findOrCreateDownloadsUri(context).also { downloadsUri = it }
      resolver.openOutputStream(uri, "wa")?.use { it.write(line.toByteArray(Charsets.UTF_8)) }
      return
    }

    // Android 9 and earlier may deny this write without the legacy storage grant.
    // The internal mirror remains available and the failure never affects a tunnel.
    val directory = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    if (!directory.exists()) directory.mkdirs()
    FileOutputStream(File(directory, FILE_NAME), true).use { it.write(line.toByteArray(Charsets.UTF_8)) }
  }

  private fun findOrCreateDownloadsUri(context: Context): Uri {
    val resolver = context.contentResolver
    val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    resolver.query(
      collection,
      arrayOf(MediaStore.MediaColumns._ID),
      "${MediaStore.MediaColumns.DISPLAY_NAME} = ?",
      arrayOf(FILE_NAME),
      "${MediaStore.MediaColumns.DATE_ADDED} DESC",
    )?.use { cursor ->
      if (cursor.moveToFirst()) {
        return ContentUris.withAppendedId(collection, cursor.getLong(0))
      }
    }

    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, FILE_NAME)
      put(MediaStore.MediaColumns.MIME_TYPE, "text/plain")
      put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
    }
    return requireNotNull(resolver.insert(collection, values)) { "Création de kighmu.txt impossible" }
  }

  private fun redact(raw: String): String {
    var value = raw
    value = keyValueSecret.replace(value) { match -> "${match.groupValues[1]}[masqué]" }
    value = tunnelLink.replace(value, "[lien de tunnel masqué]")
    value = credentialUrl.replace(value, "//[identifiants masqués]@")
    return value.replace(Regex("[\\r\\n]+"), " | ").trim().take(MAX_LINE_CHARS)
  }
}
