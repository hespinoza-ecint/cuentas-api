import { createHash } from 'node:crypto';
import { TokenService } from '../../../src/modules/auth/services/token.service';

describe('TokenService', () => {
  const service = new TokenService();

  it('genera un token aleatorio y su hash SHA-256', () => {
    const { token, tokenHash } = service.generate();

    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(tokenHash).toHaveLength(64);
    expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
  });

  it('genera tokens distintos en cada llamada', () => {
    expect(service.generate().token).not.toBe(service.generate().token);
  });

  it('el hash es determinista', () => {
    expect(service.hash('token-de-prueba')).toBe(service.hash('token-de-prueba'));
  });
});
