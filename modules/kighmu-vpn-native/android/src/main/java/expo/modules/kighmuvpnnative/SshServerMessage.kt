package expo.modules.kighmuvpnnative

import com.trilead.ssh2.Connection

/**
 * Captures the optional post-authentication SSH greeting (MOTD/banner).
 * It is deliberately distinct from the SSH-2.0 protocol banner read by local bridges.
 */
object SshServerMessage {
  private const val MAXIMUM_LENGTH = 6_000
  private const val READ_WINDOW_MS = 2_400L
  private val ansiEscape = Regex("\\u001B(?:\\[[0-?]*[ -/]*[@-~]|\\][^\\u0007]*(?:\\u0007|\\u001B\\\\))")
  private val shellPrompt = Regex("(?m)^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+(?::[^\\s]+)?[#$>]\\s*$")

  fun capture(connection: Connection, emit: (String) -> Unit) {
    try {
      val session = connection.openSession()
      try {
        session.startShell()
        val input = session.stdout
        val content = StringBuilder()
        val deadline = System.currentTimeMillis() + READ_WINDOW_MS
        while (System.currentTimeMillis() < deadline && content.length < MAXIMUM_LENGTH) {
          val available = input.available()
          if (available > 0) {
            val buffer = ByteArray(minOf(available, 1024))
            val count = input.read(buffer)
            if (count > 0) content.append(String(buffer, 0, count, Charsets.UTF_8))
          } else {
            Thread.sleep(80)
          }
        }
        val message = content.toString()
          .replace(ansiEscape, "")
          .replace(Regex("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]"), "")
          .replace(shellPrompt, "")
          .trim()
          .take(MAXIMUM_LENGTH)
        if (message.isNotBlank()) emit(message)
      } finally {
        try { session.close() } catch (_: Throwable) {}
      }
    } catch (_: Throwable) {
      // A MOTD is optional and must never prevent an established SSH tunnel.
    }
  }
}
