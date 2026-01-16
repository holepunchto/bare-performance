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

typedef struct {
  js_ref_t *ctx;

  js_garbage_collection_type_t kind;
  uint64_t start_time;
  uint64_t duration;
} bare_performance_garbage_collection_entry_t;

typedef struct {
  js_garbage_collection_tracking_t garbage_collection_tracking;

  struct {
    uint64_t mark_compact;
    uint64_t generational;
  } start_time_per_type;

  js_threadsafe_function_t *on_new_entry;

  js_env_t *env;
  js_ref_t *ctx;
} bare_performance_garbage_collection_tracking_t;

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

static void
bare_performance_garbage_collection_tracking__on_new_entry(js_env_t *env, js_value_t *on_new_entry, void *context, void *data) {
  int err;

  bare_performance_garbage_collection_entry_t *entry = (bare_performance_garbage_collection_entry_t *) data;

  js_value_t *ctx;
  err = js_get_reference_value(env, entry->ctx, &ctx);
  assert(err == 0);

  js_value_t *args[3];

  err = js_create_double(env, entry->start_time / 1e6, &args[0]);
  assert(err == 0);

  err = js_create_double(env, entry->duration / 1e6, &args[1]);
  assert(err == 0);

  err = js_create_int32(env, entry->kind, &args[2]);
  assert(err == 0);

  free(entry);

  err = js_call_function(env, ctx, on_new_entry, 3, args, NULL);
  assert(err == 0);
}

static void
bare_performance_garbage_collection_tracking__on_end(js_garbage_collection_type_t type, void *data) {
  int err;

  uint64_t current_timestamp = uv_hrtime();

  bare_performance_garbage_collection_tracking_t *gc = (bare_performance_garbage_collection_tracking_t *) data;

  uint64_t start_time;
  if (type == js_garbage_collection_type_mark_compact) start_time = gc->start_time_per_type.mark_compact;
  else start_time = gc->start_time_per_type.generational;

  uint64_t duration = current_timestamp - start_time;

  bare_performance_garbage_collection_entry_t *entry = malloc(sizeof(bare_performance_garbage_collection_entry_t));

  entry->ctx = gc->ctx;
  entry->start_time = start_time;
  entry->duration = duration;
  entry->kind = type;

  err = js_call_threadsafe_function(gc->on_new_entry, entry, js_threadsafe_function_nonblocking);
  assert(err == 0);
}

static void
bare_performance_garbage_collection_tracking__on_start(js_garbage_collection_type_t type, void *data) {
  int err;

  uint64_t current_timestamp = uv_hrtime();

  bare_performance_garbage_collection_tracking_t *gc = (bare_performance_garbage_collection_tracking_t *) data;

  if (type == js_garbage_collection_type_mark_compact) gc->start_time_per_type.mark_compact = current_timestamp;
  else gc->start_time_per_type.generational = current_timestamp;
}

static js_value_t *
bare_performance_disable_garbage_collection_tracking(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_performance_garbage_collection_tracking_t *gc;
  err = js_get_arraybuffer_info(env, argv[0], (void **) &gc, NULL);
  assert(err == 0);

  err = js_disable_garbage_collection_tracking(env, &gc->garbage_collection_tracking);
  assert(err == 0);

  err = js_release_threadsafe_function(gc->on_new_entry, js_threadsafe_function_release);
  assert(err == 0);

  err = js_delete_reference(env, gc->ctx);
  assert(err == 0);

  return NULL;
}

static js_value_t *
bare_performance_enable_garbage_collection_tracking(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 2;
  js_value_t *argv[2];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 2);

  js_value_t *handle;

  bare_performance_garbage_collection_tracking_t *gc;
  err = js_create_arraybuffer(env, sizeof(bare_performance_garbage_collection_tracking_t), (void **) &gc, &handle);
  assert(err == 0);

  gc->env = env;
  gc->garbage_collection_tracking.start_cb = bare_performance_garbage_collection_tracking__on_start;
  gc->garbage_collection_tracking.end_cb = bare_performance_garbage_collection_tracking__on_end;

  err = js_create_reference(env, argv[0], 1, &gc->ctx);
  assert(err == 0);

  err = js_create_threadsafe_function(env, argv[1], 64, 1, NULL, NULL, NULL, bare_performance_garbage_collection_tracking__on_new_entry, &gc->on_new_entry);
  assert(err == 0);

  err = js_unref_threadsafe_function(env, gc->on_new_entry);
  assert(err == 0);

  err = js_enable_garbage_collection_tracking(env, &gc->garbage_collection_tracking, (void *) gc);
  assert(err == 0);

  return handle;
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
  V("histogramReset", bare_performance_histogram_reset, NULL, NULL);

  V("enableGarbageCollectionTracking", bare_performance_enable_garbage_collection_tracking, NULL, NULL);
  V("disableGarbageCollectionTracking", bare_performance_disable_garbage_collection_tracking, NULL, NULL);
#undef V

  js_value_t *constants;
  err = js_create_object(env, &constants);
  assert(err == 0);

  err = js_set_named_property(env, exports, "constants", constants);
  assert(err == 0);

#define V(name, n) \
  { \
    js_value_t *val; \
    err = js_create_uint32(env, n, &val); \
    assert(err == 0); \
    err = js_set_named_property(env, constants, name, val); \
    assert(err == 0); \
  }

  V("MARK_COMPACT", js_garbage_collection_type_mark_compact)
  V("GENERATIONAL", js_garbage_collection_type_generational)
#undef V

  return exports;
}

BARE_MODULE(bare_performance, bare_performance_exports)
