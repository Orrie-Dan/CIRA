-- Session revocation: JWTs carry a "tv" claim that must match this column.
-- Bumping it (logout-all, password reset) invalidates every issued token.
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
