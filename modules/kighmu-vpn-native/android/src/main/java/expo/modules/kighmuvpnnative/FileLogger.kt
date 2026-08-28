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
  private const val MAX_SIZE_BYTES = 2L * 1024L * 1024L // 2 Mio max (réduit pour éviter verbeux)
  private const val KEEP_LINES_ON_CLEAN = 800
  private const val DEDUP_MS = 2000L
  private const val RATE_LIMIT_PER_SEC = 5
  @Volatile private var resolvedFile: File? = null
  private val lock = Any()
  private val tsFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.FRANCE)
  // Filtre anti-verbeux
  private val lastMsgByComponent = mutableMapOf<String, Pair<String, Long>>()
  private val timestampsByComponent = mutableMapOf<String, MutableList<Long>>()

  fun init(context: Context) { resolveFile(context) }

  private fun resolveFile(context: Context): File? {
    resolvedFile?.let { if (it.exists() || it.parentFile?.exists() == true) return it }
    synchronized(lock) {
      resolvedFile?.let { return it }
      // 1) Dossier Download public (visible dans Files/Download)
      try {
        @Suppress("DEPRECATION")
        val publicDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        if (publicDir != null) {
          if (!publicDir.exists()) publicDir.mkdirs()
          val candidate = File(publicDir, FILENAME)
          try {
            if (!candidate.exists()) candidate.createNewFile()
            if (candidate.canWrite()) {
              resolvedFile = candidate
              return candidate
            }
          } catch (_: Throwable) {}
        }
      } catch (_: Throwable) {}
      // 2) Fallback scoped (toujours writable, visible via Android/data)
      try {
        val scopedDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
          ?: context.getExternalFilesDir(null)
          ?: context.filesDir
        if (!scopedDir.exists()) scopedDir.mkdirs()
        val fallback = File(scopedDir, FILENAME)
        resolvedFile = fallback
        return fallback
      } catch (_: Throwable) {}
      return null
    }
  }

  fun getPath(context: Context): String? = resolveFile(context)?.absolutePath

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
    try {
      val file = resolveFile(context) ?: return
      synchronized(lock) {
        // Nettoyage fiable: si dépasse LIMITE, garde seulement 800 dernières lignes (évite verbeux infini)
        if (file.exists() && file.length() > MAX_SIZE_BYTES) {
          try {
            val lines = file.readLines()
            val keep = if (lines.size > KEEP_LINES_ON_CLEAN) lines.takeLast(KEEP_LINES_ON_CLEAN) else lines.takeLast((lines.size * 0.5).toInt())
            val ts = tsFormat.format(Date())
            file.writeText(keep.joinToString("\n") + "\n")
            file.appendText("[$ts] [SYSTEM] Nettoyage auto: limite ${MAX_SIZE_BYTES/1024}Ko atteinte, garde ${keep.size} dernières lignes\n", Charsets.UTF_8)
          } catch (_: Throwable) {
            try { file.writeText("") } catch (_: Throwable) {}
          }
        }
        val ts = tsFormat.format(Date())
        val line = "[$ts] [$component] $message\n"
        file.appendText(line, Charsets.UTF_8)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && file.absolutePath.contains(Environment.DIRECTORY_DOWNLOADS)) {
          try { file.setLastModified(System.currentTimeMillis()) } catch (_: Throwable) {}
        }
      }
    } catch (_: Throwable) {}
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
      val file = resolveFile(context) ?: return
      synchronized(lock) {
        // Vérifie limite avant header
        if (file.exists() && file.length() > MAX_SIZE_BYTES) {
          try {
            val lines = file.readLines()
            val keep = lines.takeLast(KEEP_LINES_ON_CLEAN)
            file.writeText(keep.joinToString("\n") + "\n")
          } catch (_: Throwable) { try { file.writeText("") } catch (_: Throwable) {} }
        }
        val ts = tsFormat.format(Date())
        val header = buildString {
          appendLine("========================================")
          appendLine("[$ts] KIGHMU VPN — V2Ray DNS DIAGNOSTIC")
          appendLine("Profil: ${profile.name} (${profile.id}) method=${profile.method} xrayMode=${profile.xrayMode}")
          appendLine("Download: ${file.absolutePath}")
          appendLine("Android SDK: ${Build.VERSION.SDK_INT} Model: ${Build.MODEL}")
          appendLine("Heure: $ts")
          appendLine("========================================")
        }
        file.appendText(header, Charsets.UTF_8)
      }
    } catch (_: Throwable) {}
  }

  fun clear(context: Context) {
    try {
      val file = resolveFile(context) ?: return
      synchronized(lock) {
        file.writeText("")
        lastMsgByComponent.clear()
        timestampsByComponent.clear()
      }
    } catch (_: Throwable) {}
  }

  /** Journalise JSON Xray en masquant secrets mais en gardant protocole/transport pour debug Trojan/VMess */
  fun logXrayJson(context: Context, component: String, json: String) {
    try {
      val sanitized = sanitizeXrayJson(json)
      log(context, component, "CONFIG Xray (sanitized): $sanitized")
      // Log brut tronqué pour analyse approfondie (secrets remplacés)
      if (json.length > 4000) {
        log(context, component, "CONFIG Xray brut tronqué: ${json.take(4000)} ... [${json.length} chars]")
      }
    } catch (_: Throwable) {
      log(context, component, "CONFIG Xray (raw): ${json.take(2000)}")
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
