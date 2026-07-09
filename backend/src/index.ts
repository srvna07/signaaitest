/* eslint-disable no-console */
import { createServer } from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { attachBrowserStreamWS } from './browser/browserStreamWS';

const app = createApp();

async function bootstrap(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    const httpServer = createServer(app);
    attachBrowserStreamWS(httpServer);

    httpServer.listen(Number(env.PORT), () => {
      console.log(`🚀 Server running on http://localhost:${env.PORT}`);
      console.log(`   Environment : ${env.NODE_ENV}`);
      console.log(`   API Base    : http://localhost:${env.PORT}/api`);
      console.log(`   Health      : http://localhost:${env.PORT}/api/health`);
      console.log(`   WS Stream   : ws://localhost:${env.PORT}/ws/browser-stream`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Graceful shutdown — void wrapper satisfies @typescript-eslint/no-misused-promises
process.on('SIGINT', () => {
  void (async (): Promise<void> => {
    console.log('\n🛑 Shutting down...');
    await prisma.$disconnect();
    process.exit(0);
  })();
});

process.on('SIGTERM', () => {
  void (async (): Promise<void> => {
    console.log('\n🛑 Shutting down...');
    await prisma.$disconnect();
    process.exit(0);
  })();
});

void bootstrap();
