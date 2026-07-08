import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // ── Admin user ──────────────────────────────────────────────────────────────
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@signa-ai.test' },
    update: { role: Role.ADMIN },
    create: {
      email: 'admin@signa-ai.test',
      password: await bcrypt.hash('Admin@1234', 12),
      name: 'Admin',
      role: Role.ADMIN,
    },
  });

  console.log(`✅ User seeded: ${adminUser.email} (id: ${adminUser.id})`); // eslint-disable-line no-console

  // ── Sample Environment ──────────────────────────────────────────────────────
  const localEnv = await prisma.environment.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'local',
      baseUrl: 'http://localhost:3000',
      variables: { Authorization: 'Bearer <token>', 'X-App-Version': '1.0.0' },
      createdBy: adminUser.id,
    },
  });

  console.log(`✅ Environment seeded: "${localEnv.name}" → ${localEnv.baseUrl}`); // eslint-disable-line no-console
}

main()
  .catch((err: unknown) => {
    console.error('❌ Seed failed:', err); // eslint-disable-line no-console
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
