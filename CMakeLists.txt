cmake_minimum_required(VERSION 4.0)

find_package(cmake-bare REQUIRED PATHS node_modules/cmake-bare)
find_package(cmake-fetch REQUIRED PATHS node_modules/cmake-fetch)

project(bare_performance C)

fetch_package(
  "github:madler/zlib@1.3.1"
  SOURCE_DIR zlib_SOURCE_DIR
  BINARY_DIR zlib_BINARY_DIR
)

set(ZLIB_INCLUDE_DIR ${zlib_SOURCE_DIR} ${zlib_BINARY_DIR})
set(ZLIB_LIBRARY $<TARGET_FILE:zlibstatic>)

add_library(ZLIB::ZLIB ALIAS zlibstatic)

set(HDR_HISTOGRAM_BUILD_PROGRAMS OFF)
set(HDR_HISTOGRAM_INSTALL_SHARED OFF)
set(HDR_HISTOGRAM_INSTALL_STATIC OFF)

fetch_package("github:HdrHistogram/HdrHistogram_c#0.11.9")

add_bare_module(bare_performance)

target_sources(
  ${bare_performance}
  PRIVATE
    binding.c
)

target_link_libraries(
  ${bare_performance}
  PRIVATE
    hdr_histogram_static
)
