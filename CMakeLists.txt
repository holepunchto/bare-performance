cmake_minimum_required(VERSION 3.25)

find_package(cmake-bare REQUIRED PATHS node_modules/cmake-bare)

project(bare_performance C)

add_bare_module(bare_performance)

target_sources(
  ${bare_performance}
  PRIVATE
    binding.c
)
