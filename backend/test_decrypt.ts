import { PrismaClient } from '@prisma/client';
import { decryptSecret } from './src/utils/crypto';
const p = new PrismaClient();
async function test() {
  const e = await p.environment.findFirst({where: {name: 'dev'}, include: {secrets: true}});
  console.log('ENV:', e?.name, e?.loginUsernameSecret, e?.loginPasswordSecret);
  e?.secrets.forEach(s => console.log('SECRET:', s.name, decryptSecret(s.encryptedValue)));
}
test();
