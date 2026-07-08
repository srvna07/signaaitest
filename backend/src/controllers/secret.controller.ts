import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { encryptSecret, decryptSecret } from '../utils/crypto';

// Schemas
const createSecretSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  name: z.string().min(1, 'Name is required'),
  value: z.string().min(1, 'Value is required'),
  environmentId: z.string().uuid('Valid Environment ID is required'),
});

const updateSecretSchema = z.object({
  value: z.string().min(1, 'Value is required'),
});

// Controllers
export const getSecrets = async (req: Request, res: Response): Promise<void> => {
  try {
    const environmentId = req.query.environment_id as string | undefined;
    const projectId = req.query.projectId as string | undefined;

    const where: any = {};
    if (environmentId) where.environmentId = environmentId;
    if (projectId) where.projectId = projectId;

    const secrets = await prisma.secret.findMany({
      where,
      select: {
        id: true,
        name: true,
        environmentId: true,
        projectId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ success: true, data: secrets });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to list secrets' });
  }
};

export const revealSecret = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const secret = await prisma.secret.findUnique({
      where: { id },
    });

    if (!secret) {
      res.status(404).json({ success: false, error: 'Secret not found' });
      return;
    }

    // Write audit log for revealing secret
    await prisma.auditLog.create({
      data: {
        action: 'REVEAL_SECRET',
        entityType: 'Secret',
        entityId: id,
        userId: req.user!.userId,
      },
    });

    const decryptedValue = decryptSecret(secret.encryptedValue);

    res.json({ success: true, data: { value: decryptedValue } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to reveal secret' });
  }
};

export const createSecret = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = createSecretSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const { name, value, environmentId, projectId } = parsed.data;

    // Verify environment exists
    const env = await prisma.environment.findUnique({ where: { id: environmentId } });
    if (!env) {
      res.status(404).json({ success: false, error: 'Environment not found' });
      return;
    }

    // Check for duplicate name in environment
    const existing = await prisma.secret.findUnique({
      where: {
        name_environmentId: {
          name,
          environmentId,
        },
      },
    });

    if (existing) {
      res.status(409).json({
        success: false,
        error: 'A secret with this name already exists in this environment',
      });
      return;
    }

    const encryptedValue = encryptSecret(value);

    const secret = await prisma.secret.create({
      data: {
        name,
        encryptedValue,
        environmentId,
        projectId,
        createdBy: req.user!.userId,
      },
      select: {
        id: true,
        name: true,
        environmentId: true,
        projectId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'CREATE_SECRET',
        entityType: 'Secret',
        entityId: secret.id,
        userId: req.user!.userId,
      },
    });

    res.status(201).json({ success: true, data: secret });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create secret' });
  }
};

export const updateSecret = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const parsed = updateSecretSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const { value } = parsed.data;

    const existing = await prisma.secret.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Secret not found' });
      return;
    }

    const encryptedValue = encryptSecret(value);

    const updatedSecret = await prisma.secret.update({
      where: { id },
      data: { encryptedValue },
      select: {
        id: true,
        name: true,
        environmentId: true,
        projectId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_SECRET',
        entityType: 'Secret',
        entityId: id,
        userId: req.user!.userId,
      },
    });

    res.json({ success: true, data: updatedSecret });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update secret' });
  }
};

export const deleteSecret = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const existing = await prisma.secret.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Secret not found' });
      return;
    }

    await prisma.secret.delete({
      where: { id },
    });

    await prisma.auditLog.create({
      data: {
        action: 'DELETE_SECRET',
        entityType: 'Secret',
        entityId: id,
        userId: req.user!.userId,
      },
    });

    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete secret' });
  }
};
