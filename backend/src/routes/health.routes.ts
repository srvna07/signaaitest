import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api/health
 * Simple health-check endpoint.
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Signa AI API is healthy 🚀',
    timestamp: new Date().toISOString(),
  });
});

export default router;
