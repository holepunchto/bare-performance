const binding = require('../binding')

const { TIME_ORIGIN } = binding

exports.now = function now() {
  return binding.now() / 1e6 - TIME_ORIGIN
}

exports.timeOrigin = TIME_ORIGIN
