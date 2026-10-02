import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import helmet from '@fastify/helmet';
import { ProblemDetailsFilter } from './common/errors/problem-details.filter';
import { createValidationPipe } from './common/validation/validation-pipe';
import { AppConfigService } from './config/app-config.service';

/**
 * Configuracion comun de la aplicacion (servidor real y pruebas):
 * seguridad, CORS, prefijo, validacion, filtro de errores y Swagger.
 */
export async function setupApp(app: NestFastifyApplication): Promise<void> {
  const config = app.get(AppConfigService);
  const fastify = app.getHttpAdapter().getInstance() as FastifyInstance;

  // Refleja el id de peticion (generado por Fastify) en la respuesta para
  // correlacionar errores y logs desde la PWA o la app movil.
  fastify.addHook('onSend', (request: FastifyRequest, reply: FastifyReply, payload, done) => {
    if (!reply.hasHeader('x-request-id')) {
      reply.header('x-request-id', String(request.id));
    }
    done(null, payload);
  });

  await app.register(helmet, { global: true, contentSecurityPolicy: false });

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Versionado por URI. Los endpoints de salud quedan fuera del prefijo.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/live'] });

  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ProblemDetailsFilter());

  if (config.docsEnabled) {
    setupSwagger(app, config);
  }
}

function setupSwagger(app: NestFastifyApplication, config: AppConfigService): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Cuentas API')
      .setDescription(
        'API para el control de flujo de efectivo y la recomendacion de tarjetas de credito. ' +
          'Las recomendaciones son estimaciones basadas en la informacion registrada por el usuario ' +
          'y no constituyen asesoria financiera profesional.',
      )
      .setVersion(config.appVersion)
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token (disponible a partir de la Fase 2)',
        },
        'access-token',
      )
      .build(),
  );

  SwaggerModule.setup('api/docs', app, document, {
    // En pruebas se sirve solo el JSON: la UI requiere @fastify/static, cuyas
    // dependencias ESM no carga el runtime CommonJS de Jest.
    ui: !config.isTest,
    swaggerOptions: { persistAuthorization: true },
  });
}
