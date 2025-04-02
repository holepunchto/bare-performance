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
    })
  }, 5)
})

test('metricsInfo', (t) => {
  t.comment(performance.nodeTiming.uvMetricsInfo)
})

test('now', (t) => {
  t.comment(performance.now())
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
