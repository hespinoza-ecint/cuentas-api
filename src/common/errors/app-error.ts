/**
 * Error de aplicacion con codigo estable, estatus HTTP y detalles opcionales.
 * Todas las capas pueden lanzarlo; el filtro global lo convierte a RFC 9457.
 */
export interface AppErrorOptions {
  code: string;
  status: number;
  detail: string;
  title?: string;
  extensions?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: string;
  readonly title?: string;
  readonly extensions?: Record<string, unknown>;

  constructor(options: AppErrorOptions) {
    super(options.detail);
    this.name = new.target.name;
    this.code = options.code;
    this.status = options.status;
    this.detail = options.detail;
    this.title = options.title;
    this.extensions = options.extensions;

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }

    Error.captureStackTrace?.(this, new.target);
  }
}
