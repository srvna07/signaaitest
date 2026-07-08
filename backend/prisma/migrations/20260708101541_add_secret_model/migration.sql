-- CreateTable
CREATE TABLE "secrets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "encrypted_value" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "secrets_environment_id_idx" ON "secrets"("environment_id");

-- CreateIndex
CREATE UNIQUE INDEX "secrets_name_environment_id_key" ON "secrets"("name", "environment_id");

-- AddForeignKey
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
