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

test('clearMarks', (t) => {
  t.plan(4)

  performance.mark('test')

  t.is(performance.getEntries().length, 1)
  t.is(performance.getEntriesByName('test').length, 1)
  t.is(performance.getEntriesByType('mark').length, 1)

  performance.clearMarks('test')

  t.is(performance.getEntriesByType('mark').length, 0)
})
