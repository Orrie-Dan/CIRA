import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendOTPViaSMS, sendSMS } from '../utils/sms.js'

const fetchMock = vi.fn()

describe('sms (Pindo)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('posts to Pindo with bearer token, sender and E.164 recipient', async () => {
    vi.stubEnv('PINDO_API_TOKEN', 'tok-123')
    vi.stubEnv('PINDO_SENDER_ID', 'CIRA')
    fetchMock.mockResolvedValue(new Response('{"sms_id":1}', { status: 201 }))

    await sendOTPViaSMS('+250788123456', '482913')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.pindo.io/v1/sms/')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok-123', 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({
      to: '+250788123456',
      text: 'Your CIRA verification code is: 482913. This code will expire in 15 minutes.',
      sender: 'CIRA',
    })
  })

  it('throws on a non-2xx response without leaking the message text', async () => {
    vi.stubEnv('PINDO_API_TOKEN', 'tok-123')
    vi.stubEnv('PINDO_SENDER_ID', 'CIRA')
    const message = 'Your CIRA verification code is: 111222.'
    fetchMock.mockResolvedValue(new Response(`{"error":"insufficient balance","text":"${message}"}`, { status: 402 }))

    const err = await sendSMS({ to: '+250788123456', message }).catch((e: Error) => e)

    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('(402)')
    expect((err as Error).message).toContain('insufficient balance')
    expect((err as Error).message).not.toContain('111222')
  })

  it('requires a sender ID when a token is set', async () => {
    vi.stubEnv('PINDO_API_TOKEN', 'tok-123')
    vi.stubEnv('PINDO_SENDER_ID', '')

    await expect(sendSMS({ to: '+250788123456', message: 'hi' })).rejects.toThrow('PINDO_SENDER_ID missing')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws in production when unconfigured', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PINDO_API_TOKEN', '')

    await expect(sendSMS({ to: '+250788123456', message: 'hi' })).rejects.toThrow('PINDO_API_TOKEN missing')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('logs instead of sending outside production when unconfigured', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('PINDO_API_TOKEN', '')

    await sendSMS({ to: '+250788123456', message: 'hi' })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith('[SMS:dev] To: +250788123456')
  })
})
