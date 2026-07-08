import { Request, Response } from 'express';
import { z } from 'zod';
import { TestCaseType } from '@prisma/client';
import { prisma } from '../config/prisma';

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
