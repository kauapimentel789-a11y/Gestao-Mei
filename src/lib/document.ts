// CPF e CNPJ do cliente, usados na nota fiscal de serviço (migração 0020).
// O banco guarda só os dígitos; a tela mostra com pontuação.

export function documentDigits(text: string) {
  return text.replace(/\D/g, '');
}

/** 11 dígitos (CPF) ou 14 (CNPJ). Não confere o dígito verificador. */
export function isValidDocument(text: string) {
  const d = documentDigits(text);
  return (d.length === 11 || d.length === 14) && /^[\d./\s-]+$/.test(text.trim());
}

export function formatDocument(text: string) {
  const d = documentDigits(text);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return text.trim();
}

export function documentLabel(text: string) {
  return documentDigits(text).length === 14 ? 'CNPJ' : 'CPF';
}
