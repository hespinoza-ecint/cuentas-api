import { parseTrustProxy } from '../../src/fastify-adapter.factory';

describe('trustProxy (Fastify)', () => {
  it('sin configuracion no confia en ningun proxy', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('0')).toBe(false);
  });

  it('acepta true, un numero de saltos o una lista de direcciones', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('127.0.0.1,10.0.0.0/8')).toBe('127.0.0.1,10.0.0.0/8');

    // Fastify no acepta numero de saltos: se traduce a una funcion que confia
    // solo en los N proxies inmediatos.
    const twoHops = parseTrustProxy('2');
    expect(typeof twoHops).toBe('function');
    if (typeof twoHops === 'function') {
      expect(twoHops('10.0.0.1', 0)).toBe(true);
      expect(twoHops('10.0.0.1', 1)).toBe(true);
      expect(twoHops('10.0.0.1', 2)).toBe(false);
    }
  });
});
