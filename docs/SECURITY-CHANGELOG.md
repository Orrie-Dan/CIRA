# Security Changelog

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
