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
  registerEventHandler
} = require('./lib/timing')
const { RecordableHistogram, IntervalHistogram } = require('./lib/histogram')
const { Event, EventTarget } = require('bare-events/web')
const binding = require('./binding')

// For Node.js compatibility
class PerformanceNodeTiming {
  get idleTime() {
    return module.exports.idleTime()
  }

  get uvMetricsInfo() {
    return module.exports.metricsInfo()
  }
}

const nodeTiming = new PerformanceNodeTiming()

class Performance extends EventTarget {
  constructor() {
    super()

    registerEventHandler((eventName) => {
      this.dispatchEvent(new Event(eventName))
    })
  }

  // For Node.js compatibility
  get performance() {
    return this
  }

  // For Node.js compatibility
  get nodeTiming() {
    return nodeTiming
  }

  get PerformanceEntry() {
    return PerformanceEntry
  }

  get PerformanceMark() {
    return PerformanceMark
  }

  get PerformanceMeasure() {
    return PerformanceMeasure
  }

  // For Node.js compatibility
  get PerformanceNodeTiming() {
    return PerformanceNodeTiming
  }

  get PerformanceResourceTiming() {
    return PerformanceResourceTiming
  }

  get PerformanceObserver() {
    return PerformanceObserver
  }

  get PerformanceObserverEntryList() {
    return PerformanceObserverEntryList
  }

  get timeOrigin() {
    return timeOrigin
  }

  // For Node.js compatibility
  get constants() {
    return {
      NODE_PERFORMANCE_GC_MAJOR: binding.constants.MARK_COMPACT,
      NODE_PERFORMANCE_GC_MINOR: binding.constants.GENERATIONAL,
      NODE_PERFORMANCE_GC_INCREMENTAL: -1,
      NODE_PERFORMANCE_GC_WEAKCB: -1
    }
  }

  now() {
    return now()
  }

  eventLoopUtilization(prevUtil, secUtil) {
    if (secUtil) {
      const idle = prevUtil.idle - secUtil.idle
      const active = prevUtil.active - secUtil.active
      return { idle, active, utilization: active / (idle + active) }
    }

    let idle = this.idleTime()
    if (idle === 0) return { idle: 0, active: 0, utilization: 0 }

    let active = now() - idle
    if (!prevUtil) return { idle, active, utilization: active / (idle + active) }

    idle = idle - prevUtil.idle
    active = active - prevUtil.active

    return { idle, active, utilization: active / (idle + active) }
  }

  idleTime() {
    return binding.idleTime()
  }

  metricsInfo() {
    return binding.metricsInfo()
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

  measure(name, start, end) {
    return measure(name, start, end)
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

  createHistogram(opts) {
    return new RecordableHistogram(opts)
  }

  monitorEventLoopDelay(opts) {
    return new IntervalHistogram(opts)
  }
}

module.exports = new Performance()
