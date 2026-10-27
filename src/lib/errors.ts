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
  invalid_professional_name: 'Informe um nome entre 2 e 60 caracteres.',
  professional_exists: 'Já existe um profissional ativo com esse nome.',
  professional_not_found: 'Esse profissional não está mais ativo.',
  invalid_zone_name: 'Informe o nome do bairro (de 2 a 60 caracteres).',
  zone_exists: 'Já existe um bairro ativo com esse nome.',
  invalid_delivery_fee: 'Taxa de entrega inválida. Ex.: 5,00',
  delivery_zone_not_found: 'Esse bairro não está mais ativo para entrega.',
  address_too_long: 'Endereço muito longo (até 300 caracteres).',
  item_not_found: 'Item não encontrado no pedido. Atualize a tela.',
  invalid_invoice_number: 'Informe o número da nota (só letras, números, ponto, barra ou hífen).',
  invalid_issue_date: 'A data de emissão não pode ser no futuro nem de mais de um ano atrás.',
  invoice_exists: 'Este pedido já tem uma nota registrada. Se cancelou no Emissor, marque a nota como cancelada primeiro.',
  invoice_number_taken: 'Esse número de nota já está registrado em outro pedido.',
  slug_taken: 'Esse link já está em uso. Escolha outro.',
  organization_limit_reached: 'Você atingiu o limite de empresas por conta.',
  not_found: 'Registro não encontrado.',
  items_required: 'Adicione pelo menos um item.',
  too_many_items: 'Itens demais para um registro só.',
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
  invalid_amount: 'Informe um valor maior que zero.',
  amount_exceeds_open: 'O valor é maior que o que falta pagar ou receber.',
  invalid_date: 'Data inválida. Datas futuras não valem para pagamentos.',
  invalid_description: 'Informe uma descrição entre 2 e 120 caracteres.',
  account_not_found: 'Conta não encontrada ou inativa.',
  category_not_found: 'Categoria não encontrada ou inativa.',
  entry_cancelled: 'Esse lançamento foi cancelado.',
  entry_has_payments: 'Estorne os pagamentos antes de cancelar.',
  entry_from_order: 'Esse lançamento vem de um pedido. Cancele pelo pedido.',
  order_has_payments: 'Esse pedido já tem recebimento. Estorne o recebimento antes de cancelar.',
  amount_below_paid: 'O novo total ficaria abaixo do que já foi recebido.',
  same_account: 'Escolha contas diferentes.',
  invalid_period: 'Período inválido.',
  supplier_not_found: 'Fornecedor não encontrado.',
  invalid_document: 'CPF ou CNPJ inválido. Use 11 ou 14 dígitos.',
  entry_from_purchase: 'Esse lançamento vem de uma compra. Cancele pela compra.',
  entry_from_installments: 'Essa é uma parcela. Cancele a compra parcelada inteira.',
  invalid_installments: 'Número de parcelas inválido (de 1 a 48, com pelo menos 1 centavo cada).',
  card_not_found: 'Esse cartão não está mais ativo.',
  purchase_has_payments: 'Essa compra já tem pagamento. Estorne o pagamento antes de cancelar.',
  movement_from_purchase: 'Essa entrada veio de uma compra. Para desfazer, cancele a compra.',
  movement_from_production: 'Essa movimentação veio de uma produção. Para desfazer, cancele a produção.',
  recipe_required: 'Esse produto ainda não tem ficha técnica. Cadastre a receita antes de produzir.',
  recipe_not_allowed: 'Só produtos acabados e componentes têm ficha técnica.',
  recipe_self_reference: 'O produto não pode ser insumo dele mesmo.',
  duplicate_input: 'Esse insumo já está na receita.',
  invalid_minutes: 'Tempo de mão de obra inválido.',
  order_not_found: 'Pedido não encontrado ou cancelado.',
  invalid_title: 'Informe um título entre 2 e 120 caracteres.',
  assignee_not_member: 'Essa pessoa não faz parte da empresa.',
  task_cancelled: 'Essa tarefa foi cancelada e não pode mais mudar.',
  order_closed: 'Esse pedido já foi finalizado ou cancelado.',
  forbidden: 'Só o dono ou um administrador pode fazer isso.',
  limit_newer_exists: 'Já existe um limite com início depois dessa data. Use uma data mais recente.',
  limit_same_date: 'Já existe um limite começando nessa data.',
  quote_locked: 'Esse orçamento já foi aprovado, recusado ou cancelado e não pode mais mudar.',
  invalid_duration: 'Duração inválida: use de 5 minutos a 24 horas.',
  invalid_practice_area: 'Área de atendimento só vale para negócios de serviços.',
  customer_required: 'Escolha quem será atendido.',
  schedule_required: 'Informe a data e a hora.',
  not_scheduled: 'Esse atendimento não tem horário marcado.',
  appointment_not_started: 'A falta só pode ser marcada depois do horário.',
  invalid_note: 'Escreva a anotação (até 4.000 caracteres).',
  plan_required: 'O agendamento pelo site faz parte do plano Pro Max.',
  invalid_hours: 'Confira os horários: use horas como 08:00 e o fim depois do início.',
  hours_overlap: 'Dois turnos do mesmo dia se cruzam. Ajuste os horários.',
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
