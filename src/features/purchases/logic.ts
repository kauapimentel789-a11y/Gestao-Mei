/** Prévia do total (o banco recalcula): soma de quantidade × custo, arredondada por linha. */
export function purchaseDraftTotal(lines: { quantity: number; unitCostCents: number }[]): number {
  return lines.reduce((sum, l) => sum + Math.round((Math.round(l.quantity * 1000) * l.unitCostCents) / 1000), 0);
}
