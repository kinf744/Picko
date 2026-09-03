package expo.modules.kighmuvpnnative

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Chiffrement AES/GCM via AndroidKeyStore (sans dépendance tink).
 * Clé matérielle AES-256 GCM, IV 12 octets aléatoire préfixé au ciphertext.
 * Fallback clair si KeyStore indisponible (émulateur ancien, test) — l'appelant gère.
 */
object CryptoPrefs {
  private const val ANDROID_KEYSTORE = "AndroidKeyStore"
  private const val ALIAS = "KighmuMasterKey_v1"
  private const val TRANSFORMATION = "AES/GCM/NoPadding"
  private const val GCM_TAG_BITS = 128
  private const val IV_LEN = 12

  private fun getOrCreateKey(): SecretKey {
    val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
    val spec = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .setRandomizedEncryptionRequired(true)
      .apply {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) setIsStrongBoxBacked(false)
      }
      .build()
    kg.init(spec)
    return kg.generateKey()
  }

  fun encrypt(plain: String): String {
    val key = getOrCreateKey()
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, key)
    val iv = cipher.iv // 12 octets aléatoires
    require(iv.size == IV_LEN) { "IV inattendu ${iv.size}" }
    val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
    val combined = ByteArray(IV_LEN + ct.size)
    System.arraycopy(iv, 0, combined, 0, IV_LEN)
    System.arraycopy(ct, 0, combined, IV_LEN, ct.size)
    return Base64.encodeToString(combined, Base64.NO_WRAP)
  }

  fun decrypt(b64: String): String {
    val combined = Base64.decode(b64, Base64.NO_WRAP)
    require(combined.size > IV_LEN) { "ciphertext trop court" }
    val iv = combined.copyOfRange(0, IV_LEN)
    val ct = combined.copyOfRange(IV_LEN, combined.size)
    val key = getOrCreateKey()
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, iv))
    val pt = cipher.doFinal(ct)
    return String(pt, Charsets.UTF_8)
  }
}