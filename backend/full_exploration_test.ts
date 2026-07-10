import { prisma } from './src/config/prisma';
import { decryptSecret } from './src/utils/crypto';
import { McpAgentExplorer, generateTestCasesFromTranscript } from './src/browser/McpAgentExplorer';

async function main(): Promise<void> {
  console.log('\n===============================================================');
  console.log('  FULL END-TO-END EXPLORATION & TEST CASE GENERATION TEST');
  console.log('===============================================================\n');

  const environment = await prisma.environment.findFirst({ where: { requiresLogin: true } });
  if (!environment) throw new Error('No environment with requiresLogin=true found.');
  const secrets = await prisma.secret.findMany({ where: { environmentId: environment.id } });

  let realUsername = '';
  let realPassword = '';
  for (const s of secrets) {
    const val = decryptSecret(s.encryptedValue);
    if (/username|user/i.test(s.name)) realUsername = val;
    if (/password|pass/i.test(s.name)) realPassword = val;
  }

  const requirement = await prisma.requirement.findFirst({
    where: { project: { environments: { some: { id: environment.id } } } },
  });
  const testUser = await prisma.user.findFirst();

  if (!requirement || !testUser) throw new Error('Missing requirement or user in DB.');

  console.log(`Starting exploration for requirement: "${requirement.title}" in environment: "${environment.name}"`);

  const explorer = new McpAgentExplorer();
  try {
    await explorer.start();

    const requirementText = `Title: ${requirement.title}\nDescription: ${requirement.description ?? ''}`;
    
    // Pass the actual credentials and valid userId
    const result = await explorer.explore({
      requirementText,
      baseUrl: environment.baseUrl,
      targetPath: environment.loginPath ?? '/',
      scope: 'BOTH',
      environmentId: environment.id,
      loginUsername: realUsername,
      loginPassword: realPassword,
      userId: testUser.id,
      onStatus: (msg) => console.log(`  [STATUS] ${msg}`),
    });

    console.log(`\n✅ Exploration finished.`);
    console.log(`   Turns taken: ${result.turns}`);
    console.log(`   Cut short? ${result.cutShort} (Reason: ${result.reason || 'None'})`);
    console.log(`\n--- TRANSCRIPT EXCERPT (last 1000 chars) ---`);
    console.log(result.transcript?.slice(-1000) ?? 'No transcript available');
    console.log(`--------------------------------------------\n`);

    console.log(`[STATUS] Generating Test Cases from transcript...`);
    const testCases = await generateTestCasesFromTranscript(requirementText, result, 'BOTH');
    
    console.log('\n✅ Test Cases Generated successfully!');
    console.log(JSON.stringify(testCases, null, 2));

  } catch (err) {
    console.error('Exploration failed:', err);
  } finally {
    await explorer.stop().catch(() => {});
    await prisma.$disconnect();
  }
}

main();
