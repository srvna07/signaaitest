import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import {
  listTestCases,
  getTestCase,
  createTestCase,
  updateTestCase,
  deleteTestCase,
} from '../controllers/testCase.controller';

const router = Router();

router.use(authenticate);

router.get('/', (req, res) => void listTestCases(req, res));
router.get('/:id', (req, res) => void getTestCase(req, res));
router.post('/', authorize(Role.ADMIN, Role.EDITOR), (req, res) => void createTestCase(req, res));
router.put('/:id', authorize(Role.ADMIN, Role.EDITOR), (req, res) => void updateTestCase(req, res));
router.delete('/:id', authorize(Role.ADMIN), (req, res) => void deleteTestCase(req, res));

export default router;
