const now = require('../common/time').now

exports.main = function (event, context) {
  return { event, now: now() }
}
