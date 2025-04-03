#include <assert.h>
#include <bare.h>
#include <js.h>
#include <stdlib.h>
#include <uv.h>

static js_value_t *
bare_performance_now(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  uint64_t origin;
  err = js_get_value_bigint_uint64(env, argv[0], &origin, NULL);
  assert(err == 0);

  js_value_t *result;
  err = js_create_double(env, (uv_hrtime() - origin) / 1e6, &result);
  assert(err == 0);

  return result;
}

static js_value_t *
bare_performance_idle_time(js_env_t *env, js_callback_info_t *info) {
  int err;

  uv_loop_t *loop;
  err = js_get_env_loop(env, &loop);
  assert(err == 0);

  js_value_t *result;
  err = js_create_double(env, uv_metrics_idle_time(loop) / 1e6, &result);
  assert(err == 0);

  return result;
}

static js_value_t *
bare_performance_metrics_info(js_env_t *env, js_callback_info_t *info) {
  int err;

  uv_loop_t *loop;
  err = js_get_env_loop(env, &loop);
  assert(err == 0);

  uv_metrics_t metrics;
  err = uv_metrics_info(loop, &metrics);
  assert(err == 0);

  js_value_t *result;
  err = js_create_object(env, &result);
  assert(err == 0);

#define V(name, property) \
  { \
    js_value_t *value; \
    err = js_create_int64(env, metrics.property, &value); \
    assert(err == 0); \
    err = js_set_named_property(env, result, name, value); \
    assert(err == 0); \
  }

  V("loopCount", loop_count)
  V("events", events)
  V("eventsWaiting", events_waiting)
#undef V

  return result;
}

static js_value_t *
bare_performance_exports(js_env_t *env, js_value_t *exports) {
  int err;

  uv_loop_t *loop;
  err = js_get_env_loop(env, &loop);
  assert(err == 0);

  err = uv_loop_configure(loop, UV_METRICS_IDLE_TIME);
  assert(err == 0);

  js_value_t *time_origin;
  err = js_create_bigint_uint64(env, uv_hrtime(), &time_origin);
  assert(err == 0);

  err = js_set_named_property(env, exports, "TIME_ORIGIN", time_origin);
  assert(err == 0);

  uv_timeval64_t tv;
  err = uv_gettimeofday(&tv);
  assert(err == 0);

  js_value_t *unix_time_origin;
  err = js_create_double(env, (1e6 * tv.tv_sec + tv.tv_usec) / 1e3, &unix_time_origin);

  err = js_set_named_property(env, exports, "UNIX_TIME_ORIGIN", unix_time_origin);
  assert(err == 0);

#define V(name, fn) \
  { \
    js_value_t *val; \
    err = js_create_function(env, name, -1, fn, NULL, &val); \
    assert(err == 0); \
    err = js_set_named_property(env, exports, name, val); \
    assert(err == 0); \
  }

  V("now", bare_performance_now)
  V("idleTime", bare_performance_idle_time)
  V("metricsInfo", bare_performance_metrics_info)
#undef V

  return exports;
}

BARE_MODULE(bare_performance, bare_performance_exports)
