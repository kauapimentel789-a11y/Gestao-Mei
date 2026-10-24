import type { BusinessType } from '@/config/business';

export type ItemType = 'raw_material' | 'resale' | 'finished' | 'consumable' | 'component' | 'service';

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  finished: 'Produto acabado',
  resale: 'Mercadoria',
  service: 'Serviço',
  raw_material: 'Matéria-prima',
  consumable: 'Material de consumo',
  component: 'Peça ou componente',
};

/** Tipos oferecidos no cadastro, na ordem que faz sentido para cada negócio. */
export const ITEM_TYPES_BY_BUSINESS: Record<BusinessType, ItemType[]> = {
  production: ['finished', 'raw_material', 'consumable', 'resale', 'service'],
  resale: ['resale', 'consumable', 'service'],
  services: ['service', 'component', 'consumable', 'resale'],
};

/** Itens que normalmente aparecem para venda num pedido. */
export const SELLABLE_TYPES: ItemType[] = ['finished', 'resale', 'service'];

export const UNITS = ['un', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'm2', 'h', 'cx', 'pct', 'par', 'dz'] as const;
export type Unit = (typeof UNITS)[number];

export interface Product {
  id: string;
  organization_id: string;
  item_type: ItemType;
  name: string;
  description: string | null;
  sku: string | null;
  unit: Unit;
  track_stock: boolean;
  stock_qty: string; // numeric chega como texto
  min_stock: string;
  cost_cents: number | null;
  price_cents: number | null;
  active: boolean;
}

export function isLowStock(p: Pick<Product, 'track_stock' | 'stock_qty' | 'min_stock'>): boolean {
  return p.track_stock && Number(p.min_stock) > 0 && Number(p.stock_qty) <= Number(p.min_stock);
}

/** Margem estimada sobre o preço (0–1), ou null sem preço/custo. */
export function marginRatio(p: Pick<Product, 'cost_cents' | 'price_cents'>): number | null {
  if (!p.price_cents || p.cost_cents == null) return null;
  return (p.price_cents - p.cost_cents) / p.price_cents;
}
