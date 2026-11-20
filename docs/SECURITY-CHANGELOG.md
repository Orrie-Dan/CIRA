# Security Changelog

## Phone numbers and phone login

### The problem
- `POST /auth/send-otp` with a phone picked the first account with that number (`findFirst`). Numbers were neither unique nor normalized, and anyone could put any number on their profile. A phone code also marked the number verified and, for accounts with a verified email, issued a session. So whoever held a number that someone had typed into their profile by mistake (or a recycled number) could log into that account. It wasn't exploitable yet because SMS is still a mock.

### Now
- Phone numbers are normalized to E.164 everywhere they are accepted (registration, `PUT /auth/profile`, `POST /admin/users`). Rwandan numbers can be entered without `+` (`0788123456` and `250788123456` become `+250788123456`). Anything else returns 400.
- One account per number (unique index, migration `20261120120000_unique_user_phone`). Registering or saving a number another account already has returns 409 `PHONE_IN_USE`. This reveals that the number is registered, as registration already does for emails.
- Changing your number resets `phoneVerified`.
- Numbers are verified only while signed in: `POST /auth/phone/send-code` `{ phone }`, then `POST /auth/phone/verify` `{ phone, code }`. A correct code sets the number on your account as verified. If another account has the number *unverified*, it is removed from that account (nobody can block a number by typing it in first); if another account has it *verified*, 409.
- `send-otp` and `verify-otp` with a phone are now login only, and only for a verified number. Unknown, unverified and malformed numbers get the same "If an account exists" answer as before. A phone login still gives no session until the email is verified. `verify-otp` no longer verifies numbers.
- When a request includes an email, the phone in it is ignored, as before (the mobile verify screen sends both).
- The mobile app has no screen for phone verification yet, so no number can be used for login until one is built.
- Local databases where two accounts share a number must have the duplicates cleared before the migration will apply.

## Phase 2: database baseline and enums

### Migrations
- The hand-written `.sql` files in `api/prisma/migrations` had drifted from `schema.prisma` (for example, status `pending` instead of `new`, a `photo` table instead of `report_photo`, missing tables). They are replaced by one Prisma migration, `0_init`, generated from the schema. CI now builds its test database with `prisma migrate deploy` and fails if the migrations differ from `schema.prisma`.
- Existing local databases don't match the baseline. Recreate them with `cd api && npx prisma migrate reset`, which **deletes all data** in that database.

### Enums
- `user_account.role`, `report.type`, `report.severity`, `report.status`, `report_status_history.from_status`/`to_status` and `device_token.platform` are now Postgres enums, so the database rejects values outside the allowed lists. Before, they were free text with no constraint.
- `GET /admin/users?role=` validates `role` (`citizen`, `officer`, `admin`); any other value returns 400. Before, an unknown role returned an empty list.

## Phase 3: API and web

### Staff comments
- Fixed: `POST /admin/reports/:id/comments` took `authorId` from the request body, so staff could post comments as anyone (and, since clients never sent it, real staff comments had no author). The author and the audit entry now come from the session; a body `authorId` is ignored.
- Officers can only comment on reports they can see (triage queue + their assignments), the same rule as `GET /admin/reports/:id`; others get 404.

### Notifications
- In-app, push and SSE notifications are sent after the response by an in-process dispatcher, so slow or failing push delivery no longer delays or fails requests. Delivery is best-effort (as before); on SIGTERM/SIGINT the server stops accepting requests and finishes queued notifications before exiting.
- Push: one device-token query per notification and Expo requests batched at 100 messages with a 10 s timeout (was one query + one unbounded request per recipient).
- The citizen comment notification now also goes out over SSE, like the other notification types.
- Assigning a report (manually or with auto-assign) now notifies the reporter that it is `assigned`, like every other status change. The assigned officer gets only "Report Assigned to You", not a second status notification. Auto-assign now also sends the officer that notification; before, it notified no one. Re-assigning a report that is already past triage changes no status, so the reporter isn't told.

### Geocoding (Nominatim)
- Requests to Nominatim are serialized and spaced at least 1 s apart, per its usage policy (reverse geocoding used to fire 3 requests 100 ms apart), with an 8 s timeout.
- Results are cached (Redis when configured, otherwise a bounded in-memory LRU of 5,000 entries): reverse lookups for 7 days per ~11 m cell, forward lookups for 24 h (1 h for no results). Failures are not cached.
- `/geocoding/reverse` and `/geocoding/forward` are rate limited to 60 requests per minute per client IP.

