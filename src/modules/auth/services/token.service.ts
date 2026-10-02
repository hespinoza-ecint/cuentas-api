import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * Genera tokens aleatorios de 256 bits y su hash SHA-256.
 * Los tokens de alta entropia no necesitan hash lento: SHA-256 basta y
 * permite buscar por indice en la base de datos.
 */
@Injectable()
export class TokenService {
  generate(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
