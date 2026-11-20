export const USER_ROLES = ['citizen', 'officer', 'admin'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const REPORT_STATUSES = [
  'new',
  'triaged',
  'assigned',
  'in_progress',
  'resolved',
  'rejected',
] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

export const REPORT_TYPES = [
  'roads',
  'bridges',
  'water',
  'power',
  'sanitation',
  'telecom',
  'public_building',
  'pothole',
  'streetlight',
  'sidewalk',
  'drainage',
  'other',
] as const
export type ReportType = (typeof REPORT_TYPES)[number]

export const RWANDA_PROVINCES = [
  'Kigali City',
  'Eastern Province',
  'Northern Province',
  'Southern Province',
  'Western Province',
] as const
