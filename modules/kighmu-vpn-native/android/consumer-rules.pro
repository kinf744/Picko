# sshlib (org.connectbot:sshlib) charge ses implémentations de chiffrement
# et de MAC par Class.forName(nom_en_chaine). L'obfuscation R8 casse ces
# références par chaîne -> "Cannot instantiate aesXXX" / "Fatal error during
# MAC startup". On préserve intégralement le package et les classes dérivées.
-keep class com.trilead.ssh2.** { *; }
-keep class com.trilead.ssh2.crypto.cipher.** { *; }
-keep class com.trilead.ssh2.crypto.digest.** { *; }
-keep class com.trilead.ssh2.crypto.dh.** { *; }
-keep class com.trilead.ssh2.crypto.keys.** { *; }
-keepclassmembers class * implements com.trilead.ssh2.crypto.BlockCipher { *; }

# BouncyCastle : provider de secours pour AES/Ed25519 sans restriction JCE.
-keep class org.bouncycastle.** { *; }
-keep class org.spongycastle.** { *; }

-dontwarn com.trilead.ssh2.**
-dontwarn org.bouncycastle.**
-dontwarn org.spongycastle.**
