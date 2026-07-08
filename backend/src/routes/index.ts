import { Router } from 'express';
import healthRouter from './health.routes';

const router = Router();

router.use('/health', healthRouter);

// ─── Feature Routes ───────────────────────────────────────────────────────────
// Add your feature routes here as the project grows. Example:
// import authRouter from './auth.routes';
// router.use('/auth', authRouter);

export default router;
