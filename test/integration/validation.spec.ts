import { Body, Controller, Post } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import request from 'supertest';
import { ProblemDetailsFilter } from '../../src/common/errors/problem-details.filter';
import { createValidationPipe } from '../../src/common/validation/validation-pipe';

class CreateItemDto {
  @IsString({ message: 'name debe ser texto' })
  @IsNotEmpty({ message: 'name es obligatorio' })
  name!: string;

  @IsInt({ message: 'amount debe ser un entero en centavos' })
  @Min(1, { message: 'amount debe ser mayor que cero' })
  amount!: number;
}

@Controller('test-items')
class TestItemsController {
  @Post()
  create(@Body() dto: CreateItemDto): CreateItemDto {
    return dto;
  }
}

describe('Validacion de entradas (integracion)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestItemsController],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rechaza un payload invalido con 400 y errores por campo', async () => {
    const response = await request(app.getHttpServer())
      .post('/test-items')
      .send({ name: '', amount: 'abc', extra: true })
      .expect(400);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body.code).toBe('VALIDATION_ERROR');

    const fields = (response.body.errors as Array<{ field: string }>).map((error) => error.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'amount', 'extra']));
  });

  it('acepta un payload valido', async () => {
    const response = await request(app.getHttpServer())
      .post('/test-items')
      .send({ name: 'Cafe', amount: 4500 })
      .expect(201);

    expect(response.body).toEqual({ name: 'Cafe', amount: 4500 });
  });
});
