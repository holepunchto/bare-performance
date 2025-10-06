const { observerType } = require('./lib/constants')
const { InvalidModificationError } = require('./lib/errors')
const binding = require('./binding')

const { TIME_ORIGIN } = binding

exports.now = function now() {
  return binding.now() - TIME_ORIGIN
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
  return binding.idleTime()
}

exports.metricsInfo = function metricsInfo() {
  return binding.metricsInfo()
}

exports.timeOrigin = TIME_ORIGIN

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

// Performance Timeline globals
const globalObservers = new Set()
const globalPendingObservers = new Set()
let globalBuffer = []
let pending = false

const PerformanceEntry = class PerformanceEntry {
  constructor(name, type, start, duration) {
    this._name = name
    this._type = type
    this._start = start
    this._duration = duration
  }

  get name() {
    return this._name
  }

  get entryType() {
    return this._type
  }

  get startTime() {
    return this._start
  }

  get duration() {
    return this._duration
  }
}

exports.PerformanceEntry = PerformanceEntry

class PerformanceMark extends PerformanceEntry {
  constructor(name, opts = {}) {
    const { startTime = exports.now(), detail = null } = opts

    super(name, 'mark', startTime, 0)

    this._detail = detail
  }

  get detail() {
    return this._detail
  }
}

exports.PerformanceMark = PerformanceMark

class PerformanceObserverEntryList {
  constructor(entryList) {
    this._list = entryList
  }

  getEntries() {
    return this._list
  }

  getEntriesByType(type) {
    return this._list.filter((entry) => entry.entryType === type)
  }

  getEntriesByName(name) {
    return this._list.filter((entry) => entry.name === name)
  }
}

exports.PerformanceObserverEntryList = PerformanceObserverEntryList

exports.PerformanceObserver = class PerformanceObserver {
  constructor(cb) {
    this._entryTypes = new Set()
    this._type = observerType.UNDEFINED
    this._buffer = []
    this._cb = cb
  }

  static get supportedEntryTypes() {
    return ['mark']
  }

  observe(opts = {}) {
    if ((!opts.entryTypes && !opts.type) || (opts.entryTypes && opts.type)) {
      throw new TypeError('opts.entryTypes OR opts.type must be specified')
    }

    if (
      (this._type === observerType.MULTIPLE && opts.type) ||
      (this._type === observerType.SINGLE && opts.entryTypes)
    ) {
      throw new InvalidModificationError(
        'Cannot change the PerformanceObserver type'
      )
    }

    if (this._type === observerType.UNDEFINED) {
      this._type = opts.entryTypes ? observerType.MULTIPLE : observerType.SINGLE
    }

    this._entryTypes.clear()

    if (this._type === observerType.MULTIPLE) {
      for (const entryType of opts.entryTypes) {
        if (PerformanceObserver.supportedEntryTypes.includes(entryType)) {
          this._entryTypes.add(entryType)
        }
      }
    } else {
      if (PerformanceObserver.supportedEntryTypes.includes(opts.type)) {
        this._entryTypes.add(opts.type)

        if (opts.buffered === true) {
          const bufferedEntries = globalBuffer.filter(
            (entry) => entry.entryType === opts.type
          )

          if (bufferedEntries.length > 0) {
            this._buffer.push(...bufferedEntries)

            globalPendingObservers.add(this)
            processPendingObservers()
          }
        }
      }
    }

    if (this._entryTypes.size > 0) {
      globalObservers.add(this)
    } else {
      this.disconnect()
    }
  }

  takeRecords() {
    const buf = this._buffer
    this._buffer = []
    return buf
  }

  disconnect() {
    globalObservers.delete(this)
    this._entryTypes.clear()
    this._type = observerType.UNDEFINED
  }
}

exports.mark = function mark(name, opts) {
  const mark = new PerformanceMark(name, opts)
  processEntry(mark)
  globalBuffer.push(mark)
  return mark
}

exports.clearMarks = function clearMarks(name) {
  if (name) {
    globalBuffer = globalBuffer.filter((entry) => entry.name !== name)
  } else {
    globalBuffer = []
  }
}

exports.getEntries = function getEntries() {
  return new PerformanceObserverEntryList(globalBuffer).getEntries()
}

exports.getEntriesByName = function getEntriesByName(name) {
  return new PerformanceObserverEntryList(globalBuffer).getEntriesByName(name)
}

exports.getEntriesByType = function getEntriesByType(type) {
  return new PerformanceObserverEntryList(globalBuffer).getEntriesByType(type)
}

// https://w3c.github.io/performance-timeline/#queue-a-performanceentry
function processEntry(entry) {
  for (const observer of globalObservers) {
    if (observer._entryTypes.has(entry.entryType)) {
      observer._buffer.push(entry)

      globalPendingObservers.add(observer)
      processPendingObservers()
    }
  }
}

// https://w3c.github.io/performance-timeline/#queue-the-performanceobserver-task
function processPendingObservers() {
  if (pending) return

  pending = true
  setImmediate(() => {
    pending = false

    const observers = Array.from(globalPendingObservers.values())
    globalPendingObservers.clear()

    for (const observer of observers) {
      observer._cb(
        new exports.PerformanceObserverEntryList(observer.takeRecords()),
        observer
      )
    }
  })
}
