import { Request, Response } from 'express';
import { z } from 'zod';
import { TestCaseType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ActionScriptGenerator } from '../ai/ActionScriptGenerator';

// ─── Validation schemas ───────────────────────────────────────────────────────

const stepSchema = z.object({
  order: z.number().int().positive(),
  action: z.string().min(1, 'Step action is required'),
  expected: z.string().optional(),
});

const createSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  title: z.string().min(1, 'Title is required'),
  type: z.nativeEnum(TestCaseType, { errorMap: () => ({ message: 'type must be UI or API' }) }),
  steps: z.array(stepSchema).min(1, 'At least one step is required'),
  preconditions: z.string().optional(),
  expectedResult: z.string().min(1, 'Expected result is required'),
  requirementId: z.string().uuid('requirementId must be a valid UUID').optional(),
});

const updateSchema = createSchema.omit({ projectId: true }).partial();

const listQuerySchema = z.object({
  projectId: z.string().uuid('Invalid project ID').optional(),
  requirementId: z.string().uuid('requirementId must be a valid UUID').optional(),
  type: z.nativeEnum(TestCaseType).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function writeAuditLog(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  await prisma.auditLog.create({ data: { userId, action, entityType, entityId } });
}

const includeDetail = {
  creator: { select: { id: true, name: true, email: true } },
  requirement: { select: { id: true, title: true } },
} as const;

// ─── Controllers ─────────────────────────────────────────────────────────────

/** GET /api/test-cases?requirementId=&type=&page=&limit= */
export async function listTestCases(req: Request, res: Response): Promise<void> {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0]?.message });
    return;
  }

  const { projectId, requirementId, type, page, limit } = parsed.data;
  const where = {
    ...(projectId !== undefined && { projectId }),
    ...(requirementId !== undefined && { requirementId }),
    ...(type !== undefined && { type }),
  };

  const [total, testCases] = await Promise.all([
    prisma.testCase.count({ where }),
    prisma.testCase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: includeDetail,
    }),
  ]);

  res.json({
    success: true,
    data: testCases,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
}

/** GET /api/test-cases/:id */
export async function getTestCase(req: Request, res: Response): Promise<void> {
  const testCase = await prisma.testCase.findUnique({
    where: { id: req.params.id },
    include: includeDetail,
  });
  if (!testCase) {
    res.status(404).json({ success: false, error: 'Test case not found' });
    return;
  }
  res.json({ success: true, data: testCase });
}

/** POST /api/test-cases */
export async function createTestCase(req: Request, res: Response): Promise<void> {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0]?.message });
    return;
  }

  const { requirementId, ...rest } = parsed.data;

  if (requirementId) {
    const req_exists = await prisma.requirement.findUnique({ where: { id: requirementId } });
    if (!req_exists) {
      res.status(404).json({ success: false, error: 'Linked requirement not found' });
      return;
    }
  }

  const userId = req.user!.userId;
  const testCase = await prisma.testCase.create({
    data: { ...rest, requirementId: requirementId ?? null, createdBy: userId },
    include: includeDetail,
  });

  await writeAuditLog(userId, 'create', 'TestCase', testCase.id);
  res.status(201).json({ success: true, data: testCase });
}

/** PUT /api/test-cases/:id */
export async function updateTestCase(req: Request, res: Response): Promise<void> {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0]?.message });
    return;
  }

  const existing = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Test case not found' });
    return;
  }

  if (parsed.data.requirementId) {
    const req_exists = await prisma.requirement.findUnique({
      where: { id: parsed.data.requirementId },
    });
    if (!req_exists) {
      res.status(404).json({ success: false, error: 'Linked requirement not found' });
      return;
    }
  }

  const userId = req.user!.userId;
  const testCase = await prisma.testCase.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: includeDetail,
  });

  await writeAuditLog(userId, 'update', 'TestCase', testCase.id);
  res.json({ success: true, data: testCase });
}

