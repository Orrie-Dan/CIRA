-- One account per phone number (numbers are stored normalized to E.164 by the API).
-- Fails if two existing rows share a phone; clear the duplicates first.
-- CreateIndex
CREATE UNIQUE INDEX "user_account_phone_key" ON "user_account"("phone");
