# CIRA Deployment Runbook

## Required secrets

### API (`api/`)
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — minimum 32 characters (required in production)
- `COOKIE_SECRET` — minimum 32 characters (required in production)
- `CORS_ORIGIN` — comma-separated frontend origins
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID` — OAuth verification
- `REDIS_URL` — optional; enables shared OTP and rate limiting across instances
- `SENDGRID_API_KEY`, `TWILIO_*` — optional OTP delivery channels

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

## API versioning

Current API is unversioned. If mobile and web release cycles diverge, introduce `/v1` prefix on new routes while keeping legacy paths during a deprecation window.