### Validation
- Route validation uses shared `parseOrThrow` / `assertUuid` helpers (`api/src/utils/validation.ts`). The error envelope is unchanged: `{ error: { code, message, details?, requestId } }`.

## Phase 3: mobile auth

### Token storage
- The mobile session token is now stored with `expo-secure-store` (iOS Keychain / Android Keystore) instead of plaintext `AsyncStorage`. Web builds, where SecureStore doesn't exist, still use `AsyncStorage`.
- Upgrading users stay signed in: the first read moves an existing `AsyncStorage` token into SecureStore and deletes the plaintext copy. Saving a new token or logging out also removes any leftover plaintext copy.
- `expo-secure-store` is a native module: standalone and dev-client builds need a rebuild (Expo Go already includes it).

### Social login
- `apiClient.loginWithGoogle` / `loginWithApple` now exist (they call `POST /auth/google` and `/auth/apple` and store the session). Before, `useAuth` called methods that didn't exist. There is still no Google/Apple button in the mobile UI; wiring one up needs OAuth client IDs.

## Phase 2: report status integrity and staff visibility

### Who changed a status
- `PATCH /admin/reports/:id/status` no longer accepts `changedBy` from the request body (it is silently ignored). The status history and audit log always record the authenticated user. Before this change, clients never sent the field, so every history row had `changed_by = NULL`.
- Status changes made by assigning a report (manual and auto-assign) now record the admin who assigned it.
- Every status change writes an `audit_log` row (`report_status_changed`, with `fromStatus`, `toStatus` and `source`) in the same transaction as the status update. Before, the admin endpoint wrote none.

### One status service (`api/src/services/reportStatusService.ts`)
- All status changes go through it: both PATCH endpoints, assign and auto-assign.
- Allowed transitions:

  | From | To | Who |
  |---|---|---|
  | new | triaged, rejected | admin or officer |
  | triaged | rejected | admin or officer |
  | new, triaged | assigned | **only by assigning the report** (admin) |
  | assigned | in_progress | the assigned officer, or an admin |
  | in_progress | resolved | the assigned officer, or an admin |
  | assigned, in_progress | rejected | admin |
  | resolved, rejected | triaged (reopen) | admin |

- "Assigned officer" means the assignee on the report's **latest** assignment. A report assigned only to an organization can be moved on only by an admin.
- Errors: `409 INVALID_TRANSITION` (transition not allowed, or the report is already in that status), `403 NOT_ASSIGNED` / `403 FORBIDDEN_TRANSITION`, and `409 STATUS_CONFLICT` if the status changed between the read and the write (concurrent update).
- A legacy status outside the list above (e.g. `pending`) can be changed only by an admin.
- Assigning a report now creates the assignment and the status change in one transaction.

### Staff visibility
- On `GET /admin/reports` and `GET /admin/reports/:id`, officers only see reports in `new`/`triaged` (the triage queue) plus reports that have ever been assigned to them. Other reports return 404 on the detail route. Admins are unaffected. Before, officers could list every report, including reporter contact details, and "my reports" was filtered in the browser.

### Public GETs
- `GET /reports` and `GET /reports/:id/confirmations` now read the session when one is sent (anonymous access is unchanged, and an invalid token is treated as anonymous).
- Fixed: `GET /reports?myReports=true` ignored the session and returned **everyone's** reports (mobile "My Reports"). It now returns only the caller's reports, or `401` without a session.
- Fixed: `userConfirmed` on `/reports/:id/confirmations` was always `false`.

### Clients
- Web: the status menu and quick actions only offer transitions the user is allowed (`lib/report-status.ts` mirrors the API table). Bulk status updates report "updated N, skipped M" instead of failing as a whole.
- Mobile: the officer quick action only appears for `assigned` (start) and `in_progress` (complete). Officers opening a report outside their scope fall back to the public view.

## Phase 1: auth hardening

