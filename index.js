const binding = require('./binding')

exports.idleTime = function idleTime() {
  return binding.idleTime()
}

exports.metricsInfo = function metricsInfo() {
  return binding.metricsInfo()
}

// For node.js compatibility
exports.PerformanceNodeTiming = class PerformanceNodeTiming {
  get idleTime() {
    return exports.idleTime()
  }

  get uvMetricsInfo() {
    return exports.metricsInfo()
  }
}

// For node.js compatibility
exports.performance = { nodeTiming: new exports.PerformanceNodeTiming() }
