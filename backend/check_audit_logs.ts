import { prisma } from './src/config/prisma';

async function main() {
  const logs = await prisma.auditLog.findMany({
    where: { action: { in: ['mcp_credential_intercept', 'mcp_auto_login'] } }
  });
  console.log('--- AUDIT LOG QUERY RESULTS ---');
  console.log('Count:', logs.length);
  if (logs.length > 0) {
    logs.forEach(l => console.log(`[${l.timestamp.toISOString()}] ${l.action} (User: ${l.userId})`));
  } else {
    console.log('No logs found for these actions.');
  }
  await prisma.$disconnect();
}

main().catch(console.error);
