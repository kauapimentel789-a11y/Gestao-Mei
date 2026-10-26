/** Link do Google Maps para um endereço (abre o app de mapas no celular). */
export function mapsLink(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
