const binding = require('../binding')

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

exports.RecordableHistogram = class RecordableHistogram extends Histogram {
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

exports.IntervalHistogram = class IntervalHistogram extends Histogram {
  constructor(opts = {}) {
    const { resolution = 10 } = opts

    super({
      lowest: 1,
      highest: 3_600_000_000_000 // One hour in nanoseconds
    })

    this._resolution = resolution
    this._enabled = false

    this._timerId = -1
    this._timerStartTime = -1
  }

  enable() {
    if (this._enabled === true) return false

    this._timerStartTime = binding.now()
    this._timerId = setInterval(this._oninterval.bind(this), this._resolution)
    this._timerId.unref()

    this._enabled = true

    return true
  }

  disable() {
    if (this._enabled === false) return false

    clearInterval(this._timerId)

    this._enabled = false

    return true
  }

  _oninterval() {
    const now = binding.now()
    const actual = now - this._timerStartTime
    const expected = this._resolution * 1e6

    const hasDelay = actual > expected

    if (hasDelay) {
      const delay = actual - expected

      if (binding.histogramRecord(this._handle, delay)) this._count++
      else this._exceeds++
    }

    this._timerStartTime = now
  }

  [Symbol.dispose]() {
    this.disable()
  }
}
