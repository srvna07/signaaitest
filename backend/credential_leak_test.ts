/**
 * credential_leak_test.ts
 *
 * Security proof test: runs a real MCP exploration session and verifies that
 * the real credential values NEVER appear in any console.log output.
 *
 * Run with:
 *   npx ts-node --transpile-only credential_leak_test.ts
 *
 * What this does:
 *   1. Reads real decrypted credential values from the DB (same as production)
 *   2. Monkey-patches console.log/error to capture ALL output during the session
 *   3. Runs a real McpAgentExplorer session (multi-turn, with login)
 *   4. Searches the captured output for the literal password and username strings
 *   5. Prints PASS or FAIL with evidence
 *
 * DELETE this file after running.
 */

import * as crypto from 'crypto';
import { prisma } from './src/config/prisma';
import { decryptSecret } from './src/utils/crypto';
import { McpAgentExplorer, generateTestCasesFromTranscript } from './src/browser/McpAgentExplorer';

// ─── Capture console output ───────────────────────────────────────────────────

const capturedLines: string[] = [];

const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;

function captureOutput(level: string, args: unknown[]): void {
  const line = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  capturedLines.push(`[${level}] ${line}`);
}

console.log = (...args: unknown[]) => {
  captureOutput('LOG', args);
  origLog(...args);
};
console.error = (...args: unknown[]) => {
  captureOutput('ERR', args);
  origError(...args);
};
console.warn = (...args: unknown[]) => {
  captureOutput('WARN', args);
  origWarn(...args);
};

