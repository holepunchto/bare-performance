const hrtime = require('bare-hrtime')
const binding = require('./binding')

const { BARE_START } = binding

exports.now = function now() {
  return Number(hrtime.bigint() - BARE_START) / 1e6
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
