// Termos de uso e política de privacidade (LGPD), mostrados em /termos e
// /privacidade, abertos com ou sem login. Texto simples, em linguagem do dia
// a dia. Revisar com um advogado antes de crescer.
//
// O e-mail de contato (encarregado de dados) vem de EXPO_PUBLIC_CONTACT_EMAIL,
// configurado na Vercel; sem ele, o texto fala só em "suporte".

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  updatedAt: string;
  intro: string;
  sections: LegalSection[];
}

export const LEGAL_UPDATED_AT = '26/10/2026';

const contactEmail = process.env.EXPO_PUBLIC_CONTACT_EMAIL?.trim() || null;

function contactLine(): string {
  return contactEmail
    ? `Para dúvidas ou pedidos sobre seus dados, escreva para ${contactEmail}. Respondemos em até 15 dias.`
    : 'Para dúvidas ou pedidos sobre seus dados, fale com o suporte do Gestão Fácil. Respondemos em até 15 dias.';
}

export const TERMS: LegalDocument = {
  title: 'Termos de uso',
  updatedAt: LEGAL_UPDATED_AT,
  intro:
    'Estes termos explicam as regras para usar o Gestão Fácil, o app de gestão para MEIs e pequenos negócios. Ao criar sua conta, você concorda com eles.',
  sections: [
    {
      title: '1. O que o Gestão Fácil faz',
      paragraphs: [
        'O app ajuda a organizar pedidos, vendas, atendimentos, estoque, clientes, fornecedores, tarefas e o dinheiro do seu negócio. Também oferece páginas públicas opcionais: o link de encomenda e a página de agendamento.',
        'O app não emite nota fiscal, não faz cobranças e não envia mensagens sozinho. Quando ele abre o WhatsApp, o Emissor Nacional ou outro serviço, quem envia ou emite é você, nesse outro serviço.',
      ],
    },
    {
      title: '2. Sua conta',
      paragraphs: [
        'Você precisa de um e-mail válido e uma senha só sua. Não compartilhe a senha. Você responde pelo que for feito com a sua conta.',
        'Você deve ter pelo menos 18 anos, ou ser emancipado, para criar uma conta.',
      ],
    },
    {
      title: '3. Seus dados e os dados dos seus clientes',
      paragraphs: [
        'Tudo o que você cadastra é do seu negócio. Nós só guardamos e mostramos esses dados para você e para quem você colocar na sua empresa.',
        'Quando você cadastra clientes, pacientes ou fornecedores, você é quem decide quais dados guardar e para quê, e deve ter um motivo legítimo para isso (por exemplo, entregar um pedido ou marcar um horário). Evite guardar dados que você não precisa.',
        'Anotações de atendimento podem ter informações sensíveis, como dados de saúde. Registre só o necessário para o atendimento.',
      ],
    },
    {
      title: '4. Uso correto',
      paragraphs: [
        'Não use o app para atividades ilegais, para enviar mensagens em massa sem autorização, nem para tentar acessar dados de outras empresas. Contas que fizerem isso podem ser suspensas.',
      ],
    },
    {
      title: '5. Planos e pagamentos',
      paragraphs: [
        'O plano grátis tem as funções básicas. Os planos pagos, quando contratados, liberam recursos extras pelo período pago. Se o plano vencer, a conta volta ao grátis e seus dados continuam guardados.',
      ],
    },
    {
      title: '6. Disponibilidade',
      paragraphs: [
        'Fazemos o possível para o app ficar sempre no ar e para guardar seus dados com segurança, mas podem acontecer falhas ou paradas para manutenção. Recomendamos guardar também os documentos fiscais exigidos por lei.',
      ],
    },
    {
      title: '7. Encerramento',
      paragraphs: [
        'Você pode excluir sua conta quando quiser, em Configurações → Privacidade → Excluir minha conta. Veja na Política de Privacidade o que acontece com os dados.',
      ],
    },
    {
      title: '8. Mudanças nestes termos',
      paragraphs: [
        'Podemos atualizar estes termos. Quando a mudança for importante, avisaremos no app antes de ela valer.',
        'Estes termos seguem as leis do Brasil.',
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  title: 'Política de privacidade',
  updatedAt: LEGAL_UPDATED_AT,
  intro:
    'Esta política explica, de forma simples, quais dados o Gestão Fácil guarda, para quê e quais são os seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).',
  sections: [
    {
      title: '1. Quem cuida dos dados',
      paragraphs: [
        'Sobre os dados da sua conta (nome, e-mail e uso do app), o Gestão Fácil é o controlador.',
        'Sobre os dados que você cadastra dos seus clientes, pacientes e fornecedores, o controlador é o seu negócio, e o Gestão Fácil é o operador: guardamos e processamos esses dados só para o app funcionar para você.',
      ],
    },
    {
      title: '2. Quais dados guardamos',
      paragraphs: [
        'Da sua conta: nome, e-mail, senha (guardada de forma cifrada, nem nós conseguimos ver) e datas de acesso.',
        'Do seu negócio: nome da empresa, chave Pix, dados da página pública e tudo o que você cadastra, como pedidos, lançamentos, itens, tarefas e anotações.',
        'Dos seus clientes e fornecedores: o que você cadastra, como nome, telefone, endereço, CPF ou CNPJ, aniversário e observações.',
        'De quem usa o link de encomenda ou a página de agendamento: nome, WhatsApp, endereço de entrega (quando pedido) e observações. Para evitar abuso, guardamos um código feito a partir do endereço de internet (IP), que não permite saber qual era o IP.',
        'Erros do app: quando algo dá errado, podemos registrar o erro e o tipo de aparelho, sem nomes, e-mails ou dados dos seus clientes.',
      ],
    },
    {
      title: '3. Para que usamos',
      paragraphs: [
        'Para o app funcionar (execução do contrato), para manter a conta segura, para corrigir erros e para cumprir obrigações legais. Não vendemos dados e não usamos seus dados nem os dos seus clientes para propaganda.',
      ],
    },
    {
      title: '4. Com quem compartilhamos',
      paragraphs: [
        'Só com os serviços que fazem o app funcionar: Supabase (banco de dados e login), Vercel (site) e, quando ligado, Sentry (registro de erros). Esses serviços podem guardar dados fora do Brasil, com proteções previstas na LGPD.',
        'Também podemos entregar dados quando a lei ou uma ordem judicial exigir.',
      ],
    },
    {
      title: '5. Segurança',
      paragraphs: [
        'Os dados trafegam cifrados (HTTPS). Cada empresa só enxerga os próprios dados: o banco bloqueia o acesso de uma conta aos dados de outra, e isso é testado automaticamente. As páginas públicas mostram só o necessário.',
      ],
    },
    {
      title: '6. Por quanto tempo guardamos',
      paragraphs: [
        'Enquanto sua conta existir. Se você excluir a conta, os dados pessoais são anonimizados na hora: nomes, telefones, e-mails, documentos, endereços e anotações somem. Os registros de valores (pedidos e lançamentos, sem nomes) podem ficar guardados pelo prazo exigido pela lei fiscal.',
      ],
    },
    {
      title: '7. Seus direitos',
      paragraphs: [
        'Você pode pedir para confirmar e acessar seus dados, corrigir o que estiver errado, receber uma cópia, saber com quem compartilhamos, revogar o consentimento e excluir a conta. Ver e corrigir dá para fazer direto no app, e a exclusão fica em Configurações → Privacidade → Excluir minha conta. Os outros pedidos são feitos pelo contato abaixo.',
        'Se você é cliente de um negócio que usa o Gestão Fácil, fale primeiro com esse negócio, que é quem decide sobre os seus dados. Se precisar, nós ajudamos.',
        contactLine(),
        'Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).',
      ],
    },
    {
      title: '8. Mudanças nesta política',
      paragraphs: ['Quando mudarmos algo importante, avisaremos no app antes de valer.'],
    },
  ],
};
