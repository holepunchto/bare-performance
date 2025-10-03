class InvalidModificationError extends Error {
  constructor(msg, fn = InvalidModificationError, code = fn.name) {
    super(`${code}: ${msg}`)
    this.code = code

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, fn)
    }
  }
}

exports.InvalidModificationError = InvalidModificationError
