# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# JNI symbols registered via RegisterNatives — restreint au package kighmu
-keepclasseswithmembernames class expo.modules.kighmuvpnnative.** {
    native <methods>;
}

# Expo modules: keep uniquement les entrypoints declares dans AndroidManifest (VpnService)
# Le reste (KighmuVpnNativeModule, TunnelProfile, OpolNative, etc.) est obfusque
-keep class com.facebook.react.turbomodule.core.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# Application module: keep public VpnService entrypoint but obfuscate internals
-keep class expo.modules.kighmuvpnnative.KighmuVpnService { *; }
-keep class expo.modules.kighmuvpnnative.KighmuVpnNativeModule { *; }

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

# Strip source file names and line numbers from stack traces (release)
-renamesourcefileattribute SourceFile
-keepattributes *Annotation*