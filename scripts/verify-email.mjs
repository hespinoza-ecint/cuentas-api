// Marca el correo de un usuario como verificado (uso exclusivo de E2E).
//   node scripts/verify-email.mjs usuario@test.local
import { PrismaClient } from '@prisma/client';

const email = process.argv[2];

if (!email) {
  console.error('Uso: node scripts/verify-email.mjs <correo>');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.update({
    where: { email },
    data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
  });
  console.log(`verificado: ${user.email}`);
} catch (error) {
  console.error(`No se pudo verificar ${email}:`, error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
