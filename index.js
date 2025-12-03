const { observerType } = require('./lib/constants')
const { InvalidModificationError } = require('./lib/errors')
const binding = require('./binding')

const { TIME_ORIGIN } = binding

exports.now = function now() {
  return binding.now() - TIME_ORIGIN
}

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

class PerformanceEntry {
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

class PerformanceMeasure extends PerformanceEntry {
  constructor(name, startTime, duration, opts = {}) {
    const { detail = null } = opts

    super(name, 'measure', startTime, duration)

    this._detail = detail
  }

  get detail() {
    return this._detail
  }
}

exports.PerformanceMeasure = PerformanceMeasure

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

class PerformanceObserver {
  constructor(cb) {
    this._entryTypes = new Set()
    this._type = observerType.UNDEFINED
    this._buffer = []
    this._cb = cb
  }

  static get supportedEntryTypes() {
    return ['mark', 'measure']
  }

  observe(opts = {}) {
    if ((!opts.entryTypes && !opts.type) || (opts.entryTypes && opts.type)) {
      throw new TypeError('opts.entryTypes OR opts.type must be specified')
    }

    if (
      (this._type === observerType.MULTIPLE && opts.type) ||
      (this._type === observerType.SINGLE && opts.entryTypes)
    ) {
      throw new InvalidModificationError('Cannot change the PerformanceObserver type')
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
          const bufferedEntries = globalBuffer.filter((entry) => entry.entryType === opts.type)

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

exports.PerformanceObserver = PerformanceObserver

exports.mark = function mark(name, opts) {
  const mark = new PerformanceMark(name, opts)

  processEntry(mark)

  globalBuffer.push(mark)

  return mark
}

exports.clearMarks = function clearMarks(name) {
  if (name) {
    globalBuffer = globalBuffer.filter((entry) => entry.name !== name && entry.entryType !== 'mark')
  } else {
    globalBuffer = globalBuffer.filter((entry) => entry.entryType !== 'mark')
  }
}

exports.measure = function measure(name, start, end) {
  let opts = {}

  if (typeof start === 'object' && start !== null && Object.keys(start).length > 0) {
    opts = start

    if (!opts.start && !opts.end) {
      throw new TypeError('opts.start or opts.end must be specified')
    }

    if (opts.name && opts.end && opts.duration) {
      throw new TypeError('One of opts.name, opts.end or opts.duration must not be specified')
    }

    start = opts.start
    end = opts.end
  }

  let endTime

  if (end) {
    endTime = toTimestamp(end)
  } else if (start && opts.duration) {
    endTime = toTimestamp(start) + toTimestamp(duration)
  } else {
    endTime = exports.now()
  }

  let startTime

  if (start) {
    startTime = toTimestamp(start)
  } else if (end && opts.duration) {
    startTime = toTimestamp(end) - toTimestamp(duration)
  } else {
    startTime = 0
  }

  const duration = endTime - startTime

  const measure = new PerformanceMeasure(name, startTime, duration, opts)

  processEntry(measure)

  globalBuffer.push(measure)

  return measure
}

exports.clearMeasures = function clearMeasures(name) {
  if (name) {
    globalBuffer = globalBuffer.filter(
      (entry) => entry.name !== name && entry.entryType !== 'measure'
    )
  } else {
    globalBuffer = globalBuffer.filter((entry) => entry.entryType !== 'measure')
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
      observer._cb(new exports.PerformanceObserverEntryList(observer.takeRecords()), observer)
    }
  })
}

// https://w3c.github.io/user-timing/#convert-a-mark-to-a-timestamp
function toTimestamp(mark) {
  if (typeof mark === 'string') {
    const performanceMark = globalBuffer.findLast(
      (entry) => entry.name === mark && entry.entryType === 'mark'
    )

    if (performanceMark === undefined) {
      throw new SyntaxError(`Mark ${mark} not found`)
    }

    return performanceMark.startTime
  } else if (typeof mark === 'number') {
    return mark
  }
}

class Histogram {
  constructor(opts = {}) {
    const { lowest = 1, highest = Number.MAX_SAFE_INTEGER, figures = 3 } = opts

    this._handle = binding.histogramInit(this, lowest, highest, figures)

    this._count = 0
    this._exceeds = 0
  }

  get max() {
    return binding.histogramMax(this._handle)
  }

  get min() {
    return binding.histogramMin(this._handle)
  }

  get mean() {
    return binding.histogramMean(this._handle)
  }

  get percentiles() {
    return new Map(binding.histogramPercentiles(this._handle))
  }

  get stddev() {
    return binding.histogramStddev(this._handle)
  }

  get count() {
    return this._count
  }

  get exceeds() {
    return this._exceeds
  }

  percentile(percentile) {
    return binding.histogramPercentile(this._handle, percentile)
  }

  reset() {
    this._count = 0
    this._exceeds = 0

    binding.histogramReset(this._handle)
  }
}

class RecordableHistogram extends Histogram {
  add(other) {
    this._count += other._count
    this._exceeds += other._exceeds

    binding.histogramAdd(this._handle, other._handle)
  }

  record(value) {
    if (binding.histogramRecord(this._handle, value)) this._count++
    else this._exceeds++
  }
}

exports.createHistogram = function createHistogram(opts) {
  return new RecordableHistogram(opts)
}
