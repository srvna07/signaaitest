import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import router from './routes';
import { errorHandler, notFound } from './middlewares/errorHandler';

export function createApp(): Application {
  const app = express();

  // ─── Security ────────────────────────────────────────────────────────────────
  app.use(helmet());

  // ─── CORS ─────────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );

  // ─── Body Parsing ─────────────────────────────────────────────────────────────
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ─── Logging ──────────────────────────────────────────────────────────────────
  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
  }

  // ─── Routes ───────────────────────────────────────────────────────────────────
  app.use('/api', router);

  // ─── Error Handling ───────────────────────────────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
