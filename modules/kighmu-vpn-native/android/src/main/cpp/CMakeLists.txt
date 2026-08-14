cmake_minimum_required(VERSION 3.22.1)
project("zivpn_test_native")

add_library(hev_jni SHARED hev_jni.cpp)
target_compile_options(hev_jni PRIVATE -O2 -fvisibility=hidden)

if(ANDROID_ABI STREQUAL "armeabi-v7a")
  add_library(hev_core SHARED IMPORTED)
  set_target_properties(hev_core PROPERTIES
    IMPORTED_LOCATION "${CMAKE_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}/libhev-socks5-tunnel.so"
  )
  target_link_libraries(hev_jni hev_core log)
else()
  target_compile_definitions(hev_jni PRIVATE ZIVPN_UNSUPPORTED_ABI=1)
  target_link_libraries(hev_jni log)
endif()
