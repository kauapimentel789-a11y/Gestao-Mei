// Traduz erros do Supabase em mensagens curtas, sem revelar detalhes internos.

interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
}

const BY_MESSAGE: Record<string, string> = {
  // Erros lançados pelas nossas RPCs (raise exception '<chave>')
  not_authenticated: 'Sua sessão expirou. Entre de novo.',
  invalid_name: 'Informe um nome entre 2 e 80 caracteres.',
  invalid_slug: 'Use só letras, números e hífen no link (de 2 a 48 caracteres).',
  slug_taken: 'Esse link já está em uso. Escolha outro.',
  organization_limit_reached: 'Você atingiu o limite de empresas por conta.',
};

const AUTH_CODES: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
  user_already_exists: 'Não foi possível criar a conta com esse e-mail.',
  weak_password: 'Escolha uma senha mais forte (mínimo de 8 caracteres).',
  over_email_send_rate_limit: 'Muitas tentativas. Aguarde alguns minutos.',
  over_request_rate_limit: 'Muitas tentativas. Aguarde alguns minutos.',
};

export function friendlyError(error: unknown): string {
  const e = (error ?? {}) as ErrorLike;
  if (e.message && BY_MESSAGE[e.message]) return BY_MESSAGE[e.message];
  if (e.code && AUTH_CODES[e.code]) return AUTH_CODES[e.code];
  if (e.message === 'Network request failed' || e.message?.includes('fetch')) {
    return 'Sem conexão. Verifique a internet e tente de novo.';
  }
  return 'Algo deu errado. Tente de novo.';
}
