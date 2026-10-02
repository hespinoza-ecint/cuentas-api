/** Error de validacion por campo, expuesto en `errors` del problem details. */
export interface FieldError {
  field: string;
  errors: string[];
}

/**
 * Cuerpo de error segun RFC 9457 (`application/problem+json`).
 * Las extensiones (`code`, `requestId`, `errors`, ...) se agregan como propiedades.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code: string;
  timestamp: string;
  requestId?: string;
  [extension: string]: unknown;
}
