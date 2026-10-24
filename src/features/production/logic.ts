// Prévias da ficha técnica e da produção. O banco recalcula tudo ao salvar;
// aqui é só o que o usuário vê antes de confirmar.

export interface RecipeLineDraft {
  quantity: number;
  costCents: number | null;
}

export interface CostPreview {
  materialsCents: number;
  laborCents: number;
  /** Custo de uma unidade produzida (insumos + mão de obra, dividido pelo rendimento). */
  unitCents: number;
  /** Insumos sem custo cadastrado: o custo fica incompleto. */
  missing: number;
}

/** Custo de um lote, como na visão recipe_costs. */
export function recipeCost(lines: RecipeLineDraft[], yieldQty: number, laborMinutes: number, hourlyRateCents: number): CostPreview {
  let materials = 0;
  let missing = 0;
  for (const l of lines) {
    if (l.costCents == null) missing += 1;
    else materials += l.quantity * l.costCents;
  }
  const materialsCents = Math.round(materials);
  const laborCents = Math.round((laborMinutes * hourlyRateCents) / 60);
  const unitCents = yieldQty > 0 ? Math.round((materialsCents + laborCents) / yieldQty) : 0;
  return { materialsCents, laborCents, unitCents, missing };
}

/** Quantos lotes da receita uma produção representa. */
export function productionFactor(quantity: number, yieldQty: number): number {
  return yieldQty > 0 ? quantity / yieldQty : 0;
}

/** Quantidade de um insumo para a produção, arredondada como no banco (3 casas). */
export function scaledQuantity(recipeQty: number | string, factor: number): number {
  return Math.round(Number(recipeQty) * factor * 1000) / 1000;
}

/**
 * Custo de uma produção: insumos (quantidades já escaladas) ao custo atual +
 * mão de obra proporcional ao número de lotes.
 */
export function productionCost(
  lines: RecipeLineDraft[],
  quantity: number,
  laborMinutes: number,
  yieldQty: number,
  hourlyRateCents: number,
): CostPreview {
  const factor = productionFactor(quantity, yieldQty);
  let materials = 0;
  let missing = 0;
  for (const l of lines) {
    if (l.costCents == null) missing += 1;
    else materials += l.quantity * l.costCents;
  }
  const materialsCents = Math.round(materials);
  const laborCents = Math.round((laborMinutes * factor * hourlyRateCents) / 60);
  const unitCents = quantity > 0 ? Math.round((materialsCents + laborCents) / quantity) : 0;
  return { materialsCents, laborCents, unitCents, missing };
}

/** Minutos digitados ("90", "1:30" ou "1h30") para minutos inteiros. */
export function parseMinutes(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');
  if (t === '') return 0;
  const hm = /^(\d{1,4})(?:h|:)(\d{0,2})(?:min|m)?$/.exec(t);
  if (hm) {
    const m = hm[2] === '' ? 0 : Number(hm[2]);
    if (m >= 60) return null;
    const total = Number(hm[1]) * 60 + m;
    return total <= 100000 ? total : null;
  }
  const only = /^(\d{1,6})(?:min|m)?$/.exec(t);
  if (!only) return null;
  const v = Number(only[1]);
  return v <= 100000 ? v : null;
}

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return 'sem mão de obra';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
