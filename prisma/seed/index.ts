import { PrismaClient } from '@prisma/client';
import { categories } from './data/categories';
import { holidays } from './data/holidays';
import { recommendationRules } from './data/recommendation-rules';

const prisma = new PrismaClient();

/**
 * Datos iniciales del sistema. El seed es idempotente: puede ejecutarse
 * varias veces sin duplicar registros.
 */
async function seedCategories(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const category of categories) {
    let parent = await prisma.category.findFirst({
      where: { userId: null, parentId: null, name: category.name, kind: category.kind },
    });

    if (parent) {
      skipped += 1;
    } else {
      parent = await prisma.category.create({
        data: {
          userId: null,
          parentId: null,
          name: category.name,
          kind: category.kind,
          icon: category.icon,
          isSystem: true,
        },
      });
      created += 1;
    }

    for (const child of category.children ?? []) {
      const existingChild = await prisma.category.findFirst({
        where: { userId: null, parentId: parent.id, name: child.name },
      });

      if (existingChild) {
        skipped += 1;
      } else {
        await prisma.category.create({
          data: {
            userId: null,
            parentId: parent.id,
            name: child.name,
            kind: category.kind,
            icon: child.icon,
            isSystem: true,
          },
        });
        created += 1;
      }
    }
  }

  return { created, skipped };
}

async function seedHolidays(): Promise<{ total: number; calendars: string[] }> {
  for (const holiday of holidays) {
    await prisma.holiday.upsert({
      where: {
        calendarCode_date: { calendarCode: holiday.calendarCode, date: holiday.date },
      },
      update: { name: holiday.name },
      create: {
        calendarCode: holiday.calendarCode,
        date: holiday.date,
        name: holiday.name,
      },
    });
  }

  const calendars = [...new Set(holidays.map((holiday) => holiday.calendarCode))];
  return { total: holidays.length, calendars };
}

async function seedRecommendationRules(): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const rule of recommendationRules) {
    const existing = await prisma.recommendationRule.findUnique({ where: { code: rule.code } });

    if (existing) {
      // No se pisan pesos ni parametros: el admin pudo haberlos ajustado.
      await prisma.recommendationRule.update({
        where: { code: rule.code },
        data: { name: rule.name, description: rule.description, kind: rule.kind },
      });
      updated += 1;
    } else {
      await prisma.recommendationRule.create({
        data: {
          code: rule.code,
          name: rule.name,
          description: rule.description,
          kind: rule.kind,
          weight: rule.weight,
          params: rule.params ? JSON.stringify(rule.params) : null,
          isEnabled: true,
        },
      });
      created += 1;
    }
  }

  return { created, updated };
}

async function main(): Promise<void> {
  // En SQLite se activa WAL una sola vez aqui: las aplicaciones que se
  // conecten despues lo reutilizan sin necesidad de bloquear la base.
  if ((process.env.DATABASE_URL ?? '').startsWith('file:')) {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
  }

  console.log('Sembrando datos iniciales de Cuentas...');

  const categoryResult = await seedCategories();
  console.log(
    `Categorias: ${categoryResult.created} creadas, ${categoryResult.skipped} ya existian.`,
  );

  const holidayResult = await seedHolidays();
  console.log(
    `Festivos: ${holidayResult.total} registros en ${holidayResult.calendars.join(', ')}.`,
  );

  const rulesResult = await seedRecommendationRules();
  console.log(
    `Reglas de recomendacion: ${rulesResult.created} creadas, ${rulesResult.updated} actualizadas.`,
  );

  console.log('Seed completado.');
}

main()
  .catch((error) => {
    console.error('Error al ejecutar el seed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
