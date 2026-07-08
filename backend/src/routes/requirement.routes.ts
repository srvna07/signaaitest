import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import {
  listRequirements,
  getRequirement,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  generateTestCases,
  generateFromBrowser,
} from '../controllers/requirement.controller';

const router = Router();

router.use(authenticate);

router.get('/', (req, res) => void listRequirements(req, res));
router.get('/:id', (req, res) => void getRequirement(req, res));
router.post(
  '/:id/generate-test-cases',
  authorize(Role.ADMIN, Role.EDITOR),
  (req, res) => void generateTestCases(req, res),
);
router.post(
  '/:id/generate-from-browser',
  authorize(Role.ADMIN, Role.EDITOR),
  (req, res) => void generateFromBrowser(req, res),
);
router.post(
  '/',
  authorize(Role.ADMIN, Role.EDITOR),
  (req, res) => void createRequirement(req, res),
);
router.put(
  '/:id',
  authorize(Role.ADMIN, Role.EDITOR),
  (req, res) => void updateRequirement(req, res),
);
router.delete('/:id', authorize(Role.ADMIN), (req, res) => void deleteRequirement(req, res));

export default router;
