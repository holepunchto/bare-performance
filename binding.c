#include <assert.h>
#include <bare.h>
#include <hdr/hdr_histogram.h>
#include <js.h>
#include <stdlib.h>
#include <uv.h>

typedef struct {
  js_ref_t *ctx;

  struct hdr_histogram *histogram;
} bare_performance_histogram_t;

static js_value_t *
bare_performance_now(js_env_t *env, js_callback_info_t *info) {
  int err;

  js_value_t *result;
  err = js_create_double(env, uv_hrtime() / 1e6, &result);
  assert(err == 0);

  return result;
}

static double
bare_performance_now_typed(js_value_t *receiver, js_typed_callback_info_t *info) {
  return uv_hrtime() / 1e6;
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

static double
bare_performance_idle_time_typed(js_value_t *receiver, js_typed_callback_info_t *info) {
  int err;

  js_env_t *env;
  err = js_get_typed_callback_info(info, &env, NULL);
  assert(err == 0);

  uv_loop_t *loop;
  err = js_get_env_loop(env, &loop);
  assert(err == 0);

  return uv_metrics_idle_time(loop) / 1e6;
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
bare_performance_histogram_init(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 4;
  js_value_t *argv[4];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 4);

  js_value_t *handle;

  bare_performance_histogram_t *histogram;
  err = js_create_arraybuffer(env, sizeof(bare_performance_histogram_t), (void **) &histogram, &handle);

  err = js_create_reference(env, argv[0], 1, &histogram->ctx);
  assert(err == 0);

  int64_t lowest;
  err = js_get_value_int64(env, argv[1], &lowest);
  assert(err == 0);

  int64_t highest;
  err = js_get_value_int64(env, argv[2], &highest);
  assert(err == 0);

  int64_t figures;
  err = js_get_value_int64(env, argv[3], &figures);
  assert(err == 0);

  err = hdr_init(lowest, highest, figures, &histogram->histogram);
  assert(err == 0);

  return handle;
}

static js_value_t *
bare_performance_histogram_min(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_performance_histogram_t *histogram;
  err = js_get_arraybuffer_info(env, argv[0], (void **) &histogram, NULL);
  assert(err == 0);

  js_value_t *result;
  err = js_create_int64(env, hdr_min(histogram->histogram), &result);
  assert(err == 0);

  return result;
}

static js_value_t *
bare_performance_histogram_max(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_performance_histogram_t *histogram;
  err = js_get_arraybuffer_info(env, argv[0], (void **) &histogram, NULL);
  assert(err == 0);

  js_value_t *result;
  err = js_create_int64(env, hdr_max(histogram->histogram), &result);
  assert(err == 0);

  return result;
}

static js_value_t *
bare_performance_histogram_mean(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_performance_histogram_t *histogram;
  err = js_get_arraybuffer_info(env, argv[0], (void **) &histogram, NULL);
  assert(err == 0);

  js_value_t *result;
  err = js_create_int64(env, hdr_mean(histogram->histogram), &result);
  assert(err == 0);

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
  err = js_create_double(env, uv_hrtime() / 1e6, &time_origin);
  assert(err == 0);

  err = js_set_named_property(env, exports, "TIME_ORIGIN", time_origin);
  assert(err == 0);

#define V(name, untyped, signature, typed) \
  { \
    js_value_t *val; \
    if (signature) { \
      err = js_create_typed_function(env, name, -1, untyped, signature, typed, NULL, &val); \
      assert(err == 0); \
    } else { \
      err = js_create_function(env, name, -1, untyped, NULL, &val); \
      assert(err == 0); \
    } \
    err = js_set_named_property(env, exports, name, val); \
    assert(err == 0); \
  }

  V(
    "now",
    bare_performance_now,
    &((js_callback_signature_t) {
      .version = 0,
      .result = js_float64,
      .args_len = 1,
      .args = (int[]) {
        js_object,
      },
    }),
    bare_performance_now_typed
  );

  V(
    "idleTime",
    bare_performance_idle_time,
    &((js_callback_signature_t) {
      .version = 0,
      .result = js_float64,
      .args_len = 1,
      .args = (int[]) {
        js_object,
      },
    }),
    bare_performance_idle_time_typed
  );

  V("metricsInfo", bare_performance_metrics_info, NULL, NULL);

  V("histogramInit", bare_performance_histogram_init, NULL, NULL);
  V("histogramMin", bare_performance_histogram_min, NULL, NULL);
  V("histogramMax", bare_performance_histogram_max, NULL, NULL);
  V("histogramMean", bare_performance_histogram_mean, NULL, NULL);
#undef V

  return exports;
}

BARE_MODULE(bare_performance, bare_performance_exports)
