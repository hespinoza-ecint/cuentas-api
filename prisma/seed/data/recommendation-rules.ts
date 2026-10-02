export interface SeedRecommendationRule {
  code: string;
  name: string;
  description: string;
  kind: 'ELIMINATORY' | 'SCORING';
  weight: number;
  params?: Record<string, unknown>;
}

/**
 * Reglas por defecto del motor de recomendaciones (Fase 6).
 * El admin puede ajustarlas y cada usuario puede sobrescribirlas.
 */
export const recommendationRules: SeedRecommendationRule[] = [
  {
    code: 'CARD_ACTIVE',
    name: 'Tarjeta activa',
    description: 'Solo se evaluan tarjetas activas.',
    kind: 'ELIMINATORY',
    weight: 0,
  },
  {
    code: 'CREDIT_AVAILABLE',
    name: 'Credito disponible',
    description: 'La tarjeta debe tener credito suficiente para el monto de la compra.',
    kind: 'ELIMINATORY',
    weight: 0,
  },
  {
    code: 'MSI_ELIGIBLE',
    name: 'Elegible para MSI',
    description: 'La tarjeta debe ser elegible para la promocion de meses sin intereses.',
    kind: 'ELIMINATORY',
    weight: 0,
  },
  {
    code: 'CASHFLOW_NON_NEGATIVE',
    name: 'Flujo de efectivo no negativo',
    description: 'La proyeccion de flujo de efectivo nunca debe quedar por debajo de cero.',
    kind: 'ELIMINATORY',
    weight: 0,
  },
  {
    code: 'NO_INTEREST',
    name: 'Sin intereses',
    description: 'Prefiere las opciones que no generan intereses.',
    kind: 'SCORING',
    weight: 35,
    params: {},
  },
  {
    code: 'CASH_BUFFER',
    name: 'Colchon de efectivo',
    description: 'Mantiene el flujo proyectado por encima del colchon minimo configurado.',
    kind: 'SCORING',
    weight: 25,
    params: {},
  },
  {
    code: 'FINANCING_DAYS',
    name: 'Dias de financiamiento',
    description: 'Prefiere mas dias entre la compra y la fecha de pago.',
    kind: 'SCORING',
    weight: 25,
    params: { targetDays: 45 },
  },
  {
    code: 'UTILIZATION',
    name: 'Utilizacion de credito',
    description: 'Evita superar el maximo de utilizacion recomendado del limite.',
    kind: 'SCORING',
    weight: 15,
    params: {},
  },
];
