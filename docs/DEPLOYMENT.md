# CIRA Deployment Runbook

## Required secrets

### API (`api/`)
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — minimum 32 characters (required in production)
- `COOKIE_SECRET` — minimum 32 characters (required in production)
- `CORS_ORIGIN` — comma-separated frontend origins
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID` — OAuth verification
- `REDIS_URL` — optional; shares OTP codes, SSE tickets and rate-limit counters across instances. Required if you run more than one API instance. When set, Redis errors fail the request (no silent fallback to memory).
- `SENDGRID_API_KEY`, `FROM_EMAIL` — **required in production**: verification and password-reset codes are emailed through the SendGrid REST API. `FROM_EMAIL` must be a verified SendGrid sender. Optional `FROM_NAME` (default `CIRA`).
- `TWILIO_*` — optional SMS delivery for OTP codes
- `TRUST_PROXY` — number of reverse-proxy hops in front of the API (e.g. `1`), or `true`/a CIDR list. Rate limits key on the client IP, which comes from `X-Forwarded-For` only when this is set. Unset behind a proxy means every client shares the proxy's IP and therefore one rate-limit bucket; set too high means clients can spoof their IP. Verify after deploy (see below).

### Web (root)
- `NEXT_PUBLIC_API_BASE_URL` — API base URL
- `JWT_SECRET` — same value as API (server-side middleware only)

### Mobile (`mobile/`)
- `EXPO_PUBLIC_API_BASE_URL` — API base URL

## Deploy sequence

1. Run database migrations: `cd api && pnpm prisma:deploy`
2. Create initial admin: `cd api && pnpm create-admin admin@example.com 'secure-password'`
3. Deploy API (Render/Docker): health check `GET /health`
4. Deploy web (Vercel): set env vars, build with `pnpm build`
5. Publish mobile via EAS after updating `EXPO_PUBLIC_API_BASE_URL`

## Post-deploy checks

- `GET /health` returns 200
- Unauthenticated `GET /admin/users` returns 401
- Citizen can `POST /reports` without auth
- Authenticated citizen report sets `reporterId` from JWT
- Web `/admin` redirects unauthenticated users to `/login`
- `TRUST_PROXY` is right: send two requests from different networks to `POST /auth/password-reset/request` and check that the logged `request completed` lines show different client IPs (not the load balancer's)
- Password reset email arrives (check SendGrid activity if not)

## API versioning

Current API is unversioned. If mobile and web release cycles diverge, introduce `/v1` prefix on new routes while keeping legacy paths during a deprecation window.
