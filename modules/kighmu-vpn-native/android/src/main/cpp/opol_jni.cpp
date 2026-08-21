#include <jni.h>

#include <string>

namespace {

jstring new_string(JNIEnv* env, const std::string& value) {
  return env->NewStringUTF(value.c_str());
}

static jstring native_build_xray_runtime_policy(JNIEnv* env, jobject, jint socks_port) {
  if (socks_port <= 0 || socks_port > 65535) return nullptr;

  // This policy mirrors the verified direct-Xray behavior from build #132.
  // It is intentionally limited to local runtime parameters; it never stores
  // profile credentials and it never launches or modifies libxray.so.
  const std::string policy = "{"
      "\"socksListen\":\"127.0.0.1\","
      "\"socksPort\":" + std::to_string(socks_port) + ","
      "\"logLevel\":\"warning\","
      "\"domainStrategy\":\"AsIs\","
      "\"allowInsecure\":true"
      "}";
  return new_string(env, policy);
}

static JNINativeMethod kMethods[] = {
    {const_cast<char*>("nativeBuildXrayRuntimePolicy"),
     const_cast<char*>("(I)Ljava/lang/String;"),
     reinterpret_cast<void*>(native_build_xray_runtime_policy)},
};

}  // namespace

extern "C" __attribute__((visibility("default"))) JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  JNIEnv* env = nullptr;
  if (vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK) return JNI_ERR;
  jclass bridge = env->FindClass("expo/modules/kighmuvpnnative/OpolNative");
  if (bridge == nullptr) return JNI_ERR;
  const jint result = env->RegisterNatives(bridge, kMethods, sizeof(kMethods) / sizeof(kMethods[0]));
  env->DeleteLocalRef(bridge);
  return result == JNI_OK ? JNI_VERSION_1_6 : JNI_ERR;
}
