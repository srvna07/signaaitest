import { Router } from 'express';
import {
  getSecrets,
  revealSecret,
  createSecret,
  updateSecret,
  deleteSecret,
} from '../controllers/secret.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { Role } from '@prisma/client';

const router = Router();

// All secret routes require authentication
router.use(authenticate);

// GET /api/secrets - list all secrets for an environment
// Viewer shouldn't see secrets at all as per requirements
router.get(
  '/',
  authorize(Role.ADMIN, Role.EDITOR, Role.RUNNER),
  (req, res) => void getSecrets(req, res),
);

// GET /api/secrets/:id/reveal - reveal decrypted value
router.get('/:id/reveal', authorize(Role.ADMIN), (req, res) => void revealSecret(req, res));

// POST /api/secrets - create a secret
router.post('/', authorize(Role.ADMIN, Role.EDITOR), (req, res) => void createSecret(req, res));

// PUT /api/secrets/:id - update a secret
router.put('/:id', authorize(Role.ADMIN, Role.EDITOR), (req, res) => void updateSecret(req, res));

// DELETE /api/secrets/:id - delete a secret
router.delete('/:id', authorize(Role.ADMIN), (req, res) => void deleteSecret(req, res));

export default router;