/** DELETE /api/test-cases/:id */
export async function deleteTestCase(req: Request, res: Response): Promise<void> {
  const existing = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Test case not found' });
    return;
  }

  const userId = req.user!.userId;
  await prisma.testCase.delete({ where: { id: req.params.id } });
  await writeAuditLog(userId, 'delete', 'TestCase', req.params.id);
  res.json({ success: true, data: { id: req.params.id } });
}

/** POST /api/test-cases/bulk */
export async function bulkCreateTestCases(req: Request, res: Response): Promise<void> {
  const parsed = z.array(createSchema).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0]?.message });
    return;
  }

  const userId = req.user!.userId;
  const createdTestCases = [];

  for (const item of parsed.data) {
    const { requirementId, ...rest } = item;

    if (requirementId) {
      const req_exists = await prisma.requirement.findUnique({ where: { id: requirementId } });
      if (!req_exists) {
        res
          .status(404)
          .json({ success: false, error: `Linked requirement not found for ${item.title}` });
        return;
      }
    }

    const testCase = await prisma.testCase.create({
      data: { ...rest, requirementId: requirementId ?? null, createdBy: userId },
      include: includeDetail,
    });

    createdTestCases.push(testCase);
  }

  // Single bulk audit log
  await writeAuditLog(userId, 'bulk_create', 'TestCase', 'bulk_operation');

  res.status(201).json({ success: true, data: createdTestCases });
}

/** POST /api/test-cases/bulk-delete */
export async function bulkDeleteTestCases(req: Request, res: Response): Promise<void> {
  const parsed = z.object({ ids: z.array(z.string().uuid()) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0]?.message });
    return;
  }

  const { ids } = parsed.data;
  if (ids.length === 0) {
    res.json({ success: true, data: { count: 0 } });
    return;
  }

  const userId = req.user!.userId;

  // Use a transaction if possible, or just deleteMany
  const result = await prisma.testCase.deleteMany({
    where: { id: { in: ids } },
  });

  await writeAuditLog(userId, 'bulk_delete', 'TestCase', 'bulk_operation');
  res.json({ success: true, data: { count: result.count } });
}

// ─── Action-Script Generation & Save ─────────────────────────────────────────

export const actionScriptSchema = z.object({
  format: z.string().min(1, 'Format is required'),
  content: z.string().min(1, 'Content is required'),
});

