import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';

// ─── Validation schemas ───────────────────────────────────────────────────────

const createSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
});

const updateSchema = createSchema.partial();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function writeAuditLog(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  await prisma.auditLog.create({ data: { userId, action, entityType, entityId } });
}

/** Attach _count.testCases as a `coverage` field on each requirement row. */
function withCoverage<T extends { _count: { testCases: number } }>(
  row: T,
): Omit<T, '_count'> & { coverage: number } {
  const { _count, ...rest } = row;
  return { ...rest, coverage: _count.testCases };
}

const includeCreator = { creator: { select: { id: true, name: true, email: true } } } as const;
const includeCount = { _count: { select: { testCases: true } } } as const;

// ─── Controllers ─────────────────────────────────────────────────────────────

/** GET /api/requirements */
export async function listRequirements(_req: Request, res: Response): Promise<void> {
  const rows = await prisma.requirement.findMany({
    orderBy: { createdAt: 'desc' },
    include: { ...includeCreator, ...includeCount },
  });
  res.json({ success: true, data: rows.map(withCoverage) });
}

/** GET /api/requirements/:id */
export async function getRequirement(req: Request, res: Response): Promise<void> {
  const row = await prisma.requirement.findUnique({
    where: { id: req.params.id },
    include: { ...includeCreator, ...includeCount },
  });
  if (!row) {
    res.status(404).json({ success: false, error: 'Requirement not found' });
    return;
  }
  res.json({ success: true, data: withCoverage(row) });
}

/** POST /api/requirements */
export async function createRequirement(req: Request, res: Response): Promise<void> {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0]?.message });
    return;
  }

  const userId = req.user!.userId;
  const row = await prisma.requirement.create({
    data: { ...parsed.data, createdBy: userId },
    include: { ...includeCreator, ...includeCount },
  });

  await writeAuditLog(userId, 'create', 'Requirement', row.id);
  res.status(201).json({ success: true, data: withCoverage(row) });
}

/** PUT /api/requirements/:id */
export async function updateRequirement(req: Request, res: Response): Promise<void> {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0]?.message });
    return;
  }

  const existing = await prisma.requirement.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Requirement not found' });
    return;
  }

  const userId = req.user!.userId;
  const row = await prisma.requirement.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: { ...includeCreator, ...includeCount },
  });

  await writeAuditLog(userId, 'update', 'Requirement', row.id);
  res.json({ success: true, data: withCoverage(row) });
}

/** DELETE /api/requirements/:id */
export async function deleteRequirement(req: Request, res: Response): Promise<void> {
  const existing = await prisma.requirement.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Requirement not found' });
    return;
  }

  const userId = req.user!.userId;
  await prisma.requirement.delete({ where: { id: req.params.id } });
  await writeAuditLog(userId, 'delete', 'Requirement', req.params.id);
  res.json({ success: true, data: { id: req.params.id } });
}

/** POST /api/requirements/:id/generate-test-cases */
export async function generateTestCases(req: Request, res: Response): Promise<void> {
  const requirementId = req.params.id;
  const existing = await prisma.requirement.findUnique({ where: { id: requirementId } });

  if (!existing) {
    res.status(404).json({ success: false, error: 'Requirement not found' });
    return;
  }

  const userId = req.user!.userId;
  await writeAuditLog(userId, 'generate_test_cases', 'Requirement', requirementId);

  // Requirement payload for AI
  const requirementText = `Title: ${existing.title}\nDescription: ${existing.description}`;

  try {
    const aiProvider = (await import('../ai/AIProviderFactory')).AIProviderFactory.getProvider();
    const suggestions = await aiProvider.generateTestCases(requirementText);

    res.json({ success: true, data: suggestions });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    // Only log that generation failed, not the full request/response to prevent leaks
    console.error(`AI generation failed for requirement ${requirementId}: ${msg}`); // eslint-disable-line no-console
    res.status(500).json({ success: false, error: msg || 'AI Generation failed' });
  }
}
