const hrtime = require('bare-hrtime')
const binding = require('./binding')

const { BARE_START } = binding

exports.now = function now() {
  return nanoToMilli(hrtime.bigint() - BARE_START)
}

exports.eventLoopUtilization = function eventLoopUtilization(
  prevUtil,
  secUtil
) {
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
  return nanoToMilli(binding.idleTime())
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

function nanoToMilli(nano) {
  return Number(nano) / 1e6
}
