// Textos da família: e-mail válido, nome de quem está no espaço e a mensagem
// para chamar a pessoa (enviada pelo WhatsApp ou outro app, pela própria pessoa).
export const ROLE_LABEL = { owner: 'Dono', admin: 'Pode convidar', member: 'Participa' } as const;

export function normalizeEmail(text: string): string | null {
  const email = text.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 254 ? email : null;
}

export function memberName(m: { display_name: string; email: string }): string {
  return m.display_name.trim() || m.email.split('@')[0] || 'Alguém';
}

export function inviteMessage(inviter: string, email: string, appUrl: string): string {
  const who = inviter.trim() ? `${inviter.trim()} te convidou` : 'Você foi convidado';
  return `${who} para dividir as finanças da casa no Gestão Fácil. Entre em ${appUrl} e crie sua conta com o e-mail ${email}: o convite aparece logo no começo.`;
}
