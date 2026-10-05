import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import {
  authHeader,
  createVerifiedUser,
  loginUser,
  registerUser,
  uniqueEmail,
} from '../helpers/api';
import { createTestApp } from '../helpers/test-app';

describe('Categorias propias (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('crea, edita y elimina categorias respetando la jerarquia', async () => {
    const user = await createVerifiedUser(app, 'categories');
    const created = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(...authHeader(user.accessToken))
      .send({ name: 'Mascotas', kind: 'EXPENSE', icon: 'paw' })
      .expect(201);

    expect(created.body.isSystem).toBe(false);
    expect(created.body.userId).toBe(user.userId);
    expect(created.body.name).toBe('Mascotas');

    // Nombre duplicado sin importar mayusculas.
    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(...authHeader(user.accessToken))
      .send({ name: 'mascotas', kind: 'EXPENSE' })
      .expect(409);

    const child = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(...authHeader(user.accessToken))
      .send({ name: 'Veterinaria', kind: 'EXPENSE', parentId: created.body.id })
      .expect(201);
    expect(child.body.parentId).toBe(created.body.id);

    // Solo un nivel de anidacion.
    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(...authHeader(user.accessToken))
      .send({ name: 'Vacunas', kind: 'EXPENSE', parentId: child.body.id })
      .expect(400);

    // El tipo debe ser compatible con el padre.
    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(...authHeader(user.accessToken))
      .send({ name: 'Bono', kind: 'INCOME', parentId: created.body.id })
      .expect(400);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/categories/${created.body.id}`)
      .set(...authHeader(user.accessToken))
      .send({ name: 'Mascotas y veterinaria' })
      .expect(200);
    expect(updated.body.name).toBe('Mascotas y veterinaria');

    // No se puede borrar un padre con hijos activos.
    await request(app.getHttpServer())
      .delete(`/api/v1/categories/${created.body.id}`)
      .set(...authHeader(user.accessToken))
      .expect(422);

    await request(app.getHttpServer())
      .delete(`/api/v1/categories/${child.body.id}`)
      .set(...authHeader(user.accessToken))
      .expect(204);

    const list = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set(...authHeader(user.accessToken))
      .expect(200);
    expect(list.body.some((entry: { id: string }) => entry.id === child.body.id)).toBe(false);

    await request(app.getHttpServer())
      .delete(`/api/v1/categories/${created.body.id}`)
      .set(...authHeader(user.accessToken))
      .expect(204);
    await request(app.getHttpServer())
      .patch(`/api/v1/categories/${created.body.id}`)
      .set(...authHeader(user.accessToken))
      .send({ name: 'Fantasma' })
      .expect(404);
  });

  it('protege las categorias del sistema y las de otros usuarios', async () => {
    const user = await createVerifiedUser(app, 'categories-owner');
    const other = await createVerifiedUser(app, 'categories-other');

    const list = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set(...authHeader(user.accessToken))
      .expect(200);
    const system = list.body.find((entry: { isSystem: boolean }) => entry.isSystem);
    expect(system).toBeDefined();

    const systemEdit = await request(app.getHttpServer())
      .patch(`/api/v1/categories/${system.id}`)
      .set(...authHeader(user.accessToken))
      .send({ name: 'Hackeada' })
      .expect(422);
    expect(systemEdit.body.reason).toBe('SYSTEM_CATEGORY_READ_ONLY');

    const own = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(...authHeader(other.accessToken))
      .send({ name: 'Exclusiva', kind: 'INCOME' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/categories/${own.body.id}`)
      .set(...authHeader(user.accessToken))
      .send({ name: 'Robada' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/categories/${own.body.id}`)
      .set(...authHeader(user.accessToken))
      .expect(404);
  });

  it('exige correo verificado para las mutaciones', async () => {
    const email = uniqueEmail('categories-unverified');
    await registerUser(app, email);
    const session = await loginUser(app, email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(...authHeader(session.accessToken))
      .send({ name: 'Sin verificar', kind: 'EXPENSE' })
      .expect(403);
    expect(response.body.reason).toBe('EMAIL_NOT_VERIFIED');
  });
});
