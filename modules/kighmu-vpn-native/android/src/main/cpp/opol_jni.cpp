#include <jni.h>

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <string>

namespace {

std::string get_utf(JNIEnv* env, jstring value) {
  if (value == nullptr) return {};
  const char* chars = env->GetStringUTFChars(value, nullptr);
  if (chars == nullptr) return {};
  std::string result(chars);
  env->ReleaseStringUTFChars(value, chars);
  return result;
}

jstring new_string(JNIEnv* env, const std::string& value) {
  return env->NewStringUTF(value.c_str());
}

std::string json_quote(const std::string& value) {
  std::string quoted;
  quoted.reserve(value.size() + 2);
  quoted.push_back('"');
  for (const unsigned char character : value) {
    switch (character) {
      case '"': quoted += "\\\""; break;
      case '\\': quoted += "\\\\"; break;
      case '\b': quoted += "\\b"; break;
      case '\f': quoted += "\\f"; break;
      case '\n': quoted += "\\n"; break;
      case '\r': quoted += "\\r"; break;
      case '\t': quoted += "\\t"; break;
      default:
        if (character < 0x20) {
          static constexpr char hex[] = "0123456789abcdef";
          quoted += "\\u00";
          quoted.push_back(hex[(character >> 4) & 0x0f]);
          quoted.push_back(hex[character & 0x0f]);
        } else {
          quoted.push_back(static_cast<char>(character));
        }
    }
  }
  quoted.push_back('"');
  return quoted;
}

std::string zivpn_obfs() {
  constexpr std::uint8_t encoded[] = {0x3f, 0x22, 0x37, 0x37, 0x3f, 0x26, 0x35, 0x37, 0x3c};
  constexpr std::uint8_t mask[] = {0x57, 0x57, 0x57, 0x57, 0x57, 0x57, 0x57, 0x57, 0x57};
  std::string result;
  result.reserve(sizeof(encoded));
  for (std::size_t index = 0; index < sizeof(encoded); ++index) {
    result.push_back(static_cast<char>(encoded[index] ^ mask[index]));
  }
  return result;
}

std::string lowercase(std::string value) {
  std::transform(value.begin(), value.end(), value.begin(), [](unsigned char character) {
    return static_cast<char>(std::tolower(character));
  });
  return value;
}

void replace_case_insensitive(std::string& source, const std::string& token, const std::string& replacement) {
  if (token.empty()) return;
  const std::string lowered_token = lowercase(token);
  std::string lowered_source = lowercase(source);
  std::size_t offset = 0;
  while ((offset = lowered_source.find(lowered_token, offset)) != std::string::npos) {
    source.replace(offset, token.size(), replacement);
    lowered_source.replace(offset, token.size(), replacement);
    offset += replacement.size();
  }
}

std::string expand_http_payload(std::string payload, const std::string& ssh_host, const std::string& ssh_port,
                                const std::string& proxy_host, const std::string& proxy_port) {
  replace_case_insensitive(payload, "[host]", ssh_host);
  replace_case_insensitive(payload, "[real_host]", ssh_host);
  replace_case_insensitive(payload, "[port]", ssh_port);
  replace_case_insensitive(payload, "[proxy_host]", proxy_host);
  replace_case_insensitive(payload, "[proxy_port]", proxy_port);
  replace_case_insensitive(payload, "[crlf]", "\r\n");
  replace_case_insensitive(payload, "[cr]", "\r");
  replace_case_insensitive(payload, "[lf]", "\n");
  std::size_t position = 0;
  while ((position = payload.find("\\r\\n", position)) != std::string::npos) payload.replace(position, 4, "\r\n");
  position = 0;
  while ((position = payload.find("\\r", position)) != std::string::npos) payload.replace(position, 2, "\r");
  position = 0;
  while ((position = payload.find("\\n", position)) != std::string::npos) payload.replace(position, 2, "\n");
  return payload;
}

static jstring native_zivpn_obfs(JNIEnv* env, jobject) {
  return new_string(env, zivpn_obfs());
}

static jstring native_build_zivpn_config(JNIEnv* env, jobject, jstring host, jstring port, jstring password, jint socks_port) {
  const std::string server = get_utf(env, host) + ":" + get_utf(env, port);
  const std::string config = "{"
      "\"server\":" + json_quote(server) + ","
      "\"obfs\":" + json_quote(zivpn_obfs()) + ","
      "\"auth\":" + json_quote(get_utf(env, password)) + ","
      "\"socks5\":{\"listen\":" + json_quote("127.0.0.1:" + std::to_string(socks_port)) + "},"
      "\"insecure\":true,\"recvwindowconn\":65536,\"recvwindow\":262144,\"disable_mtu_discovery\":true"
      "}";
  return new_string(env, config);
}

static jstring native_build_hysteria_config(JNIEnv* env, jobject, jstring host, jstring port, jstring auth,
                                            jstring up_mbps, jstring down_mbps, jstring obfs, jint socks_port) {
  const std::string obfs_value = get_utf(env, obfs);
  std::string config = "{"
      "\"server\":" + json_quote(get_utf(env, host) + ":" + get_utf(env, port)) + ","
      "\"auth_str\":" + json_quote(get_utf(env, auth)) + ","
      "\"up_mbps\":" + get_utf(env, up_mbps) + ","
      "\"down_mbps\":" + get_utf(env, down_mbps) + ","
      "\"retry\":3,\"retry_interval\":1,\"insecure\":true,"
      "\"recv_window_conn\":4194304,\"recv_window\":16777216,"
      "\"socks5\":{\"listen\":" + json_quote("127.0.0.1:" + std::to_string(socks_port)) + "}";
  if (!obfs_value.empty()) config += ",\"obfs\":" + json_quote(obfs_value);
  config += "}";
  return new_string(env, config);
}

static jstring native_build_dnstt_plan(JNIEnv* env, jobject, jstring dns_server, jstring dns_port,
                                       jstring public_key, jstring nameserver, jint local_port) {
  const std::string plan = "{"
      "\"resolver\":" + json_quote(get_utf(env, dns_server) + ":" + get_utf(env, dns_port)) + ","
      "\"publicKey\":" + json_quote(get_utf(env, public_key)) + ","
      "\"nameserver\":" + json_quote(get_utf(env, nameserver)) + ","
      "\"localEndpoint\":" + json_quote("127.0.0.1:" + std::to_string(local_port)) + "}";
  return new_string(env, plan);
}

static jstring native_expand_http_payload(JNIEnv* env, jobject, jstring payload, jstring ssh_host,
                                          jstring ssh_port, jstring proxy_host, jstring proxy_port) {
  return new_string(env, expand_http_payload(get_utf(env, payload), get_utf(env, ssh_host),
                                               get_utf(env, ssh_port), get_utf(env, proxy_host),
                                               get_utf(env, proxy_port)));
}

static jstring native_build_tls_policy(JNIEnv* env, jobject, jstring ssh_host, jstring sni, jstring tls_version) {
  const std::string host = get_utf(env, ssh_host);
  const std::string version = get_utf(env, tls_version);
  const std::string policy = "{"
      "\"host\":" + json_quote(host) + ","
      "\"sni\":" + json_quote(get_utf(env, sni)) + ","
      "\"tlsVersion\":" + json_quote(version.empty() ? "TLS" : version) + "}";
  return new_string(env, policy);
}

static jstring native_build_xray_runtime_policy(JNIEnv* env, jobject, jint socks_port, jint dnstt_port,
                                                jboolean via_dnstt) {
  const std::string policy = "{"
      "\"socksListen\":\"127.0.0.1\","
      "\"socksPort\":" + std::to_string(socks_port) + ","
      "\"dnsttPort\":" + std::to_string(dnstt_port) + ","
      "\"viaDnstt\":" + std::string(via_dnstt == JNI_TRUE ? "true" : "false") + ","
      "\"logLevel\":\"warning\"}";
  return new_string(env, policy);
}

static JNINativeMethod kMethods[] = {
    {const_cast<char*>("nativeZiVpnObfs"), const_cast<char*>("()Ljava/lang/String;"), reinterpret_cast<void*>(native_zivpn_obfs)},
    {const_cast<char*>("nativeBuildZiVpnConfig"), const_cast<char*>("(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;I)Ljava/lang/String;"), reinterpret_cast<void*>(native_build_zivpn_config)},
    {const_cast<char*>("nativeBuildHysteriaConfig"), const_cast<char*>("(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;I)Ljava/lang/String;"), reinterpret_cast<void*>(native_build_hysteria_config)},
    {const_cast<char*>("nativeBuildDnsttPlan"), const_cast<char*>("(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;I)Ljava/lang/String;"), reinterpret_cast<void*>(native_build_dnstt_plan)},
    {const_cast<char*>("nativeExpandHttpPayload"), const_cast<char*>("(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;"), reinterpret_cast<void*>(native_expand_http_payload)},
    {const_cast<char*>("nativeBuildTlsPolicy"), const_cast<char*>("(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;"), reinterpret_cast<void*>(native_build_tls_policy)},
    {const_cast<char*>("nativeBuildXrayRuntimePolicy"), const_cast<char*>("(IIZ)Ljava/lang/String;"), reinterpret_cast<void*>(native_build_xray_runtime_policy)},
};

}  // namespace

extern "C" JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  JNIEnv* env = nullptr;
  if (vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK) return JNI_ERR;
  jclass bridge = env->FindClass("expo/modules/kighmuvpnnative/OpolNative");
  if (bridge == nullptr) return JNI_ERR;
  const jint result = env->RegisterNatives(bridge, kMethods, sizeof(kMethods) / sizeof(kMethods[0]));
  env->DeleteLocalRef(bridge);
  return result == JNI_OK ? JNI_VERSION_1_6 : JNI_ERR;
}
