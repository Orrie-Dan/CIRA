export {
  generateOtpCode,
  storeOtpRecord,
  verifyOtpRecord,
  normalizeOtpIdentifier,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
} from '../services/otpStore.js'
export type { OtpPurpose, OtpVerifyResult } from '../services/otpStore.js'
