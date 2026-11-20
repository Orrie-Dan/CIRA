const RETRY_DELAYS = [60000, 120000, 240000, 480000]

function getRetryDelay(retryCount: number): number {
  if (retryCount >= RETRY_DELAYS.length) {
    return RETRY_DELAYS[RETRY_DELAYS.length - 1]
  }
  return RETRY_DELAYS[retryCount]
}

interface SyncQueueItem {
  id: string
  retryCount: number
  lastAttempt?: number
}

function shouldRetry(item: SyncQueueItem): boolean {
  const MAX_RETRIES = 5
  if (item.retryCount >= MAX_RETRIES) return false
  if (!item.lastAttempt) return true

  const delay = getRetryDelay(item.retryCount)
  const timeSinceLastAttempt = Date.now() - item.lastAttempt
  return timeSinceLastAttempt >= delay
}

describe('mobile sync retry logic', () => {
  it('uses exponential backoff delays', () => {
    expect(getRetryDelay(0)).toBe(60000)
    expect(getRetryDelay(1)).toBe(120000)
    expect(getRetryDelay(99)).toBe(480000)
  })

  it('retries when never attempted', () => {
    expect(shouldRetry({ id: '1', retryCount: 0 })).toBe(true)
  })

  it('stops after max retries', () => {
    expect(shouldRetry({ id: '1', retryCount: 5, lastAttempt: Date.now() })).toBe(false)
  })
})
