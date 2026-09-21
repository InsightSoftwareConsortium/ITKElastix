// Cancellation for promises that cannot be cancelled themselves. An itk-wasm
// pipeline call is a Comlink request to a web worker: once the worker is
// terminated the reply never arrives and the promise never settles, so a
// run that wants to stop has to abandon the promise rather than wait for
// it. Free of DOM access so the node unit tests can exercise it.

/**
 * `promise`, or a rejection with `signal.reason` as soon as `signal` aborts,
 * whichever comes first. Without a signal the promise is returned as is.
 * The abort listener is removed once the promise settles, so a long-lived
 * signal does not accumulate listeners across runs.
 */
export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) {
    return promise
  }
  if (signal.aborted) {
    return Promise.reject(signal.reason)
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}
