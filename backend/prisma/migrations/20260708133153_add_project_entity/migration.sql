-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- Seed a default project
DO $$
DECLARE
    sys_user_id TEXT;
    proj_id TEXT := '00000000-0000-0000-0000-000000000000';
BEGIN
    SELECT id INTO sys_user_id FROM "users" ORDER BY "createdAt" ASC LIMIT 1;
    IF sys_user_id IS NULL THEN
        sys_user_id := 'system-user';
        INSERT INTO "users" (id, email, password, role, "updatedAt") VALUES (sys_user_id, 'system@signa.test', 'none', 'ADMIN', NOW());
    END IF;
    INSERT INTO "projects" (id, name, "created_by", "created_at", "updated_at") VALUES (proj_id, 'Default Project', sys_user_id, NOW(), NOW());
END $$;

-- AlterTable
ALTER TABLE "environments" ADD COLUMN "project_id" TEXT;
UPDATE "environments" SET "project_id" = '00000000-0000-0000-0000-000000000000';
ALTER TABLE "environments" ALTER COLUMN "project_id" SET NOT NULL;

ALTER TABLE "requirements" ADD COLUMN "project_id" TEXT;
UPDATE "requirements" SET "project_id" = '00000000-0000-0000-0000-000000000000';
ALTER TABLE "requirements" ALTER COLUMN "project_id" SET NOT NULL;

ALTER TABLE "secrets" ADD COLUMN "project_id" TEXT;
UPDATE "secrets" SET "project_id" = '00000000-0000-0000-0000-000000000000';
ALTER TABLE "secrets" ALTER COLUMN "project_id" SET NOT NULL;

ALTER TABLE "test_cases" ADD COLUMN "project_id" TEXT;
UPDATE "test_cases" SET "project_id" = '00000000-0000-0000-0000-000000000000';
ALTER TABLE "test_cases" ALTER COLUMN "project_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "secrets_project_id_idx" ON "secrets"("project_id");
CREATE INDEX "test_cases_project_id_idx" ON "test_cases"("project_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "environments" ADD CONSTRAINT "environments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
