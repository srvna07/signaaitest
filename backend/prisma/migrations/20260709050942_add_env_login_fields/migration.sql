-- Add auto-login fields to environments table
ALTER TABLE "environments" ADD COLUMN "requires_login" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "environments" ADD COLUMN "login_path" TEXT;
ALTER TABLE "environments" ADD COLUMN "login_username_secret" TEXT;
ALTER TABLE "environments" ADD COLUMN "login_password_secret" TEXT;