import { beforeEach, describe, expect, it, vi } from 'vitest'

type Callback = (error?: unknown, result?: unknown) => void

// Mirrors cloudinary@2 uploader.destroy: it invokes the callback (if given)
// AND returns a promise that rejects on failure (lib/uploader.js call_api).
// The returned thenable records whether anyone attached a handler, because an
// unhandled rejection from it is what used to terminate the process.
let outcome: { error?: Error; result?: unknown } = {}
let sdkPromiseHandled = false

const destroy = vi.fn((_publicId: string, callback?: Callback) => {
  if (typeof callback === 'function') callback(outcome.error, outcome.result)
  const settled = outcome.error ? Promise.reject(outcome.error) : Promise.resolve(outcome.result)
  settled.catch(() => undefined) // keep the test runner itself quiet
  return {
    then(onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      sdkPromiseHandled = true
      return settled.then(onFulfilled, onRejected)
    },
  }
})

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: { destroy: (publicId: string, callback?: Callback) => destroy(publicId, callback) },
  },
}))

import { deleteFromCloudinary } from '../utils/cloudinary.js'

describe('deleteFromCloudinary', () => {
  beforeEach(() => {
    destroy.mockClear()
    sdkPromiseHandled = false
  })

  it('resolves on success', async () => {
    outcome = { result: { result: 'ok' } }

    await expect(deleteFromCloudinary('avatars/abc')).resolves.toBeUndefined()
    expect(destroy.mock.calls[0][0]).toBe('avatars/abc')
  })

  it('surfaces a failure through the SDK promise, leaving no unhandled rejection', async () => {
    outcome = { error: new Error('network down') }

    await expect(deleteFromCloudinary('avatars/abc')).rejects.toThrow('network down')
    expect(sdkPromiseHandled).toBe(true)
  })
})
