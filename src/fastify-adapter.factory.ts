import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { FastifyAdapter } from '@nestjs/platform-fastify';

/**
 * `TRUST_PROXY`: sin valor (o `false`/`0`) no se confia en proxies; un numero
 * son los saltos de confianza (los N proxies inmediatos) y una lista son
 * direcciones/redes exactas. Con `true` se confia en toda la cadena (solo
 * para despliegues controlados).
 */
export type TrustProxySetting = boolean | string | ((address: string, hop: number) => boolean);

export function parseTrustProxy(value: string | undefined): TrustProxySetting {
  if (!value || value === 'false' || value === '0') {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  const hops = Number(value);
  if (Number.isInteger(hops) && hops > 0) {
    // Fastify no acepta un conteo de saltos: se expresa como funcion que
    // confia solo en los N proxies inmediatos.
    return (_address: string, hop: number) => hop < hops;
  }
  return value;
}

/**
 * Adaptador de Fastify con el id de peticion controlado por la aplicacion:
 * se respeta la cabecera `x-request-id` entrante (util para tracing) y, si no
 * existe, se genera un UUID. Ese id se usa en los logs y en las respuestas.
 */
export function createFastifyAdapter(): FastifyAdapter {
  return new FastifyAdapter({
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    genReqId: (request: IncomingMessage) => {
      const header = request.headers['x-request-id'];
      if (typeof header === 'string' && header.length > 0 && header.length <= 128) {
        return header;
      }
      return randomUUID();
    },
  });
}
