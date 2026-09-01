# sshlib (org.connectbot:sshlib) charge ses implémentations de chiffrement
# et de MAC par Class.forName(nom_en_chaine). L'obfuscation R8 casse ces
# références par chaîne -> "Cannot instantiate aesXXX" / "Fatal error
# during MAC startup". On préserve intégralement le package et les classes
# dérivées.
-keep class com.trilead.ssh2.** { *; }
-keep class com.trilead.ssh2.crypto.cipher.** { *; }
-keep class com.trilead.ssh2.crypto.digest.** { *; }
-keep class com.trilead.ssh2.crypto.dh.** { *; }
-keep class com.trilead.ssh2.crypto.keys.** { *; }
-keepclassmembers class * implements com.trilead.ssh2.crypto.BlockCipher { *; }

# BouncyCastle : la base sshlib appelle Security.insertProviderAt(BouncyCastleProvider(), 1)
# et le provider instancie ses Cipher/MAC/KeyAgreement par réflexion au démarrage.
# On garde UNIQUEMENT ce qui est réellement chargé par réflexion, pas tout
# le package org.bouncycastle.** (qui apporte ~3 Mio de code mort : PQC,
# RSA, DSA, ChaCha20, Twofish, GOST, ASN.1 X.509 complet, etc.).
#
# Tout le reste est élagué par R8.
#
# Note de build : si R8 signale des NoSuchMethod/ClassNotFound à l'exécution
# (logcat [SSHBridge] / kighmu.txt [SSHDBG]), décommenter la ligne fautive
# pour élargir. Le probeCrypto() de SshTransportTunnels aide à diagnostiquer.

# 1. La classe provider elle-même (instanciée directement par Security.insertProviderAt).
-keep class org.bouncycastle.jce.provider.BouncyCastleProvider { *; }
-keep class org.bouncycastle.jce.provider.BouncyCastleProvider$* { *; }

# 2. Les Cipher/MAC/KeyAgreement/KeyPairGenerator/Signature chargés par réflexion
#    au démarrage du provider. Ce sont les vrais "front-ends" JCE de BC.
-keep class org.bouncycastle.jcajce.provider.symmetric.** { *; }
-keep class org.bouncycastle.jcajce.provider.digest.** { *; }
-keep class org.bouncycastle.jcajce.provider.asymmetric.** { *; }
-keep class org.bouncycastle.jcajce.provider.keystore.** { *; }
-keep class org.bouncycastle.jcajce.io.** { *; }
-keep class org.bouncycastle.jcajce.interfaces.** { *; }

# 3. ASN.1 : sshlib sérialise/désérialise les clés ECDSA, les paquets de
#    transport, les userAuth banner via BC. Tout ASN.1 doit être préservé.
-keep class org.bouncycastle.asn1.** { *; }

# 4. Math EC (courbes elliptiques : ECDSA host key, ECDH key exchange).
-keep class org.bouncycastle.math.ec.** { *; }
-keep class org.bouncycastle.math.raw.** { *; }
-keep class org.bouncycastle.math.field.** { *; }

# 5. Crypto core : sshlib appelle Cipher.getInstance("AES/CTR/..."), qui
#    résout via BC vers ces engines.
-keep class org.bouncycastle.crypto.** { *; }

# 6. Utilitaires utilisés par ASN.1 et EC (encoders hex/base64, BigIntegers).
-keep class org.bouncycastle.util.encoders.** { *; }
-keep class org.bouncycastle.util.Arrays { *; }
-keep class org.bouncycastle.util.Arrays$* { *; }
-keep class org.bouncycastle.util.BigIntegers { *; }
-keep class org.bouncycastle.util.BigIntegers$* { *; }
-keep class org.bouncycastle.util.Pack { *; }
-keep class org.bouncycastle.util.Strings { *; }
-keep class org.bouncycastle.util.Strings$* { *; }
-keep class org.bouncycastle.util.IPAddress { *; }

# 7. X.509 / PKCS10 / ECKey utilities (lecture host keys SSH).
-keep class org.bouncycastle.jce.X509LDAPCertStoreParameters { *; }
-keep class org.bouncycastle.jce.X509LDAPCertStoreParameters$* { *; }
-keep class org.bouncycastle.jce.PKCS10CertificationRequest { *; }
-keep class org.bouncycastle.jce.ECKeyUtil { *; }
-keep class org.bouncycastle.jce.ECKeyUtil$* { *; }
-keep class org.bouncycastle.jce.MultiCertStoreParameters { *; }
-keep class org.bouncycastle.jce.ECNamedCurveTable { *; }
-keep class org.bouncycastle.jce.PrincipalUtil { *; }
-keep class org.bouncycastle.jce.exception.** { *; }
-keep class org.bouncycastle.jce.spec.** { *; }
-keep class org.bouncycastle.jce.interfaces.** { *; }

# Spongycastle (jamais utilisé réellement, gardé pour silencier les warnings).
-keep class org.spongycastle.** { *; }

-dontwarn com.trilead.ssh2.**
-dontwarn org.bouncycastle.**
-dontwarn org.spongycastle.**
