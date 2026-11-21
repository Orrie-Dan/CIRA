/**
 * SMS sending via the Pindo REST API (no SDK dependency).
 *
 * Config:
 *   PINDO_API_TOKEN  - required in production (Pindo dashboard > Account > Security)
 *   PINDO_SENDER_ID  - sender name shown on the SMS, required with PINDO_API_TOKEN
 *                      (must be a sender ID approved on the Pindo account)
 *
 * Without PINDO_API_TOKEN outside production, messages are logged to the
 * console so phone OTP flows can be exercised locally.
 *
 * `to` must be E.164 (e.g. +250788123456).
 */

export interface SMSOptions {
  to: string
  message: string
}

const PINDO_SMS_URL = 'https://api.pindo.io/v1/sms/'

export async function sendSMS(options: SMSOptions): Promise<void> {
  const token = process.env.PINDO_API_TOKEN
  const isProduction = process.env.NODE_ENV === 'production'

  if (!token) {
    if (isProduction) {
      throw new Error('SMS service not configured (PINDO_API_TOKEN missing)')
    }
    console.log(`[SMS:dev] To: ${options.to}`)
    console.log(`[SMS:dev] Message: ${options.message}`)
    return
  }

  const sender = process.env.PINDO_SENDER_ID
  if (!sender) {
    throw new Error('SMS service not configured (PINDO_SENDER_ID missing)')
  }

  const response = await fetch(PINDO_SMS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: options.to, text: options.message, sender }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    // The provider may echo the message back; keep codes out of the logs.
    const safeDetail = detail.split(options.message).join('[message]').slice(0, 300)
    throw new Error(`Pindo SMS request failed (${response.status}): ${safeDetail}`)
  }
}

/**
 * Send OTP via SMS
 */
export async function sendOTPViaSMS(phone: string, otp: string): Promise<void> {
  const message = `Your CIRA verification code is: ${otp}. This code will expire in 15 minutes.`
  await sendSMS({ to: phone, message })
}
