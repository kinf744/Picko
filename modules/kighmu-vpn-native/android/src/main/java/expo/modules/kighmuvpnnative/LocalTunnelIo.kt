package expo.modules.kighmuvpnnative

import java.io.InputStream
import java.io.OutputStream
import java.net.Socket

/**
 * Conservative tuning for localhost tunnel bridges only. It never changes a remote
 * tunnel protocol, profile secret, server address, or VPN routing decision.
 */
object LocalTunnelIo {
  const val BUFFER_SIZE = 64 * 1024
  const val HANDSHAKE_TIMEOUT_MS = 20_000
  private const val SOCKET_BUFFER_SIZE = 128 * 1024

  fun configure(socket: Socket, timeoutMs: Int = 0) {
    socket.tcpNoDelay = true
    socket.keepAlive = true
    socket.sendBufferSize = SOCKET_BUFFER_SIZE
    socket.receiveBufferSize = SOCKET_BUFFER_SIZE
    socket.soTimeout = timeoutMs
  }

  fun pipe(input: InputStream, output: OutputStream, isRunning: () -> Boolean) {
    val buffer = ByteArray(BUFFER_SIZE)
    try {
      while (isRunning()) {
        val count = input.read(buffer)
        if (count < 0) break
        output.write(buffer, 0, count)
      }
      output.flush()
    } catch (_: Throwable) {
      // Socket closure is the normal termination of a proxied stream.
    }
  }
}
