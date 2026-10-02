export interface SeedCategoryChild {
  name: string;
  icon: string;
}

export interface SeedCategory {
  name: string;
  kind: 'EXPENSE' | 'INCOME' | 'BOTH';
  icon: string;
  children?: SeedCategoryChild[];
}

/**
 * Categorias globales del sistema (userId = null, isSystem = true).
 * Los usuarios podran crear sus propias categorias y subcategorias.
 */
export const categories: SeedCategory[] = [
  {
    name: 'Vivienda',
    kind: 'EXPENSE',
    icon: 'home',
    children: [
      { name: 'Renta', icon: 'key' },
      { name: 'Hipoteca', icon: 'account_balance' },
      { name: 'Mantenimiento', icon: 'build' },
    ],
  },
  {
    name: 'Alimentos',
    kind: 'EXPENSE',
    icon: 'restaurant',
    children: [
      { name: 'Supermercado', icon: 'shopping_cart' },
      { name: 'Restaurantes', icon: 'restaurant_menu' },
      { name: 'Cafe y snacks', icon: 'local_cafe' },
      { name: 'Comida a domicilio', icon: 'delivery_dining' },
    ],
  },
  {
    name: 'Transporte',
    kind: 'EXPENSE',
    icon: 'directions_car',
    children: [
      { name: 'Gasolina', icon: 'local_gas_station' },
      { name: 'Transporte publico', icon: 'directions_bus' },
      { name: 'Apps de viaje', icon: 'local_taxi' },
      { name: 'Estacionamiento', icon: 'local_parking' },
      { name: 'Mantenimiento vehicular', icon: 'car_repair' },
    ],
  },
  {
    name: 'Servicios',
    kind: 'EXPENSE',
    icon: 'bolt',
    children: [
      { name: 'Electricidad', icon: 'power' },
      { name: 'Agua', icon: 'water_drop' },
      { name: 'Gas', icon: 'local_fire_department' },
      { name: 'Internet', icon: 'wifi' },
      { name: 'Telefonia', icon: 'smartphone' },
      { name: 'Streaming', icon: 'subscriptions' },
    ],
  },
  {
    name: 'Salud',
    kind: 'EXPENSE',
    icon: 'health_and_safety',
    children: [
      { name: 'Farmacia', icon: 'medication' },
      { name: 'Consultas medicas', icon: 'medical_services' },
      { name: 'Seguros medicos', icon: 'health_and_safety' },
      { name: 'Gimnasio', icon: 'fitness_center' },
    ],
  },
  {
    name: 'Educacion',
    kind: 'EXPENSE',
    icon: 'school',
    children: [
      { name: 'Colegiaturas', icon: 'school' },
      { name: 'Cursos', icon: 'menu_book' },
      { name: 'Libros', icon: 'auto_stories' },
    ],
  },
  {
    name: 'Entretenimiento',
    kind: 'EXPENSE',
    icon: 'sports_esports',
    children: [
      { name: 'Cine y eventos', icon: 'movie' },
      { name: 'Videojuegos', icon: 'videogame_asset' },
      { name: 'Hobbies', icon: 'palette' },
    ],
  },
  {
    name: 'Ropa y calzado',
    kind: 'EXPENSE',
    icon: 'checkroom',
  },
  {
    name: 'Cuidado personal',
    kind: 'EXPENSE',
    icon: 'spa',
  },
  {
    name: 'Mascotas',
    kind: 'EXPENSE',
    icon: 'pets',
    children: [
      { name: 'Alimento para mascotas', icon: 'pets' },
      { name: 'Veterinario', icon: 'medical_services' },
    ],
  },
  {
    name: 'Viajes',
    kind: 'EXPENSE',
    icon: 'flight',
    children: [
      { name: 'Hospedaje', icon: 'hotel' },
      { name: 'Vuelos', icon: 'flight_takeoff' },
      { name: 'Actividades turisticas', icon: 'tour' },
    ],
  },
  {
    name: 'Seguros',
    kind: 'EXPENSE',
    icon: 'shield',
    children: [
      { name: 'Seguro de auto', icon: 'directions_car' },
      { name: 'Seguro de vida', icon: 'favorite' },
      { name: 'Seguro de hogar', icon: 'home' },
    ],
  },
  {
    name: 'Deudas',
    kind: 'EXPENSE',
    icon: 'credit_card',
  },
  {
    name: 'Otros gastos',
    kind: 'EXPENSE',
    icon: 'more_horiz',
  },
  {
    name: 'Salario',
    kind: 'INCOME',
    icon: 'payments',
  },
  {
    name: 'Freelance',
    kind: 'INCOME',
    icon: 'work',
  },
  {
    name: 'Negocio',
    kind: 'INCOME',
    icon: 'storefront',
  },
  {
    name: 'Inversiones',
    kind: 'INCOME',
    icon: 'trending_up',
    children: [
      { name: 'Rendimientos', icon: 'savings' },
      { name: 'Dividendos', icon: 'account_balance' },
    ],
  },
  {
    name: 'Ingresos extraordinarios',
    kind: 'INCOME',
    icon: 'celebration',
    children: [
      { name: 'Aguinaldo', icon: 'card_giftcard' },
      { name: 'Bonos', icon: 'workspace_premium' },
      { name: 'PTU', icon: 'handshake' },
      { name: 'Venta de bienes', icon: 'sell' },
    ],
  },
  {
    name: 'Otros ingresos',
    kind: 'INCOME',
    icon: 'more_horiz',
  },
];
