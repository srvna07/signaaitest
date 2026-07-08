/* eslint-disable no-console */
import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';

const app = createApp();

async function bootstrap(): Promise<void> {
  try {
    // Verify database connection
    await prisma.$connect();
    console.log('✅ Database connected');

    app.listen(Number(env.PORT), () => {
      console.log(`🚀 Server running on http://localhost:${env.PORT}`);
      console.log(`   Environment : ${env.NODE_ENV}`);
      console.log(`   API Base    : http://localhost:${env.PORT}/api`);
      console.log(`   Health      : http://localhost:${env.PORT}/api/health`);
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
