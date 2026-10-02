import type { FastifyRequest } from 'fastify';

/** Contexto de la peticion que se guarda en la auditoria y las sesiones. */
export interface RequestMeta {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export function requestMeta(request: FastifyRequest): RequestMeta {
  const userAgent = request.headers['user-agent'];

  return {
    ip: request.ip,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 255) : undefined,
    requestId: request.id,
  };
}
