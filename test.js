const test = require('brittle')
const performance = require('.')

test('now', (t) => {
  t.comment(performance.now())
})

test('idleTime', (t) => {
  t.plan(1)

  setTimeout(() => {
    t.ok(performance.idleTime() > 0, 'idleTime > 0')
  }, 5)
})

test('metricsInfo', (t) => {
  t.comment(performance.metricsInfo())
})
