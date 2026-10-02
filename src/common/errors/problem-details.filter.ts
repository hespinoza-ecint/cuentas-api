import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { buildProblemDetails } from './problem-details.factory';

/**
 * Filtro global: cualquier excepcion se responde como `application/problem+json`.
 * Los errores 5xx se registran como error con stack; los 4xx como debug.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest & { id?: string }>();

    if (reply.sent) {
      return;
    }

    const problem = buildProblemDetails(exception, {
      instance: request.url,
      requestId: request.id,
    });

    if (problem.status >= 500) {
      this.logger.error(
        `${problem.code} ${problem.status} ${request.method} ${request.url}: ${problem.detail}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.debug(`${problem.code} ${problem.status} ${request.method} ${request.url}`);
    }

    void reply
      .status(problem.status)
      .header('content-type', 'application/problem+json; charset=utf-8')
      .send(problem);
  }
}
