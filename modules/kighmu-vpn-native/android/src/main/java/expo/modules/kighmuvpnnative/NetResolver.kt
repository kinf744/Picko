package expo.modules.kighmuvpnnative

import java.net.InetAddress

/**
 * Les binaires natifs Go (libuz_core, libdnstt, libhysteria) ne peuvent pas
 * résoudre de nom d'hôte sur Android (pas de /etc/resolv.conf). On résout donc
 * en amont côté JVM et on ne substitue le résultat que pour une IPv4 obtenue.
 * On renvoie l'hôte d'origine si l'entrée est déjà une IP ou si la résolution
 * échoue (le binaire garde alors son comportement normal).
 */
internal object NetResolver {
  private val IPV4 = Regex("^(\\d{1,3}\\.){3}\\d{1,3}$")

  fun resolveHost(host: String): String {
    val trimmed = host.trim()
    if (trimmed.isBlank() || IPV4.matches(trimmed)) return trimmed
    return try {
      val address = InetAddress.getByName(trimmed).hostAddress ?: trimmed
      if (IPV4.matches(address)) address else trimmed
    } catch (_: Throwable) {
      trimmed
    }
  }
}