const { now, timeOrigin } = require('./lib/hr-time')
const {
  PerformanceEntry,
  PerformanceMark,
  PerformanceMeasure,
  PerformanceObserverEntryList,
  PerformanceObserver,
  mark,
  clearMarks,
  measure,
  clearMeasures,
  getEntries,
  getEntriesByName,
  getEntriesByType
} = require('./lib/timing')
const { RecordableHistogram, IntervalHistogram } = require('./lib/histogram')
const binding = require('./binding')

exports.now = now

exports.timeOrigin = timeOrigin

exports.eventLoopUtilization = function eventLoopUtilization(prevUtil, secUtil) {
  if (secUtil) {
    const idle = prevUtil.idle - secUtil.idle
    const active = prevUtil.active - secUtil.active
    return { idle, active, utilization: active / (idle + active) }
  }

  let idle = exports.idleTime()
  if (idle === 0) return { idle: 0, active: 0, utilization: 0 }

  let active = exports.now() - idle
  if (!prevUtil) return { idle, active, utilization: active / (idle + active) }

  idle = idle - prevUtil.idle
  active = active - prevUtil.active

  return { idle, active, utilization: active / (idle + active) }
}

exports.idleTime = function idleTime() {
  return binding.idleTime()
}

exports.metricsInfo = function metricsInfo() {
  return binding.metricsInfo()
}

// For Node.js compatibility
exports.performance = exports

// For Node.js compatibility
class PerformanceNodeTiming {
  get idleTime() {
    return exports.idleTime()
  }

  get uvMetricsInfo() {
    return exports.metricsInfo()
  }
}

// For Node.js compatibility
exports.nodeTiming = new PerformanceNodeTiming()

exports.PerformanceEntry = PerformanceEntry

exports.PerformanceMark = PerformanceMark

exports.PerformanceMeasure = PerformanceMeasure

exports.PerformanceObserverEntryList = PerformanceObserverEntryList

exports.PerformanceObserver = PerformanceObserver

exports.mark = mark

exports.clearMarks = clearMarks

exports.measure = measure

exports.clearMeasures = clearMeasures

exports.getEntries = getEntries

exports.getEntriesByName = getEntriesByName

exports.getEntriesByType = getEntriesByType

exports.createHistogram = function createHistogram(opts) {
  return new RecordableHistogram(opts)
}

exports.monitorEventLoopDelay = function monitorEventLoopDelay(opts) {
  return new IntervalHistogram(opts)
}
