import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from '../controllers/project.controller';

const router = Router();

router.use(authenticate);

router.get('/', (req, res) => void listProjects(req, res));
router.get('/:id', (req, res) => void getProject(req, res));
router.post('/', authorize(Role.ADMIN, Role.EDITOR), (req, res) => void createProject(req, res));
router.put('/:id', authorize(Role.ADMIN, Role.EDITOR), (req, res) => void updateProject(req, res));
router.delete('/:id', authorize(Role.ADMIN), (req, res) => void deleteProject(req, res));

export default router;
