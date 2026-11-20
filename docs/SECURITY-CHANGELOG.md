# Security Changelog

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
