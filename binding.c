#include <assert.h>
#include <bare.h>
#include <js.h>
#include <stdlib.h>
#include <uv.h>

static js_value_t *
bare_performance_idle_time(js_env_t *env, js_callback_info_t *info) {
  int err;

  uv_loop_t *loop;
  err = js_get_env_loop(env, &loop);
  assert(err == 0);

  js_value_t *result;
  err = js_create_int64(env, uv_metrics_idle_time(loop), &result);
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

#define V(name, fn) \
  { \
    js_value_t *val; \
    err = js_create_function(env, name, -1, fn, NULL, &val); \
    assert(err == 0); \
    err = js_set_named_property(env, exports, name, val); \
    assert(err == 0); \
  }

  V("idleTime", bare_performance_idle_time)
  V("metricsInfo", bare_performance_metrics_info)
#undef V

  return exports;
}

BARE_MODULE(bare_performance, bare_performance_exports)
