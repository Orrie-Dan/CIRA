/**
 * Email sending via the SendGrid v3 REST API (no SDK dependency).
 *
 * Config:
 *   SENDGRID_API_KEY  - required in production
 *   FROM_EMAIL        - verified sender address, required with SENDGRID_API_KEY
 *   FROM_NAME         - optional display name (default "CIRA")
 *
 * Without SENDGRID_API_KEY outside production, emails are logged to the
 * console so OTP flows can be exercised locally.
 */

export interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

const SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send'

export async function sendEmail(options: EmailOptions): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY
  const isProduction = process.env.NODE_ENV === 'production'

  if (!apiKey) {
    if (isProduction) {
      throw new Error('Email service not configured (SENDGRID_API_KEY missing)')
    }
    console.log(`[EMAIL:dev] To: ${options.to}`)
    console.log(`[EMAIL:dev] Subject: ${options.subject}`)
    console.log(`[EMAIL:dev] Body: ${options.text || options.html}`)
    return
  }

  const fromEmail = process.env.FROM_EMAIL
  if (!fromEmail) {
    throw new Error('Email service not configured (FROM_EMAIL missing)')
  }

  const content: Array<{ type: string; value: string }> = []
  if (options.text) content.push({ type: 'text/plain', value: options.text })
  content.push({ type: 'text/html', value: options.html })

  const response = await fetch(SENDGRID_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: options.to }] }],
      from: { email: fromEmail, name: process.env.FROM_NAME || 'CIRA' },
      subject: options.subject,
      content,
    }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`SendGrid request failed (${response.status}): ${detail.slice(0, 300)}`)
  }
}

function codeEmailHtml(title: string, intro: string, code: string, footerNote: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #00b8d4; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .otp-code { font-size: 32px; font-weight: bold; text-align: center; color: #00b8d4; padding: 20px; background-color: white; border-radius: 8px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${title}</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>${intro}</p>
            <div class="otp-code">${code}</div>
            <p>This code will expire in 15 minutes.</p>
            <p>${footerNote}</p>
          </div>
          <div class="footer">
            <p>© CIRA - Citizens Infrastructure Reporting Application</p>
          </div>
        </div>
      </body>
    </html>
  `
}

/**
 * Send OTP via email
 */
export async function sendOTPViaEmail(email: string, otp: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'CIRA Verification Code',
    html: codeEmailHtml(
      'CIRA Verification',
      'Your verification code for CIRA is:',
      otp,
      "If you didn't request this code, please ignore this email."
    ),
    text: `Your CIRA verification code is: ${otp}. This code will expire in 15 minutes.`,
  })
}

/**
 * Send password reset code via email
 */
export async function sendPasswordResetEmail(email: string, otp: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'CIRA Password Reset Code',
    html: codeEmailHtml(
      'CIRA Password Reset',
      'Use this code to reset your CIRA password:',
      otp,
      "If you didn't request a password reset, you can ignore this email. Your password will not change."
    ),
    text: `Your CIRA password reset code is: ${otp}. This code will expire in 15 minutes. If you didn't request this, ignore this email.`,
  })
}
