import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Parametros recomendados por OWASP para Argon2id:
 * 19 MiB de memoria, 2 iteraciones, 1 hilo.
 */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

@Injectable()
export class PasswordService {
  hash(plainPassword: string): Promise<string> {
    return hash(plainPassword, ARGON2_OPTIONS);
  }

  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    try {
      return await verify(passwordHash, plainPassword);
    } catch {
      // Hash corrupto o formato desconocido: se trata como credencial invalida.
      return false;
    }
  }
}
