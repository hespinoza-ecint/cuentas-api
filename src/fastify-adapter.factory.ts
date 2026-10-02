import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { FastifyAdapter } from '@nestjs/platform-fastify';

/**
 * Adaptador de Fastify con el id de peticion controlado por la aplicacion:
 * se respeta la cabecera `x-request-id` entrante (util para tracing) y, si no
 * existe, se genera un UUID. Ese id se usa en los logs y en las respuestas.
 */
export function createFastifyAdapter(): FastifyAdapter {
  return new FastifyAdapter({
    trustProxy: true,
    genReqId: (request: IncomingMessage) => {
      const header = request.headers['x-request-id'];
      if (typeof header === 'string' && header.length > 0 && header.length <= 128) {
        return header;
      }
      return randomUUID();
    },
  });
}
