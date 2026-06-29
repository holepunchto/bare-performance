const { now, timeOrigin } = require('./lib/hr-time')
const {
  PerformanceEntry,
  PerformanceMark,
  PerformanceMeasure,
  PerformanceObserver,
  PerformanceObserverEntryList,
  PerformanceResourceTiming,
  clearMarks,
  clearMeasures,
  clearResourceTimings,
  getEntries,
  getEntriesByName,
  getEntriesByType,
  mark,
  markResourceTiming,
  measure,
  setResourceTimingBufferSize,
  _registerEventHandler
} = require('./lib/timing')
const { RecordableHistogram, IntervalHistogram } = require('./lib/histogram')
const { Event, EventTarget } = require('bare-events/web')
const binding = require('./binding')

class Performance extends EventTarget {
  constructor() {
    super()

    _registerEventHandler((eventName) => {
      this.dispatchEvent(new Event(eventName))
    })
  }

  get timeOrigin() {
    return timeOrigin
  }

  // For Node.js compatibility
  get nodeTiming() {
    return new PerformanceNodeTiming()
  }

  now() {
    return now()
  }

  getEntries() {
    return getEntries()
  }

  getEntriesByName(name) {
    return getEntriesByName(name)
  }

  getEntriesByType(type) {
    return getEntriesByType(type)
  }

  mark(name, opts) {
    return mark(name, opts)
  }

  markResourceTiming(
    timingInfo,
    requestedUrl,
    initiatorType,
    global,
    cacheMode,
    bodyInfo,
    responseStatus,
    deliveryType
  ) {
    return markResourceTiming(
      timingInfo,
      requestedUrl,
      initiatorType,
      global,
      cacheMode,
      bodyInfo,
      responseStatus,
      deliveryType
    )
  }

  measure(name, start, end) {
    return measure(name, start, end)
  }

  clearMarks(name) {
    clearMarks(name)
  }

  clearMeasures(name) {
    clearMeasures(name)
  }

  clearResourceTimings(name) {
    clearResourceTimings(name)
  }

  setResourceTimingBufferSize(maxSize) {
    setResourceTimingBufferSize(maxSize)
  }

  eventLoopUtilization(prevUtil, secUtil) {
    return exports.eventLoopUtilization(prevUtil, secUtil)
  }
}

exports.performance = new Performance()

exports.idleTime = function idleTime() {
  return binding.idleTime()
}

exports.metricsInfo = function metricsInfo() {
  return binding.metricsInfo()
}

// For Node.js compatibility
class PerformanceNodeTiming {
  get idleTime() {
    return exports.idleTime()
  }

  get uvMetricsInfo() {
    return exports.metricsInfo()
  }
}

exports.PerformanceEntry = PerformanceEntry
exports.PerformanceResourceTiming = PerformanceResourceTiming
exports.PerformanceMark = PerformanceMark
exports.PerformanceMeasure = PerformanceMeasure
exports.PerformanceObserverEntryList = PerformanceObserverEntryList
exports.PerformanceObserver = PerformanceObserver

exports.eventLoopUtilization = function eventLoopUtilization(prevUtil, secUtil) {
  if (secUtil) {
    const idle = prevUtil.idle - secUtil.idle
    const active = prevUtil.active - secUtil.active
    return { idle, active, utilization: active / (idle + active) }
  }

  let idle = exports.idleTime()
  if (idle === 0) return { idle: 0, active: 0, utilization: 0 }

  let active = now() - idle
  if (!prevUtil) return { idle, active, utilization: active / (idle + active) }

  idle = idle - prevUtil.idle
  active = active - prevUtil.active

  return { idle, active, utilization: active / (idle + active) }
}

exports.createHistogram = function createHistogram(opts) {
  return new RecordableHistogram(opts)
}

exports.monitorEventLoopDelay = function monitorEventLoopDelay(opts) {
  return new IntervalHistogram(opts)
}

// For Node.js compatibility
exports.constants = {
  NODE_PERFORMANCE_GC_MAJOR: binding.constants.MARK_COMPACT,
  NODE_PERFORMANCE_GC_MINOR: binding.constants.GENERATIONAL,
  NODE_PERFORMANCE_GC_INCREMENTAL: -1,
  NODE_PERFORMANCE_GC_WEAKCB: -1
}
