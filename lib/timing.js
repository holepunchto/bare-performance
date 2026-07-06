const binding = require('../binding')
const { now, timeOrigin } = require('./hr-time')
const { observerType } = require('./constants')
const { InvalidModificationError } = require('./errors')

function noop() {}

const globalObservers = new Set()
const globalPendingObservers = new Set()
let observerTaskQueued = false

let globalBuffer = []

let globalResourceTimingSecondaryBuffer = []
let resourceTimingFullEventPending = false
let resourceTimingSizeLimit = 250
let onResourceTimingBufferFull = noop

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

exports.PerformanceResourceTiming = class PerformanceResourceTiming extends (
  exports.PerformanceEntry
) {
  constructor(
    initiatorType,
    requestedUrl,
    timingInfo,
    cacheMode,
    bodyInfo,
    responseStatus,
    deliveryType
  ) {
    super(requestedUrl, 'resource', timingInfo.startTime, timingInfo.endTime - timingInfo.startTime)

    this._initiatorType = initiatorType
    this._requestedURL = requestedUrl
    this._timingInfo = timingInfo
    this._resourceInfo = bodyInfo
    this._cacheMode = cacheMode
    this._responseStatus = responseStatus
    this._deliveryType = deliveryType
  }

  get initiatorType() {
    return this._initiatorType
  }

  get deliveryType() {
    return this._deliveryType
  }

  get transferSize() {
    if (this._cacheMode === 'local') return 0
    if (this._cacheMode === 'validated') return 300

    return this.encodedBodySize * 300
  }

  get responseStatus() {
    return this._responseStatus
  }

  get encodedBodySize() {
    return this._resourceInfo.encodedSize
  }
}

class PerformanceGCEntry extends exports.PerformanceEntry {
  static _handle = null
  static _refs = 0

  static _ref() {
    if (this._refs++ === 0) {
      this._handle = binding.enableGarbageCollectionTracking(this, this._onentry)
    }
  }

  static _unref() {
    if (--this._refs === 0) {
      binding.disableGarbageCollectionTracking(this._handle)
      this._handle = null
    }
  }

  static _onentry(startTime, duration, kind) {
    startTime -= timeOrigin

    const entry = new PerformanceGCEntry(startTime, duration, kind)

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
    return ['mark', 'measure', 'gc', 'resource']
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

      if (this._entryTypes.has('gc')) PerformanceGCEntry._ref()
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

    if (this._entryTypes.has('gc')) PerformanceGCEntry._unref()

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
    endTime = toTimestamp(start) + toTimestamp(opts.duration)
  } else {
    endTime = now()
  }

  let startTime

  if (start) {
    startTime = toTimestamp(start)
  } else if (end && opts.duration) {
    startTime = toTimestamp(end) - toTimestamp(opts.duration)
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

// https://w3c.github.io/resource-timing/#marking-resource-timing
exports.markResourceTiming = function markResourceTiming(
  timingInfo,
  requestedUrl,
  initiatorType,
  global,
  cacheMode,
  bodyInfo,
  responseStatus,
  deliveryType = ''
) {
  const resource = new exports.PerformanceResourceTiming(
    initiatorType,
    requestedUrl,
    timingInfo,
    cacheMode,
    bodyInfo,
    responseStatus,
    deliveryType
  )

  processEntry(resource)

  addResourceTimingEntry(resource)

  return resource
}

exports.clearResourceTimings = function clearResourceTimings(name) {
  if (name) {
    globalBuffer = globalBuffer.filter(
      (entry) => entry.name !== name && entry.entryType !== 'resource'
    )
  } else {
    globalBuffer = globalBuffer.filter((entry) => entry.entryType !== 'resource')
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

exports.setResourceTimingBufferSize = function setResourceTimingBufferSize(maxSize) {
  resourceTimingSizeLimit = maxSize
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

// https://w3c.github.io/resource-timing/#dfn-can-add-resource-timing-entry
function canAddResourceTimingEntry() {
  const bufferSize = globalBuffer.filter((entry) => entry.entryType === 'resource').length

  return bufferSize < resourceTimingSizeLimit
}

// https://w3c.github.io/resource-timing/#dfn-copy-secondary-buffer
function copySecondaryBuffer() {
  while (globalResourceTimingSecondaryBuffer.length > 0 && canAddResourceTimingEntry()) {
    const resource = globalResourceTimingSecondaryBuffer.shift()

    globalBuffer.push(resource)
  }
}

// https://w3c.github.io/resource-timing/#dfn-fire-a-buffer-full-event
function fireBufferFullEvent() {
  while (globalResourceTimingSecondaryBuffer.length > 0) {
    const numberOfExcessEntriesBefore = globalResourceTimingSecondaryBuffer.length

    if (!canAddResourceTimingEntry()) {
      onResourceTimingBufferFull('resourcetimingbufferfull')
    }

    copySecondaryBuffer()

    const numberOfExcessEntriesAfter = globalResourceTimingSecondaryBuffer.length

    if (numberOfExcessEntriesBefore <= numberOfExcessEntriesAfter) {
      globalResourceTimingSecondaryBuffer = []
    }
  }

  resourceTimingFullEventPending = false
}

// https://w3c.github.io/resource-timing/#dfn-add-a-PerformanceResourceTiming-entry
function addResourceTimingEntry(entry) {
  if (canAddResourceTimingEntry() && resourceTimingFullEventPending === false) {
    globalBuffer.push(entry)
    return
  } else if (resourceTimingFullEventPending === false) {
    resourceTimingFullEventPending = true

    setImmediate(() => fireBufferFullEvent())
  }

  globalResourceTimingSecondaryBuffer.push(entry)
}

// https://w3c.github.io/performance-timeline/#queue-the-performanceobserver-task
function processPendingObservers() {
  if (observerTaskQueued) return

  observerTaskQueued = true
  setImmediate(() => {
    observerTaskQueued = false

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

// https://w3c.github.io/resource-timing/#performance-onresourcetimingbufferfull
exports.registerEventHandler = function registerEventHandler(handler) {
  onResourceTimingBufferFull = handler
}
