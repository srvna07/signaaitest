import { Router } from 'express';
import healthRouter from './health.routes';
import authRouter from './auth.routes';
import environmentRouter from './environment.routes';
import requirementRouter from './requirement.routes';
import testCaseRouter from './testCase.routes';
import secretRouter from './secret.routes';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/environments', environmentRouter);
router.use('/requirements', requirementRouter);
router.use('/test-cases', testCaseRouter);
router.use('/secrets', secretRouter);

export default router;
