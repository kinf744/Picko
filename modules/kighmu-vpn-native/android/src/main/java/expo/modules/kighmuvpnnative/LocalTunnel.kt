package expo.modules.kighmuvpnnative

interface LocalTunnel {
  val label: String
  val socksPort: Int
  fun start()
  fun isHealthy(): Boolean
  /** Indique qu’un tunnel est temporairement indisponible mais tente de se reconnecter. */
  fun isRecovering(): Boolean = false
  fun stop()
}
