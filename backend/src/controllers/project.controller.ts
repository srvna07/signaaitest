import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';

async function writeAuditLog(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  await prisma.auditLog.create({ data: { userId, action, entityType, entityId } });
}

const projectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(100),
  description: z.string().optional(),
});

/** GET /api/projects */
export async function listProjects(req: Request, res: Response): Promise<void> {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: projects });
}

/** GET /api/projects/:id */
export async function getProject(req: Request, res: Response): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
  });
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found' });
    return;
  }
  res.json({ success: true, data: project });
}

/** POST /api/projects */
export async function createProject(req: Request, res: Response): Promise<void> {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0]?.message });
    return;
  }

  const userId = req.user!.userId;
  const project = await prisma.project.create({
    data: {
      ...parsed.data,
      createdBy: userId,
    },
  });

  await writeAuditLog(userId, 'create', 'Project', project.id);
  res.status(201).json({ success: true, data: project });
}

/** PUT /api/projects/:id */
export async function updateProject(req: Request, res: Response): Promise<void> {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0]?.message });
    return;
  }

  const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Project not found' });
    return;
  }

  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: parsed.data,
  });

  const userId = req.user!.userId;
  await writeAuditLog(userId, 'update', 'Project', project.id);
  res.json({ success: true, data: project });
}

/** DELETE /api/projects/:id */
export async function deleteProject(req: Request, res: Response): Promise<void> {
  const existing = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: {
      _count: {
        select: { environments: true, requirements: true, testCases: true, secrets: true },
      },
    },
  });

  if (!existing) {
    res.status(404).json({ success: false, error: 'Project not found' });
    return;
  }

  const hasData =
    existing._count.environments > 0 ||
    existing._count.requirements > 0 ||
    existing._count.testCases > 0 ||
    existing._count.secrets > 0;

  if (hasData) {
    res.status(400).json({
      success: false,
      error: 'Cannot delete project because it still contains environments, requirements, test cases, or secrets. Please delete them first.',
    });
    return;
  }

  await prisma.project.delete({ where: { id: req.params.id } });

  const userId = req.user!.userId;
  await writeAuditLog(userId, 'delete', 'Project', req.params.id);
  res.json({ success: true, data: { id: req.params.id } });
}
