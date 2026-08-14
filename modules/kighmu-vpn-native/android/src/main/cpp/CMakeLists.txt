cmake_minimum_required(VERSION 3.22.1)
project("zivpn_test_native")

add_library(hev_jni SHARED hev_jni.cpp)
target_compile_options(hev_jni PRIVATE -O2 -fvisibility=hidden)

if(ANDROID_ABI STREQUAL "armeabi-v7a")
  add_library(tun2socks SHARED IMPORTED)
  set_target_properties(tun2socks PROPERTIES
    IMPORTED_LOCATION "${CMAKE_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}/libtun2socks.so"
  )
  target_link_libraries(hev_jni tun2socks log)
else()
  target_link_libraries(hev_jni log)
endif()