// ─── Main test ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  origLog('\n═══════════════════════════════════════════════════════════');
  origLog('  CREDENTIAL LEAK SECURITY TEST');
  origLog('═══════════════════════════════════════════════════════════\n');

  // 1. Resolve environment + credentials from DB
  const environment = await prisma.environment.findFirst({ where: { requiresLogin: true } });
  if (!environment) {
    origLog('❌ No environment with requiresLogin=true found. Skipping test.');
    process.exit(0);
  }

  origLog(`Target environment: "${environment.name}" (${environment.baseUrl})`);

  const secrets = await prisma.secret.findMany({ where: { environmentId: environment.id } });

  let realUsername = '';
  let realPassword = '';
  for (const s of secrets) {
    const val = decryptSecret(s.encryptedValue);
    if (/username|user/i.test(s.name)) realUsername = val;
    if (/password|pass/i.test(s.name)) realPassword = val;
  }

  if (!realPassword) {
    origLog('❌ Could not resolve a real password from secrets. Check secret names contain "password" or "pass".');
    await prisma.$disconnect();
    process.exit(1);
  }

  origLog(`Resolved credentials: username="${realUsername.substring(0, 3)}..." password="${realPassword.substring(0, 3)}..." (${realPassword.length} chars)`);
  origLog('\n--- Starting exploration. All console output is captured. ---\n');

  // 2. Pick any requirement from this environment's project
  const requirement = await prisma.requirement.findFirst({
    where: { project: { environments: { some: { id: environment.id } } } },
  });

  const testUser = await prisma.user.findFirst();

  if (!requirement || !testUser) {
    origLog('❌ No requirement or user found. Create one first.');
    await prisma.$disconnect();
    process.exit(1);
  }

  origLog(`Using requirement: "${requirement.title}", User ID: ${testUser.id}`);

  const explorer = new McpAgentExplorer();
  const statusLog: string[] = [];

  let explorationDone = false;
  let explorationError: Error | null = null;

  try {
    await explorer.start();

    const requirementText = `Title: ${requirement.title}\nDescription: ${requirement.description ?? ''}`;

    const result = await explorer.explore({
      requirementText,
      baseUrl: environment.baseUrl,
      targetPath: environment.loginPath ?? '/',
      scope: 'BOTH',
      environmentId: environment.id,
      loginUsername: realUsername,
      loginPassword: realPassword,
      userId: testUser.id,
      onStatus: (msg) => {
        statusLog.push(msg);
        origLog(`  [STATUS] ${msg}`);
      },
    });

    explorationDone = true;
    origLog(`\nExploration complete: ${result.turns} turns, cutShort=${result.cutShort}`);

    await generateTestCasesFromTranscript(requirementText, result, 'BOTH');
    origLog('Test cases generated successfully.');
  } catch (err) {
    explorationError = err instanceof Error ? err : new Error(String(err));
    origLog(`\nExploration error (may be expected if no MCP server available): ${explorationError.message}`);
  } finally {
    await explorer.stop().catch(() => {});
    await prisma.$disconnect();
  }

  // ─── 3. Audit the captured output ─────────────────────────────────────────

  origLog('\n═══════════════════════════════════════════════════════════');
  origLog('  AUDIT RESULTS');
  origLog('═══════════════════════════════════════════════════════════\n');

  const fullOutput = capturedLines.join('\n');

  // Check for real password in any log line
  const passwordLeakLines = capturedLines.filter((line) => line.includes(realPassword));
  const usernameLeakLines = capturedLines.filter((line) => line.includes(realUsername));

  // Check for SECURITY intercept messages appearing
  const interceptLines = capturedLines.filter((line) =>
    line.includes('SECURITY: Intercepted') || line.includes('Intercepted password') || line.includes('Intercepted username'),
  );

  // Check for [REDACTED] lines
  const redactedLines = capturedLines.filter((line) => line.includes('[REDACTED'));

  origLog('--- Captured output line count:', capturedLines.length);
  origLog('--- Lines mentioning [REDACTED]:', redactedLines.length);
  if (redactedLines.length > 0) {
    redactedLines.forEach((l) => origLog('    >', l));
  }

  origLog('--- SECURITY intercept lines:', interceptLines.length);
  if (interceptLines.length > 0) {
    interceptLines.forEach((l) => origLog('    >', l));
  }

  origLog('\n');

  let passed = true;

  if (passwordLeakLines.length > 0) {
    origLog(`❌ FAIL — Real PASSWORD found in ${passwordLeakLines.length} log line(s):`);
    passwordLeakLines.forEach((l) => origLog('  LEAK:', l.replace(realPassword, '[<<REAL_PASSWORD>>]')));
    passed = false;
  } else {
    origLog('✅ PASS — Real PASSWORD value: 0 occurrences in all captured output');
  }

  if (usernameLeakLines.length > 0) {
    origLog(`❌ FAIL — Real USERNAME found in ${usernameLeakLines.length} log line(s):`);
    usernameLeakLines.forEach((l) => origLog('  LEAK:', l.replace(realUsername, '[<<REAL_USERNAME>>]')));
    passed = false;
  } else {
    origLog('✅ PASS — Real USERNAME value: 0 occurrences in all captured output');
  }

  if (!explorationDone && explorationError) {
    origLog(`\n⚠  Exploration did not complete (${explorationError.message})`);
    origLog('   The leak test is PARTIAL — no actual browser_type calls were made.');
    origLog('   Run against a reachable target URL with auto-login to get full coverage.');
    passed = false;
  } else {
    if (interceptLines.length === 0) {
      origLog('\n❌ FAIL — No SECURITY intercept lines detected.');
      origLog('   The security mechanism never engaged (likely because the AI failed or did not reach a login page).');
      origLog('   This is a VACUOUS PASS. The test MUST see an interception to verify safety.');
      passed = false;
    }
  }

  origLog('\n─── Full captured output (for manual review) ──────────────────────\n');
  // Print the full captured log with real values masked
  const maskedOutput = fullOutput
    .replace(new RegExp(realPassword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[<<REAL_PASSWORD_MASKED>>]')
    .replace(new RegExp(realUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[<<REAL_USERNAME_MASKED>>]');
  origLog(maskedOutput);

  origLog('\n═══════════════════════════════════════════════════════════');
  origLog(passed ? '  OVERALL: ✅ PASS — Interceptions fired and no credential leak detected' : '  OVERALL: ❌ FAIL — Security constraints not met or leak found');
  origLog('═══════════════════════════════════════════════════════════\n');

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  origError('Test setup failed:', err);
  process.exit(1);
});
