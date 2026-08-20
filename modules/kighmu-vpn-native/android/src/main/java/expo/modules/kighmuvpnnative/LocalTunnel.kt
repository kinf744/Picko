package expo.modules.kighmuvpnnative

interface LocalTunnel {
  val label: String
  val socksPort: Int
  fun start()
  fun isHealthy(): Boolean
  fun stop()
}
