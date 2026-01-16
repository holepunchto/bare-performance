const test = require('brittle')
const performance = require('.')

test('idleTime', (t) => {
  t.plan(2)

  setTimeout(() => {
    const { idleTime: firstIdle } = performance.nodeTiming

    t.comment('first idle: ', firstIdle)
    t.ok(firstIdle > 0, 'idle time > 0')

    setTimeout(() => {
      const { idleTime: secondIdle } = performance.nodeTiming

      t.comment('second idle: ', secondIdle)
      t.ok(secondIdle > firstIdle, 'second idle > first idle')
    }, 10)
  }, 10)
})

test('metricsInfo', (t) => {
  t.comment(performance.nodeTiming.uvMetricsInfo)
})

test('now', (t) => {
  t.comment(performance.now())
})

test('timeOrigin', (t) => {
  t.comment(performance.timeOrigin)
})

test('eventLoopUtilization', (t) => {
  t.plan(1)

  const util = performance.eventLoopUtilization()
  t.comment(util, 'no args')

  setTimeout(() => {
    const secondUtil = performance.eventLoopUtilization(util)
    t.comment(secondUtil, 'one arg')

    setTimeout(() => {
      t.comment(performance.eventLoopUtilization(util, secondUtil), 'two args')
      t.pass()
    }, 5)
  }, 5)
})

test('mark + observe', async (t) => {
  const subtest = t.test((sub) => {
    sub.plan(11)

    let count = 0

    performance.mark('ignored - early to the party')

    const obs = new performance.PerformanceObserver((list, observer) => {
      const entries = list.getEntries()

      if (count === 0) {
        sub.is(entries.length, 3)

        sub.is(entries[0].name, 'test - 1')
        sub.is(entries[1].name, 'test - 2')
        sub.is(entries[2].name, 'test - 3')

        sub.is(entries[0].startTime < entries[1].startTime, true)
        sub.is(entries[1].startTime < entries[2].startTime, true)
      } else if (count === 1) {
        sub.is(entries.length, 1)

        sub.is(entries[0].name, 'test - 4')
        sub.is(entries[0].entryType, 'mark')
        sub.is(entries[0].duration, 0)
        sub.is(entries[0].detail, 42)

        observer.disconnect()
      } else {
        sub.fail()
      }

      count++
    })

    obs.observe({ entryTypes: ['mark'] })

    for (let n = 1; n < 4; n++) performance.mark(`test - ${n}`)

    setTimeout(() => performance.mark('test - 4', { detail: 42 }), 100)

    setTimeout(() => performance.mark('unseen test'), 200)
  })

  await subtest

  performance.clearMarks()
})

test('observe - buffered option', (t) => {
  t.plan(3)

  performance.mark('first')

  const obs = new performance.PerformanceObserver((list, observer) => {
    const entries = list.getEntries()

    t.is(entries.length, 2)
    t.is(entries[0].name, 'first')
    t.is(entries[1].name, 'second')

    observer.disconnect()
    performance.clearMarks()
  })

  performance.mark('second')

  obs.observe({ type: 'mark', buffered: true })
})

test('observe - error handling', (t) => {
  t.plan(3)

  {
    const obs = new performance.PerformanceObserver(() => {})

    t.exception.all(() => obs.observe({}), /TypeError/, 'no entry type specified')
  }

  {
    const obs = new performance.PerformanceObserver(() => {})

    t.exception(() => {
      obs.observe({ type: 'mark' })
      obs.observe({ entryTypes: ['mark'] })
    }, /InvalidModificationError/)
  }

  {
    const obs = new performance.PerformanceObserver(() => {})

    t.exception(() => {
      obs.observe({ entryTypes: ['mark'] })
      obs.observe({ type: 'mark' })
    }, /InvalidModificationError/)
  }
})

test('observe - gc', (t) => {
  // t.plan(5)

  const obs = new performance.PerformanceObserver((list, observer) => {
    /*
    const entries = list.getEntries()

    t.is(entries[0].name, 'gc')
    t.is(entries[0].entryType, 'gc')
    t.ok(entries[0].startTime > 0)
    t.ok(entries[0].duration > 0)
    t.ok(entries[0].detail.kind)

    observer.disconnect()
    */
  })

  obs.observe({ type: 'gc' })

  t.pass()
})

