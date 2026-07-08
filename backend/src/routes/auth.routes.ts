import { Router } from 'express';
import { register, login } from '../controllers/auth.controller';

const router = Router();

/**
 * POST /api/auth/register
 * TODO: Add `authenticate, authorize(Role.ADMIN)` before going to production.
 */
router.post('/register', (req, res) => void register(req, res));

/**
 * POST /api/auth/login
 */
router.post('/login', (req, res) => void login(req, res));

export default router;
