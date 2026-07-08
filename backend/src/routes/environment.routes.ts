import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import {
  listEnvironments,
  getEnvironment,
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
} from '../controllers/environment.controller';

const router = Router();

// All environment routes require authentication
router.use(authenticate);

router.get('/', (req, res) => void listEnvironments(req, res));
router.get('/:id', (req, res) => void getEnvironment(req, res));
router.post(
  '/',
  authorize(Role.ADMIN, Role.EDITOR),
  (req, res) => void createEnvironment(req, res),
);
router.put(
  '/:id',
  authorize(Role.ADMIN, Role.EDITOR),
  (req, res) => void updateEnvironment(req, res),
);
router.delete('/:id', authorize(Role.ADMIN), (req, res) => void deleteEnvironment(req, res));

export default router;
