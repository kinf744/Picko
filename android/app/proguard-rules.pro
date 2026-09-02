# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# JNI symbols registered via RegisterNatives
-keepclasseswithmembernames class * {
    native <methods>;
}

# Expo modules and React Native bridge (do not rename)
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class expo.modules.** { *; }

# Application module: keep public VpnService entrypoint but obfuscate internals
-keep class expo.modules.kighmuvpnnative.KighmuVpnService { *; }

# Use aggressive obfuscation everywhere else (default behaviour since R8 7+)
-repackageclasses ''
-allowaccessmodification

# Strip Log.* calls in release builds
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static int w(...);
    public static int e(...);
}

# Strip source file names and line numbers from stack traces
-renamesourcefileattribute SourceFile
-keepattributes SourceFile,LineNumberTable