### Sessions
- JWTs now expire after 7 days (`exp` claim; cookie `Max-Age` matches).
- JWTs carry a `tv` claim that must equal `user_account.token_version` (new column, migration `20261120000000_add_user_token_version`). Bumping it revokes every token issued to that user. It is bumped by `POST /auth/logout-all` (new), password reset, an admin setting a user's password, and an OAuth sign-in taking over an unverified account.
- **One-time forced re-login:** tokens issued before this release have no `tv` and are rejected. Every user has to sign in again after the deploy.
- The authenticated user's `role` and `email` are read from the database on every request, so role changes take effect immediately instead of when the token expires.
- When both are present, the `Authorization: Bearer` header now takes precedence over the `token` cookie.

### OTP codes
- Codes come from `crypto.randomInt` and are stored hashed (SHA-256), in Redis when `REDIS_URL` is set.
- Each code allows 5 wrong attempts, then it is invalidated. A correct code works once.
- Fixed: with `REDIS_URL` set, `/auth/verify-otp` always failed (codes were written to Redis and read from memory).
- `/auth/send-otp` returns the same message whether or not the account exists.
- Fixed: an SMS code could mark the **email** as verified. If a phone was given at registration the code went by SMS, yet `verify-otp {email, code}` set `emailVerified`, so anyone could "verify" an email they don't own. Now registration always emails the code, `send-otp` uses email whenever one is given (SMS only for phone-only requests), and `verify-otp` marks only the channel the code was sent to. A phone-only verification returns no session while the email is unverified (`requiresEmailVerification: true`), the same rule as password login.

### Password reset
- `POST /auth/password-reset/request` now actually emails the code (SendGrid). Production requires `SENDGRID_API_KEY` and `FROM_EMAIL`.
- A successful reset marks the email verified and revokes all sessions.

### Rate limiting
- `@fastify/rate-limit`, per client IP, shared through Redis when configured: login 20/15min, register 10/h, Google/Apple 20/15min, send-code endpoints 5/15min, verify-code endpoints 10/15min, `POST /reports` 10/15min, SSE tickets 30/5min.
- Client IP comes from `X-Forwarded-For` only when `TRUST_PROXY` is set. Previously the header was trusted unconditionally, so anyone could bypass the limit.
- 429 body: `{ error: { code: 'RATE_LIMIT_EXCEEDED', message, details: { retryAfter }, requestId } }` plus a `Retry-After` header (`POST /reports` used to return `resetAt`).

### OAuth account takeover
- Previously an attacker could register with a victim's email (unverified, attacker-chosen password and phone). When the victim later signed in with Google or Apple, the account was linked and verified, and the attacker kept password and phone access. Now, when a provider sign-in links to an **unverified** account, the password, phone and existing sessions are cleared. Linking to a verified account is unchanged.
- Apple sign-in now requires `email_verified`.

### Emails
- New accounts store emails lowercased and trimmed. Lookups are case-insensitive, so existing mixed-case rows still match. No data migration.
- Accounts created via `POST /admin/users` are marked `emailVerified` (they could not log in before, because password login requires verification).

### SSE
- `GET /notifications/stream?token=<JWT>` is no longer accepted: long-lived JWTs in URLs end up in proxy and access logs. Clients call `POST /notifications/stream-ticket` (authenticated) and open `/notifications/stream?ticket=<ticket>`. A ticket is single-use and valid for 60 seconds. Cookie or Bearer auth without a ticket still works.
- An open SSE connection is not closed when the user's sessions are revoked. It ends on the next reconnect.


## Breaking API changes

### Authentication required
- All `/admin/*` routes now require authentication and role checks
- `PATCH /reports/:id/status` requires `admin` or `officer` role
- Photo upload/delete requires authentication and ownership/staff role
- `POST /reports` ignores `reporterId` in body; uses JWT when present

### Auth behavior
- Email/password login requires `emailVerified: true`
- OAuth tokens are cryptographically verified (Google ID token, Apple JWKS)
- Password reset OTP is no longer logged or returned in API responses

### Error responses
- Production errors no longer include stack traces in `details`

## Client migration

### Web
- Send `credentials: 'include'` on all authenticated requests (already implemented in `lib/api.ts`)
- Set `JWT_SECRET` for middleware route protection
- Bearer token in `localStorage` remains supported as fallback

### Mobile
- Continue sending `Authorization: Bearer <token>` header
- Ensure admin/officer flows include token on all admin endpoints

## Environment requirements

Production startup fails without `JWT_SECRET` and `COOKIE_SECRET` (min 32 chars).

Optional `REDIS_URL` enables distributed OTP and rate limiting.
