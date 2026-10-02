import { PasswordService } from '../../../src/modules/auth/services/password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashea con argon2id y verifica correctamente', async () => {
    const passwordHash = await service.hash('Password1234');

    expect(passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await service.verify(passwordHash, 'Password1234')).toBe(true);
    expect(await service.verify(passwordHash, 'OtraPassword999')).toBe(false);
  });

  it('devuelve false con un hash corrupto en lugar de lanzar', async () => {
    expect(await service.verify('esto-no-es-un-hash', 'Password1234')).toBe(false);
  });
});
