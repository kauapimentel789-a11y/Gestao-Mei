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
  not_found: 'Registro não encontrado.',
  items_required: 'Adicione pelo menos um item.',
  too_many_items: 'Máximo de 100 itens por pedido.',
  product_not_found: 'Um dos itens não existe mais. Atualize a lista e tente de novo.',
  customer_not_found: 'Cliente não encontrado.',
  invalid_quantity: 'Quantidade inválida.',
  price_required: 'Informe o preço de todos os itens.',
  description_required: 'Informe a descrição de todos os itens.',
  invalid_discount: 'O desconto não pode ser maior que o valor dos itens.',
  invalid_status: 'Status inválido.',
  invalid_transition: 'Essa mudança de status não é permitida.',
  cancel_reason_required: 'Informe o motivo do cancelamento.',
  order_locked: 'Pedidos concluídos, entregues ou cancelados não podem ser editados.',
  module_not_enabled: 'Esse recurso não está disponível para o seu tipo de negócio.',
  idempotency_key_required: 'Algo deu errado. Tente de novo.',
  insufficient_stock: 'Estoque insuficiente para essa saída.',
  stock_not_tracked: 'Este item não controla estoque.',
  invalid_movement_type: 'Tipo de movimentação inválido.',
  reason_required: 'Informe o motivo.',
  no_change: 'A contagem é igual ao saldo atual. Nada a ajustar.',
  cannot_reverse_reversal: 'Um estorno não pode ser estornado.',
  order_cancelled: 'Pedido cancelado não movimenta estoque.',
  order_stock_consumed: 'Os itens já foram baixados do estoque e não podem mudar.',
};

// Erros de restrição do Postgres (constraint) que o usuário pode causar.
const BY_CODE: Record<string, string> = {
  '23505': 'Já existe um registro com esses dados.',
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
  if (e.code && BY_CODE[e.code]) return BY_CODE[e.code];
  if (e.message === 'Network request failed' || e.message?.includes('fetch')) {
    return 'Sem conexão. Verifique a internet e tente de novo.';
  }
  return 'Algo deu errado. Tente de novo.';
}
