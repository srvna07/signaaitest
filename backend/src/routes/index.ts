import { Router } from 'express';
import healthRouter from './health.routes';
import authRouter from './auth.routes';
import environmentRouter from './environment.routes';
import requirementRouter from './requirement.routes';
import testCaseRouter from './testCase.routes';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/environments', environmentRouter);
router.use('/requirements', requirementRouter);
router.use('/test-cases', testCaseRouter);

export default router;
