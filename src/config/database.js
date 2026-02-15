import { PrismaClient } from '@prisma/client';
import logger from './logger.js';

const prisma = new PrismaClient({
  log: [
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' }
  ]
});

// Log warnings and errors
prisma.$on('warn', (e) => {
  logger.warn({ type: 'prisma-warn', ...e });
});

prisma.$on('error', (e) => {
  logger.error({ type: 'prisma-error', ...e });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export default prisma;
