import { z } from 'zod';

import { parseBRLToCents } from '@/lib/money';

import { UNITS } from './types';

const money = z
  .string()
  .trim()
  .refine((v) => v === '' || parseBRLToCents(v) !== null, 'Valor inválido. Ex.: 49,90');

export const productSchema = z
  .object({
    itemType: z.enum(['raw_material', 'resale', 'finished', 'consumable', 'component', 'service']),
    name: z.string().trim().min(1, 'Informe o nome.').max(120, 'Nome muito longo.'),
    description: z.string().trim().max(500, 'Descrição muito longa.'),
    sku: z.string().trim().max(40, 'Código muito longo.'),
    unit: z.enum(UNITS),
    trackStock: z.boolean(),
    minStock: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d+([.,]\d{1,3})?$/.test(v), 'Quantidade inválida.'),
    cost: money,
    price: money,
    active: z.boolean(),
    duration: z
      .string()
      .trim()
      .refine((v) => v === '' || (/^\d{1,4}$/.test(v) && Number(v) >= 5 && Number(v) <= 1440), 'Use de 5 a 1440 minutos.'),
  })
  .refine((v) => !['finished', 'resale', 'service'].includes(v.itemType) || v.price !== '', {
    path: ['price'],
    message: 'Informe o preço de venda.',
  });

export type ProductFormInput = z.infer<typeof productSchema>;
