# Release hardening for Picko.
# R8 removes and obfuscates everything not explicitly required by the React Native,
# Expo and VPN native bridges.

# Expo module discovery and React Native code-generated views use runtime metadata.
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault,InnerClasses,EnclosingMethod,Signature
-keep class expo.modules.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.swmansion.reanimated.** { *; }

# Keep the Android VPN entry point, its Expo bridge and the JNI method signatures.
-keep class expo.modules.kighmuvpnnative.KighmuVpnNativeModule { *; }
-keep class expo.modules.kighmuvpnnative.KighmuVpnService { *; }
-keep class expo.modules.kighmuvpnnative.KighmuVpnNativeView { *; }
-keep class expo.modules.kighmuvpnnative.OpolNative {
    native <methods>;
}
-keepclasseswithmembernames class * {
    native <methods>;
}

# Native binaries are already stripped before packaging. Preserve their required
# Java-to-native entry points without retaining unrelated application code.
-keep class hev.htproxy.TProxyService { *; }

# Avoid embedding source file names or source line mappings in a release runtime.
-renamesourcefileattribute SourceFile