test('measure', (t) => {
  t.plan(3)

  performance.mark('start')

  setTimeout(() => {
    performance.mark('end')

    const measure = performance.measure('my-measure', 'start', 'end')

    t.is(measure.name, 'my-measure')
    t.is(measure.entryType, 'measure')
    t.ok(measure.duration > 95 && measure.duration < 115)

    performance.clearMarks()
    performance.clearMeasures()
  }, 100)
})

test('measure - options object', (t) => {
  t.plan(1)

  performance.mark('my-mark')
  const measure = performance.measure('my-measure', {
    start: 'my-mark',
    detail: 42
  })

  t.is(measure.detail, 42)

  performance.clearMarks()
  performance.clearMeasures()
})

test('measure - error handling', (t) => {
  t.plan(2)

  t.exception.all(
    () => performance.measure('foo', { detail: 0 }),
    /TypeError/,
    'no start or end specified'
  )

  t.exception.all(
    () => performance.measure('foo', { start: 'foo', end: 'bar', duration: 42 }),
    /TypeError/,
    'start, duration and end specified'
  )
})

test('clearMarks + clear Measures', (t) => {
  t.plan(5)

  performance.mark('my-test')
  performance.measure('my-measure', 'my-test')

  t.is(performance.getEntries().length, 2)
  t.is(performance.getEntriesByName('my-test').length, 1)
  t.is(performance.getEntriesByType('mark').length, 1)
  t.is(performance.getEntriesByType('measure').length, 1)

  performance.clearMarks()
  performance.clearMeasures()

  t.is(performance.getEntries().length, 0)
})

test('createHistogram - basic', (t) => {
  const histogram = performance.createHistogram({ highest: 10, figures: 1 })

  t.is(histogram.min, 9223372036854776000)
  t.is(histogram.max, 0)
  t.ok(Number.isNaN(histogram.mean))
  t.is(histogram.count, 0)
  t.is(histogram.exceeds, 0)
  t.ok(histogram.percentiles instanceof Map)
  t.is(histogram.percentiles.size, 1)
  t.is(histogram.percentile(100), 0)

  histogram.record(1)

  t.is(histogram.min, 1)
  t.is(histogram.max, 1)
  t.is(histogram.mean, 1)
  t.is(histogram.count, 1)
  t.is(histogram.stddev, 0)
  t.is(histogram.percentiles.size, 2)
  t.is(histogram.percentile(100), 1)

  histogram.record(5)

  t.is(histogram.min, 1)
  t.is(histogram.max, 5)
  t.is(histogram.mean, 3)
  t.is(histogram.count, 2)
  t.is(histogram.stddev, 2)
  t.is(histogram.percentiles.size, 4)
  t.is(histogram.percentile(75), 5)

  histogram.record(50)

  t.is(histogram.exceeds, 1)
  t.is(histogram.count, 2)
  t.is(histogram.max, 5)

  histogram.reset()

  t.is(histogram.min, 9223372036854776000)
  t.is(histogram.max, 0)
  t.ok(Number.isNaN(histogram.mean))
  t.is(histogram.count, 0)
  t.is(histogram.exceeds, 0)
  t.is(histogram.percentiles.size, 1)
})

test('createHistogram - add', (t) => {
  const h1 = performance.createHistogram()
  const h2 = performance.createHistogram()

  h1.record(1)
  h1.record(2)

  h2.record(3)
  h2.record(4)

  h1.add(h2)

  t.is(h1.count, 4)
  t.is(h1.min, 1)
  t.is(h1.max, 4)
  t.is(h1.mean, 2.5)

  t.is(h2.count, 2)
})

test('monitorEventLoopDelay', (t) => {
  t.plan(6)

  const histogram = performance.monitorEventLoopDelay()

  t.is(histogram.count, 0)

  t.is(histogram.enable(), true)
  t.is(histogram.enable(), false)

  setTimeout(() => {
    t.is(histogram.disable(), true)
    t.is(histogram.disable(), false)

    t.ok(histogram.count > 0)
  }, 100)
})

test('constants', (t) => {
  t.ok(performance.constants)
})
