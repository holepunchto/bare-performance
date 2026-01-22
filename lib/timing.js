const binding = require('../binding')
const { now, timeOrigin } = require('./hr-time')
const { observerType } = require('./constants')
const { InvalidModificationError } = require('./errors')

// globals
const globalObservers = new Set()
const globalPendingObservers = new Set()
let globalBuffer = []
let pending = false

exports.PerformanceEntry = class PerformanceEntry {
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

exports.PerformanceGcEntry = class PerformanceGcEntry extends exports.PerformanceEntry {
  static _handle = null
  static _observerCounter = 0

  static _incrementObserverCount() {
    if (++PerformanceGcEntry._observerCounter === 1) {
      PerformanceGcEntry._handle = binding.enableGarbageCollectionTracking(
        this,
        PerformanceGcEntry._onNewEntry
      )
    }
  }

  static _decrementObserverCount() {
    if (--PerformanceGcEntry._observerCounter === 0) {
      binding.disableGarbageCollectionTracking(this._handle)
      PerformanceGcEntry._handle = null
    }
  }

  static _onNewEntry(startTime, duration, kind) {
    startTime -= timeOrigin

    const entry = new PerformanceGcEntry(startTime, duration, kind)

    processEntry(entry)
  }

  constructor(startTime, duration, kind) {
    super('gc', 'gc', startTime, duration)

    this._detail = { kind }
  }

  get detail() {
    return this._detail
  }
}

exports.PerformanceMark = class PerformanceMark extends exports.PerformanceEntry {
  constructor(name, opts = {}) {
    const { startTime = now(), detail = null } = opts

    super(name, 'mark', startTime, 0)

    this._detail = detail
  }

  get detail() {
    return this._detail
  }
}

exports.PerformanceMeasure = class PerformanceMeasure extends exports.PerformanceEntry {
  constructor(name, startTime, duration, opts = {}) {
    const { detail = null } = opts

    super(name, 'measure', startTime, duration)

    this._detail = detail
  }

  get detail() {
    return this._detail
  }
}

exports.PerformanceObserverEntryList = class PerformanceObserverEntryList {
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

exports.PerformanceObserver = class PerformanceObserver {
  constructor(cb) {
    this._entryTypes = new Set()
    this._type = observerType.UNDEFINED
    this._buffer = []
    this._cb = cb
  }

  static get supportedEntryTypes() {
    return ['mark', 'measure', 'gc']
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

      if (this._entryTypes.has('gc')) exports.PerformanceGcEntry._incrementObserverCount()
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

    if (this._entryTypes.has('gc')) exports.PerformanceGcEntry._decrementObserverCount()

    this._entryTypes.clear()

    this._type = observerType.UNDEFINED
  }
}

exports.mark = function mark(name, opts) {
  const mark = new exports.PerformanceMark(name, opts)

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

    if (opts.start && opts.end && opts.duration) {
      throw new TypeError('One of opts.start, opts.end or opts.duration must not be specified')
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
    endTime = now()
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

  const measure = new exports.PerformanceMeasure(name, startTime, duration, opts)

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
  return new exports.PerformanceObserverEntryList(globalBuffer).getEntries()
}

exports.getEntriesByName = function getEntriesByName(name) {
  return new exports.PerformanceObserverEntryList(globalBuffer).getEntriesByName(name)
}

exports.getEntriesByType = function getEntriesByType(type) {
  return new exports.PerformanceObserverEntryList(globalBuffer).getEntriesByType(type)
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
