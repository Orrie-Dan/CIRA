export interface User {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: string;
  avatarUrl?: string | null;
}

export interface Report {
  id: string;
  title: string;
  description: string;
  type: ReportType;
  severity: ReportSeverity;
  status: ReportStatus;
  latitude: number;
  longitude: number;
  addressText?: string | null;
  province?: string | null;
  district?: string | null;
  sector?: string | null;
  cell?: string | null;
  village?: string | null;
  createdAt: string;
  reporterId?: string | null;
  photos?: Photo[]; // Optional photos for list view
  /** Only on GET /reports/:id (the public detail view). */
  latestStatus?: {
    status: string;
    note?: string | null;
    changedAt: string;
  } | null;
}

export type ReportType =
  | 'roads'
  | 'bridges'
  | 'water'
  | 'power'
  | 'sanitation'
  | 'telecom'
  | 'public_building'
  | 'pothole'
  | 'streetlight'
  | 'sidewalk'
  | 'drainage'
  | 'other';

export type ReportSeverity = 'low' | 'medium' | 'high';

export type ReportStatus =
  | 'new'
  | 'triaged'
  | 'assigned'
  | 'in_progress'
  | 'resolved'
  | 'rejected';

export interface Photo {
  id: string;
  url: string;
  caption?: string | null;
  createdAt: string;
}

export interface CreateReportPayload {
  title: string;
  description: string;
  type: ReportType;
  severity: ReportSeverity;
  latitude: number;
  longitude: number;
  addressText?: string;
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
  reporterId?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

/** POST /auth/verify-otp: no token until the account's email is verified. */
export interface VerifyOtpResponse {
  user: User;
  verified: boolean;
  token?: string;
  requiresEmailVerification?: boolean;
}

export interface ApiListResponse {
  data: Report[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface AdminReport extends Report {
  reporter?: User | null;
  currentAssignment?: {
    assignee?: User | null;
    organization?: {
  id: string;
      name: string;
    } | null;
  } | null;
}

export interface AdminListResponse {
  data: AdminReport[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}

/** Staff view, GET /admin/reports/:id. */
export interface DetailedReport extends Report {
  photos: Photo[];
  reporter?: User | null;
  statusHistory?: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    changedBy?: Pick<User, 'id' | 'email' | 'fullName'> | null;
    createdAt: string;
  }>;
  comments?: Array<{
    id: string;
    body: string;
    author?: User | null;
    createdAt: string;
  }>;
  /** Newest first: assignments[0] is the current one. */
  assignments?: Array<{
    id: string;
    assignee?: User | null;
    organization?: {
      id: string;
      name: string;
    } | null;
    dueAt?: string | null;
    createdAt: string;
  }>;
}

export interface UpdateStatusPayload {
  status: ReportStatus;
  note?: string;
}

export interface AddCommentPayload {
  body: string;
}

export interface Notification {
  id: string;
  type: 'report_created' | 'report_status_changed' | 'report_commented' | 'report_assigned';
  title: string;
  body: string;
  data: {
    reportId?: string;
    reportTitle?: string;
    status?: string;
    commentId?: string;
    assigneeId?: string;
    organizationId?: string;
  };
  read: boolean;
  createdAt: string;
}
