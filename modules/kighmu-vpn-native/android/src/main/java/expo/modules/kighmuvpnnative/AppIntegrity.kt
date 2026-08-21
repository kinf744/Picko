package expo.modules.kighmuvpnnative

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build
import java.security.MessageDigest

/**
 * Local anti-tampering control. It is deliberately fail-open for local/debug
 * builds and becomes mandatory only when CI provides a release certificate
 * fingerprint. Every Android version supported by Picko uses its matching
 * PackageManager signature API.
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

    val actual = signingCertificates(context).map { signature ->
      MessageDigest.getInstance("SHA-256")
        .digest(signature.toByteArray())
        .joinToString(separator = "") { byte -> "%02X".format(byte) }
    }.toSet()

    check(actual.any { it in expected }) { "Validation de l’intégrité de l’application impossible" }
  }

  private fun signingCertificates(context: Context): Array<Signature> {
    val packageManager = context.packageManager
    val packageInfo: PackageInfo = when {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> packageManager.getPackageInfo(
        context.packageName,
        PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()),
      )
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.P -> {
        @Suppress("DEPRECATION")
        packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
      }
      else -> {
        @Suppress("DEPRECATION")
        packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
      }
    }

    val signatures: Array<Signature> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      packageInfo.signingInfo?.apkContentsSigners?.copyOf() ?: emptyArray()
    } else {
      @Suppress("DEPRECATION")
      packageInfo.signatures?.copyOf() ?: emptyArray()
    }
    return signatures
  }
}
