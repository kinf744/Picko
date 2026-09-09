package expo.modules.kighmuvpnnative

import android.content.Context
import android.os.Build
import android.os.Environment
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Logger fichier pour diagnostic V2Ray DNS / Trojan / VMess.
 * Écrit dans Download/kighmu.txt (public si possible, fallback scoped).
 * - Filtrage anti-verbeux: dedup 2s + rate-limit 5/s par composant + ignore keepalive
 * - Nettoyage fiable: si > LIMITE (2M), garde seulement 800 dernières lignes (pas de old.txt infini)
 */
object FileLogger {
  private const val FILENAME = "kighmu.txt"
  private const val MAX_SIZE_BYTES = 5L * 1024L * 1024L // 5 Mio pour trace ZIVPN détaillée
  private const val KEEP_LINES_ON_CLEAN = 1500
  private const val DEDUP_MS = 2000L
  private const val RATE_LIMIT_PER_SEC = 8
  @Volatile private var resolvedFile: File? = null
  @Volatile private var publicFile: File? = null
  private val lock = Any()
  private val tsFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.FRANCE)
  // Filtre anti-verbeux
  private val lastMsgByComponent = mutableMapOf<String, Pair<String, Long>>()
  private val timestampsByComponent = mutableMapOf<String, MutableList<Long>>()

  fun init(context: Context) { resolveFile(context); resolvePublicFile(context) }

  private fun resolvePublicFile(context: Context): File? {
    publicFile?.let { if (it.exists() || it.parentFile?.exists() == true) return it }
    synchronized(lock) {
      publicFile?.let { return it }
      // 1) Tente Download public direct (API <29 ou avec WRITE_EXTERNAL_STORAGE)
      try {
        val downloadDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        if (downloadDir != null) {
          if (!downloadDir.exists()) downloadDir.mkdirs()
          val candidate = File(downloadDir, FILENAME)
          try {
            if (!candidate.exists()) candidate.createNewFile()
            if (candidate.exists() && candidate.canWrite()) {
              publicFile = candidate
              return candidate
            }
          } catch (_: Throwable) {}
        }
      } catch (_: Throwable) {}
      // 2) Tente fichier scoped dans Download externe (visible via file manager sur certains appareils)
      try {
        val scopedDownload = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
        if (scopedDownload != null) {
          if (!scopedDownload.exists()) scopedDownload.mkdirs()
          val candidate = File(scopedDownload, FILENAME)
          publicFile = candidate
          return candidate
        }
      } catch (_: Throwable) {}
      return null
    }
  }

  private fun resolveFile(context: Context): File? {
    resolvedFile?.let { if (it.exists() || it.parentFile?.exists() == true) return it }
    synchronized(lock) {
      resolvedFile?.let { return it }
      // Fichier interne prive (MODE_PRIVATE) - non visible par autres apps ni MTP
      try {
        val privateDir = File(context.filesDir, "kighmu-logs")
        if (!privateDir.exists()) privateDir.mkdirs()
        val candidate = File(privateDir, FILENAME)
        try {
          if (!candidate.exists()) candidate.createNewFile()
          if (candidate.canWrite()) {
            resolvedFile = candidate
            return candidate
          }
        } catch (_: Throwable) {}
      } catch (_: Throwable) {}
      // Fallback scoped externe prive
      try {
        val scopedDir = context.getExternalFilesDir(null) ?: context.filesDir
        if (!scopedDir.exists()) scopedDir.mkdirs()
        val fallback = File(scopedDir, FILENAME)
        resolvedFile = fallback
        return fallback
      } catch (_: Throwable) {}
      return null
    }
  }

  fun getPath(context: Context): String? = resolvePublicFile(context)?.absolutePath ?: resolveFile(context)?.absolutePath
  fun getDownloadPath(context: Context): String? = resolvePublicFile(context)?.absolutePath
  fun getPrivatePath(context: Context): String? = resolveFile(context)?.absolutePath

  fun shouldLog(component: String, message: String): Boolean {
    val now = System.currentTimeMillis()
    val trimmed = message.trim()
    // 1) Ignore lignes vides / keepalive ultra verbeux
    if (trimmed.isEmpty() || trimmed.length > 2000) return false
    val lower = trimmed.lowercase()
    if (lower.contains("keepalive") && lower.length < 60) return false
    // 2) Dedup: même message < 2s
    synchronized(lock) {
      val last = lastMsgByComponent[component]
      if (last != null && last.first == trimmed && now - last.second < DEDUP_MS) return false
      lastMsgByComponent[component] = trimmed to now
      // 3) Rate-limit: max 5 logs/sec par composant
      val list = timestampsByComponent.getOrPut(component) { mutableListOf() }
      list.removeAll { now - it > 1000 }
      if (list.size >= RATE_LIMIT_PER_SEC) return false
      list.add(now)
      // Nettoyage map si trop grande
      if (lastMsgByComponent.size > 50) lastMsgByComponent.clear()
      if (timestampsByComponent.size > 50) timestampsByComponent.clear()
    }
    return true
  }

  fun log(context: Context, component: String, message: String) {
    if (!shouldLog(component, message)) return
    writeToAll(context, component, message, filtered = true)
  }

  /** Écriture détaillée ZIVPN sans filtre anti-verbeux (pour kighmu.txt Download) */
  fun logDetail(context: Context, component: String, message: String) {
    writeToAll(context, component, message, filtered = false)
  }

  private fun writeToAll(context: Context, component: String, message: String, filtered: Boolean) {
    try {
      val ts = tsFormat.format(Date())
      val line = "[$ts] [$component] $message\n"
      // 1) Fichier privé interne (toujours) - garanti sans permission
      try {
        val file = resolveFile(context)
        if (file != null) {
          synchronized(lock) {
            if (filtered && file.exists() && file.length() > MAX_SIZE_BYTES) {
              try {
                val lines = file.readLines()
                val keep = if (lines.size > KEEP_LINES_ON_CLEAN) lines.takeLast(KEEP_LINES_ON_CLEAN) else lines.takeLast((lines.size * 0.5).toInt())
                val t2 = tsFormat.format(Date())
                file.writeText(keep.joinToString("\n") + "\n")
                file.appendText("[$t2] [SYSTEM] Nettoyage auto: limite ${MAX_SIZE_BYTES/1024}Ko atteinte, garde ${keep.size} dernières lignes\n", Charsets.UTF_8)
              } catch (_: Throwable) {
                try { file.writeText("") } catch (_: Throwable) {}
              }
            }
            file.appendText(line, Charsets.UTF_8)
          }
        }
      } catch (_: Throwable) {}
      // 2) Fichier Download scoped (Android/data/.../Download) - toujours accessible sans permission
      try {
        val scoped = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
        if (scoped != null) {
          if (!scoped.exists()) scoped.mkdirs()
          val f = File(scoped, FILENAME)
          synchronized(lock) {
            f.appendText(line, Charsets.UTF_8)
          }
        }
      } catch (_: Throwable) {}
      // 3) Fichier Download public via File API (legacy, API <29 ou si permission accordée)
      try {
        val pub = resolvePublicFile(context)
        if (pub != null) {
          synchronized(lock) {
            if (pub.exists() && pub.length() > MAX_SIZE_BYTES) {
              try {
                val lines = pub.readLines()
                val keep = lines.takeLast(KEEP_LINES_ON_CLEAN)
                pub.writeText(keep.joinToString("\n") + "\n")
                pub.appendText("[$ts] [SYSTEM] Nettoyage Download: limite atteinte, garde ${keep.size} lignes\n", Charsets.UTF_8)
              } catch (_: Throwable) { try { pub.writeText("") } catch (_: Throwable) {} }
            }
            // Évite double écriture si pub == private (déjà fait)
            if (pub.absolutePath != resolveFile(context)?.absolutePath) {
              pub.appendText(line, Charsets.UTF_8)
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && pub.absolutePath.contains(Environment.DIRECTORY_DOWNLOADS)) {
                try { pub.setLastModified(System.currentTimeMillis()) } catch (_: Throwable) {}
              }
            }
          }
        }
      } catch (_: Throwable) {}
      // 4) TOUJOURS écrire dans Download public via MediaStore (Android Q+) - GARANTIT visibilité dans /Download
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          writeViaMediaStore(context, line)
        } else {
          // API <29 : tente aussi MediaStore si pub échoue
          val dl = resolvePublicFile(context)
          if (dl == null || !dl.exists()) writeViaMediaStore(context, line)
        }
      } catch (_: Throwable) {}
      // 5) Logcat pour adb (radical debug)
      try { android.util.Log.d("KIGHMU-$component", message) } catch (_: Throwable) {}
    } catch (_: Throwable) {}
  }

  private fun writeViaMediaStore(context: Context, line: String) {
    try {
      val resolver = context.contentResolver
      val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) android.provider.MediaStore.Downloads.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY) else android.provider.MediaStore.Files.getContentUri("external")
      var uri: android.net.Uri? = null
      try {
        resolver.query(collection, arrayOf(android.provider.MediaStore.Downloads._ID), "${android.provider.MediaStore.Downloads.DISPLAY_NAME} = ?", arrayOf(FILENAME), null)?.use { cursor ->
          if (cursor.moveToFirst()) {
            val id = cursor.getLong(0)
            uri = android.content.ContentUris.withAppendedId(collection, id)
          }
        }
      } catch (_: Throwable) {}
      if (uri == null) {
        val values = android.content.ContentValues().apply {
          put(android.provider.MediaStore.Downloads.DISPLAY_NAME, FILENAME)
          put(android.provider.MediaStore.Downloads.MIME_TYPE, "text/plain")
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) put(android.provider.MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
          else put(android.provider.MediaStore.Downloads.DATA, Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).absolutePath + "/" + FILENAME)
        }
        uri = resolver.insert(collection, values)
      }
      if (uri != null) {
        // Tente append ("wa"), sinon écrase puis ajoute (certains OEM ne supportent pas "wa")
        var written = false
        try {
          resolver.openOutputStream(uri!!, "wa")?.use { it.write(line.toByteArray(Charsets.UTF_8)); written = true }
        } catch (_: Throwable) {}
        if (!written) {
          try {
            // Lecture existant + réécriture
            val existing = try { resolver.openInputStream(uri!!)?.bufferedReader(Charsets.UTF_8)?.readText() ?: "" } catch (_: Throwable) { "" }
            val truncated = if (existing.length > 5 * 1024 * 1024) existing.takeLast(1500 * 120) else existing
            resolver.openOutputStream(uri!!, "w")?.use { it.write((truncated + line).toByteArray(Charsets.UTF_8)) }
          } catch (_: Throwable) {
            try { resolver.openOutputStream(uri!!, "w")?.use { it.write(line.toByteArray(Charsets.UTF_8)) } } catch (_: Throwable) {}
          }
        }
      } else {
        // Fallback ultime : fichier direct dans Download legacy
        try {
          val legacy = File(Environment.getExternalStorageDirectory(), "Download/$FILENAME")
          legacy.parentFile?.mkdirs()
          legacy.appendText(line, Charsets.UTF_8)
        } catch (_: Throwable) {}
      }
    } catch (_: Throwable) {
      try {
        val legacy = File(Environment.getExternalStorageDirectory(), "Download/$FILENAME")
        legacy.parentFile?.mkdirs()
        legacy.appendText(line, Charsets.UTF_8)
      } catch (_: Throwable) {}
    }
  }

  /** Log forcé sans filtre (header, erreurs critiques) */
  fun logForce(context: Context, component: String, message: String) {
    try {
      val file = resolveFile(context) ?: return
      synchronized(lock) {
        val ts = tsFormat.format(Date())
        file.appendText("[$ts] [$component] $message\n", Charsets.UTF_8)
      }
    } catch (_: Throwable) {}
  }

  fun header(context: Context, profile: TunnelProfile) {
    try {
      val ts = tsFormat.format(Date())
      val header = buildString {
        appendLine("========================================")
        appendLine("[$ts] KIGHMU VPN — V2Ray DNS DIAGNOSTIC")
        appendLine("Profil: ${profile.name} (${profile.id}) method=${profile.method} xrayMode=${profile.xrayMode}")
        appendLine("Android SDK: ${Build.VERSION.SDK_INT} Model: ${Build.MODEL} MANU=${Build.MANUFACTURER} BRAND=${Build.BRAND}")
        appendLine("Heure: $ts")
        appendLine("Download public: ${getDownloadPath(context)}")
        appendLine("Private: ${getPrivatePath(context)}")
        appendLine("========================================")
      }
      // Écrit header dans TOUS les emplacements (radical)
      try { logDetail(context, "SYSTEM", header) } catch (_: Throwable) {}
      // Force aussi header direct MediaStore
      try { writeViaMediaStore(context, header) } catch (_: Throwable) {}
    } catch (_: Throwable) {}
  }

  /** Garantit que Download/kighmu.txt existe avec header, même sans tunnel actif */
  fun ensureDownloadFile(context: Context) {
    try {
      val ts = tsFormat.format(Date())
      val dl = getDownloadPath(context) ?: "MediaStore/Download/kighmu.txt"
      val msg = "[$ts] [SYSTEM] ensureDownloadFile Download=$dl Private=${getPrivatePath(context)} SDK=${Build.VERSION.SDK_INT}"
      logDetail(context, "SYSTEM", msg)
      // Force création via MediaStore si absent
      writeViaMediaStore(context, "[$ts] [SYSTEM] KIGHMU log init - test ecriture Download/kighmu.txt\n")
    } catch (_: Throwable) {}
  }

  fun clear(context: Context) {
    try {
      val file = resolveFile(context) ?: return
      synchronized(lock) {
        try { file.writeBytes(ByteArray(file.length().toInt())) } catch (_: Throwable) {}
        file.writeText("")
        try { file.delete() } catch (_: Throwable) {}
        resolvedFile = null
        lastMsgByComponent.clear()
        timestampsByComponent.clear()
      }
    } catch (_: Throwable) {}
  }

  fun secureDelete(file: File?) {
    if (file == null || !file.exists()) return
    try {
      val len = file.length().toInt().coerceAtMost(8 * 1024 * 1024)
      if (len > 0) file.writeBytes(ByteArray(len))
      file.delete()
    } catch (_: Throwable) { try { file.delete() } catch (_: Throwable) {} }
  }

  /** Journalise JSON Xray en masquant secrets mais en gardant protocole/transport pour debug Trojan/VMess */
  fun logXrayJson(context: Context, component: String, json: String) {
    try {
      val sanitized = sanitizeXrayJson(json)
      log(context, component, "CONFIG Xray (sanitized): $sanitized")
    } catch (_: Throwable) {
      log(context, component, "CONFIG Xray (sanitized-fallback): ${json.replace(Regex("\"(id|password)\"\\s*:\\s*\"[^\"]+\""), "\"\$1\":\"***REDACTED***\"").take(2000)}")
    }
  }

  private fun sanitizeXrayJson(json: String): String {
    return try {
      val root = JSONObject(json)
      // Parcourir outbounds et masquer password/id
      root.optJSONArray("outbounds")?.let { outbounds ->
        for (i in 0 until outbounds.length()) {
          val out = outbounds.optJSONObject(i) ?: continue
          val settings = out.optJSONObject("settings") ?: continue
          // vnext -> users[].id
          settings.optJSONArray("vnext")?.let { vnext ->
            for (j in 0 until vnext.length()) {
              vnext.optJSONObject(j)?.optJSONArray("users")?.let { users ->
                for (k in 0 until users.length()) {
                  users.optJSONObject(k)?.let { user ->
                    if (user.has("id")) user.put("id", "***REDACTED***")
                    if (user.has("password")) user.put("password", "***REDACTED***")
                  }
                }
              }
            }
          }
          // servers -> password
          settings.optJSONArray("servers")?.let { servers ->
            for (j in 0 until servers.length()) {
              val s = servers.optJSONObject(j) ?: continue
              if (s.has("password")) s.put("password", "***REDACTED***")
              if (s.has("id")) s.put("id", "***REDACTED***")
            }
          }
          // trojan password
          if (settings.has("password")) settings.put("password", "***REDACTED***")
        }
      }
      // Log résumé outbounds pour debug rapide
      val summary = StringBuilder()
      root.optJSONArray("outbounds")?.let { outbounds ->
        for (i in 0 until outbounds.length()) {
          val out = outbounds.optJSONObject(i) ?: continue
          val proto = out.optString("protocol")
          val tag = out.optString("tag")
          val stream = out.optJSONObject("streamSettings")
          val net = stream?.optString("network") ?: "tcp"
          val sec = stream?.optString("security") ?: "none"
          val tls = stream?.optJSONObject("tlsSettings")
          val sni = tls?.optString("serverName") ?: tls?.optString("verifyPeerCertByName") ?: "-"
          summary.append("out[$i] proto=$proto tag=$tag net=$net sec=$sec sni=$sni; ")
          // Trojan/VMess specifics
          val settings = out.optJSONObject("settings")
          settings?.optJSONArray("vnext")?.optJSONObject(0)?.let { v ->
            summary.append("vnext addr=${v.optString("address")} port=${v.optInt("port")} ")
          }
          settings?.optJSONArray("servers")?.optJSONObject(0)?.let { s ->
            summary.append("server addr=${s.optString("address")} port=${s.optInt("port")} ")
          }
        }
      }
      if (summary.isNotEmpty()) {
        // Append summary to sanitized JSON
        return summary.toString() + " | " + root.toString().take(3000)
      }
      root.toString().take(3500)
    } catch (_: Throwable) {
      // Fallback: masque uuid/password par regex
      json.replace(Regex("\"(id|password)\"\\s*:\\s*\"[^\"]+\""), "\"\$1\":\"***REDACTED***\"").take(3500)
    }
  }
}
