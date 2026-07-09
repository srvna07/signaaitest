import { Request, Response } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../config/prisma';

// ─── Validation schemas ───────────────────────────────────────────────────────

const createSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  name: z.string().min(1, 'Name is required'),
  baseUrl: z.string().url('baseUrl must be a valid URL'),
  variables: z.record(z.string()).optional().default({}),
  requiresLogin: z.boolean().optional().default(false),
  loginPath: z.string().optional().nullable(),
  loginUsernameSecret: z.string().optional().nullable(),
  loginPasswordSecret: z.string().optional().nullable(),
});

const updateSchema = createSchema.omit({ projectId: true }).partial();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function writeAuditLog(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  await prisma.auditLog.create({ data: { userId, action, entityType, entityId } });
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/** GET /api/environments */
export async function listEnvironments(req: Request, res: Response): Promise<void> {
  const projectId = req.query.projectId as string;
  const where = projectId ? { projectId } : {};

  const environments = await prisma.environment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { creator: { select: { id: true, name: true, email: true } } },
  });
  res.json({ success: true, data: environments });
}

/** GET /api/environments/:id */
export async function getEnvironment(req: Request, res: Response): Promise<void> {
  const env = await prisma.environment.findUnique({
    where: { id: req.params.id },
    include: { creator: { select: { id: true, name: true, email: true } } },
  });
  if (!env) {
    res.status(404).json({ success: false, error: 'Environment not found' });
    return;
  }
  res.json({ success: true, data: env });
}

/** POST /api/environments */
export async function createEnvironment(req: Request, res: Response): Promise<void> {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0]?.message });
    return;
  }

  const userId = req.user!.userId;
  const environment = await prisma.environment.create({
    data: { ...parsed.data, createdBy: userId },
    include: { creator: { select: { id: true, name: true, email: true } } },
  });

  await writeAuditLog(userId, 'create', 'Environment', environment.id);
  res.status(201).json({ success: true, data: environment });
}

/** PUT /api/environments/:id */
export async function updateEnvironment(req: Request, res: Response): Promise<void> {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0]?.message });
    return;
  }

  const existing = await prisma.environment.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Environment not found' });
    return;
  }

  const userId = req.user!.userId;
  const environment = await prisma.environment.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: { creator: { select: { id: true, name: true, email: true } } },
  });

  await writeAuditLog(userId, 'update', 'Environment', environment.id);
  res.json({ success: true, data: environment });
}

/** DELETE /api/environments/:id */
export async function deleteEnvironment(req: Request, res: Response): Promise<void> {
  const existing = await prisma.environment.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Environment not found' });
    return;
  }

  const userId = req.user!.userId;
  await prisma.environment.delete({ where: { id: req.params.id } });
  await writeAuditLog(userId, 'delete', 'Environment', req.params.id);
  res.json({ success: true, data: { id: req.params.id } });
}

// Re-export Role so the router can use it without a separate prisma import
export { Role };
