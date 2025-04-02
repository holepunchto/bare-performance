const test = require('brittle')
const performance = require('.')

test('idleTime', (t) => {
  t.plan(1)

  setTimeout(() => {
    t.ok(performance.idleTime() > 0, 'idleTime > 0')
  }, 5)
})

test('metricsInfo', (t) => {
  t.comment(performance.metricsInfo())
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
