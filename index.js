const binding = require('./binding')

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
