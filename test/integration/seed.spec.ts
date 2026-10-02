import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { createTestApp } from '../helpers/test-app';

describe('Datos iniciales (seed)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('siembra categorias globales de sistema con subcategorias', async () => {
    const parents = await prisma.category.count({
      where: { userId: null, parentId: null, isSystem: true },
    });
    const children = await prisma.category.count({
      where: { userId: null, isSystem: true, parentId: { not: null } },
    });

    expect(parents).toBeGreaterThanOrEqual(15);
    expect(children).toBeGreaterThanOrEqual(20);
  });

  it('siembra los festivos MX_LABOR y MX_BANKING de 2026 y 2027', async () => {
    const labor = await prisma.holiday.count({ where: { calendarCode: 'MX_LABOR' } });
    const banking = await prisma.holiday.count({ where: { calendarCode: 'MX_BANKING' } });

    expect(labor).toBe(14);
    expect(banking).toBe(22);
  });

  it('el seed es idempotente: no duplica categorias padre', async () => {
    // El global setup ejecuta el seed dos veces; si no fuera idempotente
    // habria padres duplicados (mismo nombre y tipo).
    const parents = await prisma.category.findMany({
      where: { userId: null, parentId: null, isSystem: true },
      select: { name: true, kind: true },
    });

    const parentKeys = parents.map((category) => `${category.name}|${category.kind}`);
    expect(new Set(parentKeys).size).toBe(parentKeys.length);
  });

  it('SQLite trabaja en modo WAL', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ journal_mode: string }>>(
      'PRAGMA journal_mode;',
    );
    expect(rows[0]?.journal_mode).toBe('wal');
  });
});
