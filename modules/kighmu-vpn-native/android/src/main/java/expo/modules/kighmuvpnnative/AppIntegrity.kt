package expo.modules.kighmuvpnnative

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import java.security.MessageDigest

/**
 * Local anti-tampering control. It is deliberately fail-open for local/debug
 * builds and becomes mandatory only when CI provides both a release signer and
 * its expected public certificate SHA-256 fingerprint.
 */
internal object AppIntegrity {
  fun requireTrustedRelease(context: Context) {
    if (!BuildConfig.PICKO_INTEGRITY_ENFORCED) return

    val expected = BuildConfig.PICKO_RELEASE_CERT_SHA256
      .split(',')
      .map { it.filter(Char::isLetterOrDigit).uppercase() }
      .filter { it.isNotBlank() }
      .toSet()
    if (expected.isEmpty()) return

    val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      context.packageManager.getPackageInfo(
        context.packageName,
        PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()),
      )
    } else {
      @Suppress("DEPRECATION")
      context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
    }

    val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      packageInfo.signingInfo?.apkContentsSigners.orEmpty()
    } else {
      @Suppress("DEPRECATION")
      packageInfo.signatures.orEmpty()
    }

    val actual = signatures.map { signature ->
      MessageDigest.getInstance("SHA-256")
        .digest(signature.toByteArray())
        .joinToString(separator = "") { byte -> "%02X".format(byte) }
    }.toSet()

    check(actual.any { it in expected }) { "Validation de l’intégrité de l’application impossible" }
  }
}
