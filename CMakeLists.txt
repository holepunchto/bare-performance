cmake_minimum_required(VERSION 3.25)

find_package(cmake-bare REQUIRED PATHS node_modules/cmake-bare)
find_package(cmake-fetch REQUIRED PATHS node_modules/cmake-fetch)

project(bare_performance C)

set(HDR_LOG_REQUIRED DISABLED)
set(HDR_HISTOGRAM_BUILD_PROGRAMS OFF)

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