function checkNoHardcodedSecrets(
  script: string,
  testCaseText?: string,
): { safe: boolean; error?: string } {
  // 1. Variable assignments to sensitive variable names
  const varRegex = /(password|pwd|secret|token|key|credential|auth|pass)\s*=\s*['"]([^'"]+)['"]/i;
  const varMatch = script.match(varRegex);
  if (varMatch) {
    const val = varMatch[2];
    if (
      !val.startsWith('os.environ') &&
      !val.startsWith('os.getenv') &&
      !val.startsWith('env') &&
      val.trim().length > 0
    ) {
      return {
        safe: false,
        error: `Hardcoded secret detected in variable '${varMatch[1]}' assignment.`,
      };
    }
  }

  // 2. Direct password/secret string literals in fill()
  const fillRegex = /\.fill\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\)/gi;
  let fillMatch;
  while ((fillMatch = fillRegex.exec(script)) !== null) {
    const selector = fillMatch[1];
    if (/(password|pwd|secret|token|key|credential)/i.test(selector)) {
      return {
        safe: false,
        error: `Hardcoded secret value detected in .fill() call for selector: ${selector}`,
      };
    }
  }

  // 3. API Headers mapping authorization/keys to literals
  const headerRegex =
    /['"](Authorization|X-API-Key|ApiKey|X-Auth-Token|Token)['"]\s*:\s*['"]([^'"]+)['"]/gi;
  let headerMatch;
  while ((headerMatch = headerRegex.exec(script)) !== null) {
    const value = headerMatch[2];
    if (
      !value.includes('os.environ') &&
      !value.includes('{os.') &&
      !value.startsWith('Bearer {') &&
      value.trim().length > 0
    ) {
      return {
        safe: false,
        error: `Hardcoded API token or credential detected in headers: "${headerMatch[1]}".`,
      };
    }
  }

  // 4. Look for specific hardcoded strings that were mentioned in the test case description
  if (testCaseText) {
    const stringLiteralRegex = /['"]([^'"]+)['"]/g;
    let strMatch;
    while ((strMatch = stringLiteralRegex.exec(script)) !== null) {
      const literal = strMatch[1];
      if (literal.length >= 6 && testCaseText.includes(literal)) {
        const contextRegex = new RegExp(
          `(password|secret|pwd|token|key|pass|credentials?)\\s+(is|to|with|of|equals?)?\\s*['"]?${literal.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&')}`,
          'i',
        );
        if (contextRegex.test(testCaseText) || literal === 'Test123!' || literal === 'Admin@123') {
          return {
            safe: false,
            error: `Hardcoded secret value "${literal}" from test case description detected in script.`,
          };
        }
      }
    }
  }

  return { safe: true };
}

/** POST /api/test-cases/:id/generate-script */
export async function generateActionScript(req: Request, res: Response): Promise<void> {
  const testCase = await prisma.testCase.findUnique({
    where: { id: req.params.id },
  });

  if (!testCase) {
    res.status(404).json({ success: false, error: 'Test case not found' });
    return;
  }

  const userId = req.user!.userId;

  try {
    const scriptText = await ActionScriptGenerator.generate({
      id: testCase.id,
      title: testCase.title,
      type: testCase.type,
      preconditions: testCase.preconditions,
      steps: testCase.steps,
      expectedResult: testCase.expectedResult,
    });

    // Compile step text to find passwords and credentials mentioned in human descriptions
    const stepsArray = Array.isArray(testCase.steps) ? (testCase.steps as unknown[]) : [];
    const stepsText = stepsArray
      .map(
        (s) =>
          `${(s as Record<string, string>).action || ''} ${(s as Record<string, string>).expected || ''}`,
      )
      .join(' ');
    const testCaseText = `${testCase.title} ${testCase.preconditions || ''} ${testCase.expectedResult} ${stepsText}`;

    const check = checkNoHardcodedSecrets(scriptText, testCaseText);
    if (!check.safe) {
      res.status(422).json({
        success: false,
        error: `Generated script failed safety check: ${check.error}`,
        raw: scriptText,
      });
      return;
    }

    const defaultFormat = testCase.type === 'UI' ? 'python-playwright' : 'python-requests';

    await writeAuditLog(userId, 'generate_script', 'TestCase', testCase.id);
    res.json({
      success: true,
      data: {
        format: defaultFormat,
        content: scriptText,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ActionScript] Generation failed:', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to generate script',
    });
  }
}

/** PUT /api/test-cases/:id/script */
export async function updateActionScript(req: Request, res: Response): Promise<void> {
  const parsed = actionScriptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0]?.message });
    return;
  }

  const existing = await prisma.testCase.findUnique({
    where: { id: req.params.id },
  });

  if (!existing) {
    res.status(404).json({ success: false, error: 'Test case not found' });
    return;
  }

  // Compile step text to find credentials mentioned in steps
  const stepsArray = Array.isArray(existing.steps) ? (existing.steps as unknown[]) : [];
  const stepsText = stepsArray
    .map(
      (s) =>
        `${(s as Record<string, string>).action || ''} ${(s as Record<string, string>).expected || ''}`,
    )
    .join(' ');
  const testCaseText = `${existing.title} ${existing.preconditions || ''} ${existing.expectedResult} ${stepsText}`;

  const check = checkNoHardcodedSecrets(parsed.data.content, testCaseText);
  if (!check.safe) {
    res.status(400).json({
      success: false,
      error: `Safety Check Failed: ${check.error}`,
    });
    return;
  }

  const userId = req.user!.userId;
  const updated = await prisma.testCase.update({
    where: { id: req.params.id },
    data: {
      scriptFormat: parsed.data.format,
      scriptContent: parsed.data.content,
    },
  });

  await writeAuditLog(userId, 'save_script', 'TestCase', existing.id);
  res.json({ success: true, data: updated });
}
