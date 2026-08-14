#include <jni.h>
#include <android/log.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <pthread.h>

#define TAG "HevJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

#if defined(__arm__)
extern "C" {
int hev_socks5_tunnel_main_from_str(const char* config_str, int tun_fd);
void hev_socks5_tunnel_quit(void);
}

struct TunnelArgs {
  char* config;
  int fd;
};

static pthread_t g_thread = 0;
static int g_running = 0;

static void* tunnel_thread(void* raw) {
  auto* args = static_cast<TunnelArgs*>(raw);
  LOGI("ZIVPN TUN relay start fd=%d", args->fd);
  const int result = hev_socks5_tunnel_main_from_str(args->config, args->fd);
  LOGI("ZIVPN TUN relay exit result=%d", result);
  std::free(args->config);
  std::free(args);
  g_running = 0;
  return nullptr;
}

extern "C" JNIEXPORT void JNICALL
Java_hev_htproxy_TProxyService_TProxyStartService(
    JNIEnv* env, jclass, jstring config_path, jint fd) {
  if (g_running) {
    hev_socks5_tunnel_quit();
    if (g_thread) {
      pthread_join(g_thread, nullptr);
      g_thread = 0;
    }
    g_running = 0;
  }

  const char* path = env->GetStringUTFChars(config_path, nullptr);
  FILE* file = std::fopen(path, "rb");
  env->ReleaseStringUTFChars(config_path, path);
  if (!file) {
    LOGE("Unable to open ZIVPN relay configuration");
    return;
  }

  std::fseek(file, 0, SEEK_END);
  const long size = std::ftell(file);
  std::rewind(file);
  if (size <= 0) {
    std::fclose(file);
    LOGE("Empty ZIVPN relay configuration");
    return;
  }

  auto* config = static_cast<char*>(std::malloc(static_cast<size_t>(size) + 1));
  if (!config) {
    std::fclose(file);
    LOGE("Unable to allocate ZIVPN relay configuration");
    return;
  }
  const size_t read = std::fread(config, 1, static_cast<size_t>(size), file);
  std::fclose(file);
  config[read] = '\0';

  auto* args = static_cast<TunnelArgs*>(std::malloc(sizeof(TunnelArgs)));
  if (!args) {
    std::free(config);
    LOGE("Unable to allocate ZIVPN relay arguments");
    return;
  }
  args->config = config;
  args->fd = static_cast<int>(fd);

  g_running = 1;
  if (pthread_create(&g_thread, nullptr, tunnel_thread, args) != 0) {
    g_running = 0;
    std::free(config);
    std::free(args);
    LOGE("Unable to start ZIVPN relay thread");
    return;
  }
  LOGI("ZIVPN relay thread started fd=%d", static_cast<int>(fd));
}

extern "C" JNIEXPORT void JNICALL
Java_hev_htproxy_TProxyService_TProxyStopService(JNIEnv*, jclass) {
  LOGI("ZIVPN relay stop requested");
  if (g_running) {
    hev_socks5_tunnel_quit();
    if (g_thread) {
      pthread_join(g_thread, nullptr);
      g_thread = 0;
    }
    g_running = 0;
  }
}

#else
extern "C" JNIEXPORT void JNICALL
Java_hev_htproxy_TProxyService_TProxyStartService(JNIEnv*, jclass, jstring, jint) {
  LOGE("ZIVPN relay is supported only on armeabi-v7a in this test APK");
}
extern "C" JNIEXPORT void JNICALL
Java_hev_htproxy_TProxyService_TProxyStopService(JNIEnv*, jclass) {
  LOGE("ZIVPN relay stop is supported only on armeabi-v7a in this test APK");
}
#endif

extern "C" JNIEXPORT jlongArray JNICALL
Java_hev_htproxy_TProxyService_TProxyGetStats(JNIEnv* env, jclass) {
  jlongArray result = env->NewLongArray(2);
  const jlong values[2] = {0, 0};
  env->SetLongArrayRegion(result, 0, 2, values);
  return result;
}
