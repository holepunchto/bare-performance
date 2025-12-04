#include <assert.h>
#include <bare.h>
#include <hdr/hdr_histogram.h>
#include <js.h>
#include <stdlib.h>
#include <uv.h>

typedef struct {
  struct hdr_histogram *histogram;

  uv_timer_t timer;

  uint32_t timer_timeout;

  js_env_t *env;
  js_ref_t *ctx;
  js_ref_t *on_timer_timeout;
} bare_performance_histogram_t;

static js_value_t *
bare_performance_now(js_env_t *env, js_callback_info_t *info) {
  int err;

  js_value_t *result;
  err = js_create_double(env, uv_hrtime(), &result);
  assert(err == 0);

  return result;
}

static double
bare_performance_now_typed(js_value_t *receiver, js_typed_callback_info_t *info) {
  return uv_hrtime();
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

static inline void
bare_performance__on_histogram_timer_timeout(uv_timer_t *handle) {
  int err = 0;

  bare_performance_histogram_t *histogram = handle->data;

  js_env_t *env = histogram->env;

  js_handle_scope_t *scope;
  err = js_open_handle_scope(env, &scope);
  assert(err == 0);

  js_value_t *ctx;
  err = js_get_reference_value(env, histogram->ctx, &ctx);
  assert(err == 0);

  js_value_t *on_timer_timeout;
  err = js_get_reference_value(env, histogram->on_timer_timeout, &on_timer_timeout);
  assert(err == 0);

  err = js_call_function(env, ctx, on_timer_timeout, 0, NULL, NULL);
  assert(err == 0);

  err = js_close_handle_scope(env, scope);
  assert(err == 0);
}

static js_value_t *
bare_performance_histogram_init(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 6;
  js_value_t *argv[6];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 6);

  js_value_t *handle;

  bare_performance_histogram_t *histogram;
  err = js_create_arraybuffer(env, sizeof(bare_performance_histogram_t), (void **) &histogram, &handle);

  histogram->env = env;

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

  uv_loop_t *loop;
  err = js_get_env_loop(env, &loop);
  assert(err == 0);

  err = uv_timer_init(loop, &histogram->timer);
  assert(err == 0);

  histogram->timer.data = (void *) histogram;

  uv_unref((uv_handle_t *) &histogram->timer);

  err = js_get_value_uint32(env, argv[4], &histogram->timer_timeout);
  assert(err == 0);

  err = js_create_reference(env, argv[5], 1, &histogram->on_timer_timeout);
  assert(err == 0);

  return handle;
}

static js_value_t *
bare_performance_histogram_percentiles(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_performance_histogram_t *histogram;
  err = js_get_arraybuffer_info(env, argv[0], (void **) &histogram, NULL);
  assert(err == 0);

  struct hdr_iter iter;
  hdr_iter_percentile_init(&iter, histogram->histogram, 1.0);

  js_value_t *result;
  err = js_create_array(env, &result);
  assert(err == 0);

  uint32_t i = 0;

  while (hdr_iter_next(&iter)) {
    js_value_t *pair;
    err = js_create_array_with_length(env, 2, &pair);
    assert(err == 0);

    js_value_t *key;
    err = js_create_double(env, iter.specifics.percentiles.percentile, &key);
    assert(err == 0);

    err = js_set_element(env, pair, 0, key);
    assert(err == 0);

    js_value_t *value;
    err = js_create_double(env, iter.value, &value);
    assert(err == 0);

    err = js_set_element(env, pair, 1, value);
    assert(err == 0);

    err = js_set_element(env, result, i++, pair);
    assert(err == 0);
  }

  return result;
}

static js_value_t *
bare_performance_histogram_percentile(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 2;
  js_value_t *argv[2];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 2);

  bare_performance_histogram_t *histogram;
  err = js_get_arraybuffer_info(env, argv[0], (void **) &histogram, NULL);
  assert(err == 0);

  double percentile;
  err = js_get_value_double(env, argv[1], &percentile);
  assert(err == 0);

  js_value_t *result;
  err = js_create_int64(env, hdr_value_at_percentile(histogram->histogram, percentile), &result);
  assert(err == 0);

  return result;
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
  err = js_create_double(env, hdr_mean(histogram->histogram), &result);
  assert(err == 0);

  return result;
}

static js_value_t *
bare_performance_histogram_stddev(js_env_t *env, js_callback_info_t *info) {
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
  err = js_create_double(env, hdr_stddev(histogram->histogram), &result);
  assert(err == 0);

  return result;
}

static js_value_t *
bare_performance_histogram_record(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 2;
  js_value_t *argv[2];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 2);

  bare_performance_histogram_t *histogram;
  err = js_get_arraybuffer_info(env, argv[0], (void **) &histogram, NULL);
  assert(err == 0);

  int64_t value;
  err = js_get_value_int64(env, argv[1], &value);
  assert(err == 0);

  js_value_t *result;
  err = js_get_boolean(env, hdr_record_value(histogram->histogram, value), &result);
  assert(err == 0);

  return result;
}

static js_value_t *
bare_performance_histogram_add(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 2;
  js_value_t *argv[2];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 2);

  bare_performance_histogram_t *histogram;
  err = js_get_arraybuffer_info(env, argv[0], (void **) &histogram, NULL);
  assert(err == 0);

  bare_performance_histogram_t *from;
  err = js_get_arraybuffer_info(env, argv[1], (void **) &from, NULL);
  assert(err == 0);

  hdr_add(histogram->histogram, from->histogram);

  return NULL;
}

static js_value_t *
bare_performance_histogram_timer_start(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_performance_histogram_t *histogram;
  err = js_get_arraybuffer_info(env, argv[0], (void **) &histogram, NULL);
  assert(err == 0);

  err = uv_timer_start(
    &histogram->timer,
    bare_performance__on_histogram_timer_timeout,
    (uint64_t) histogram->timer_timeout,
    (uint64_t) histogram->timer_timeout
  );
  assert(err == 0);

  return NULL;
}

static js_value_t *
bare_performance_histogram_timer_stop(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_performance_histogram_t *histogram;
  err = js_get_arraybuffer_info(env, argv[0], (void **) &histogram, NULL);
  assert(err == 0);

  err = uv_timer_stop(&histogram->timer);
  assert(err == 0);

  return NULL;
}

static js_value_t *
bare_performance_histogram_reset(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_performance_histogram_t *histogram;
  err = js_get_arraybuffer_info(env, argv[0], (void **) &histogram, NULL);
  assert(err == 0);

  hdr_reset(histogram->histogram);

  return NULL;
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
  V("histogramPercentiles", bare_performance_histogram_percentiles, NULL, NULL);
  V("histogramPercentile", bare_performance_histogram_percentile, NULL, NULL);
  V("histogramMin", bare_performance_histogram_min, NULL, NULL);
  V("histogramMax", bare_performance_histogram_max, NULL, NULL);
  V("histogramMean", bare_performance_histogram_mean, NULL, NULL);
  V("histogramStddev", bare_performance_histogram_stddev, NULL, NULL);
  V("histogramRecord", bare_performance_histogram_record, NULL, NULL);
  V("histogramAdd", bare_performance_histogram_add, NULL, NULL);
  V("histogramTimerStart", bare_performance_histogram_timer_start, NULL, NULL);
  V("histogramTimerStop", bare_performance_histogram_timer_stop, NULL, NULL);
  V("histogramReset", bare_performance_histogram_reset, NULL, NULL);
#undef V

  return exports;
}

BARE_MODULE(bare_performance, bare_performance_exports)
