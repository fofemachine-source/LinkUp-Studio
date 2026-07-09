# Ernesth Barbearia — Sistema Completo + Painel SaaS

Vou replicar o sistema completo que você enviou, com backend real (Lovable Cloud) para persistir dados, autenticação, e envio de mensagens WhatsApp.

## Escopo (10 módulos)

### App da Barbearia (autenticado)
1. **Painel Geral** — faturamento hoje/mês, atendimentos, comissões pendentes, gráfico 7 dias, próximos agendamentos, link público de agendamento com botão copiar.
2. **Agenda** — grid diário por profissional (com foto), slots de 30/45min, bloqueio de conflito, botão "Novo Agendamento Manual", filtro por profissional/data.
3. **Comandas / Venda** — abrir comanda, adicionar serviços/produtos, desconto, forma de pagamento (PIX/dinheiro/cartão), finalizar venda.
4. **Cadastros** — abas Clientes, Profissionais (com upload de foto), Serviços, Produtos, Usuários do sistema.
5. **Assinantes** — plano mensal VIP, CPF, status (ativo/atrasado/bloqueado), QR Code PIX Mercado Pago (chave `051.177.272.66`, titular *Ernesth François Paixão Couto Silva*), histórico de cortes.
6. **Fluxo de Caixa** — entradas/saídas do dia, saldo.
7. **Comissões** — extrato por profissional, filtros de período/situação, marcar como pago.
8. **Relatórios** — faturamento, serviços mais vendidos, top clientes.
9. **Configurações** — abas Identidade (logo, banner, nome, subtítulo, WhatsApp, intervalo padrão, tema), Localização, Funcionamento (horários por dia), WhatsApp (token/instância + templates de mensagem), Segurança, Manutenção.
10. **Minha Assinatura** — status da assinatura SaaS da barbearia.

### Link Público de Agendamento (`/booking/:tenantSlug`)
- Header com logo/banner, seleção de serviço + profissional.
- Toggle "Sou Assinante VIP" → pede CPF, valida contra base de assinantes.
- **Regra VIP**: se VIP, só permite agendar segunda a quinta. Caso contrário, todos os dias abertos.
- Formulário: nome, WhatsApp, data, horário disponível (apenas slots livres do profissional), observações.
- Confirmação envia WhatsApp para cliente e barbeiro.
- Agendamento aparece automaticamente na Agenda sob o profissional escolhido.

### Painel SaaS (`/saas` — separado)
- Login exclusivo do super-admin (você): `william.pinnheiro.g1@gmail.com` / senha `WpG@8858` (será criada via seed no Auth).
- Cadastrar barbearias (tenant): nome, slug, dono, contato, plano (mensal/anual), status.
- Validação de assinatura mensal/anual, bloqueio automático quando vence.
- Métricas: total de barbearias, ativas, MRR.

## Design
- Base fiel às capturas: sidebar branca, cabeçalho com busca, cards com ícones em pastilhas coloridas, azul royal `#2563eb` como primário, tipografia Inter, cantos arredondados médios, sombras suaves. Tema "Barboterapia de Luxo" (clássico limpo + azul real).

## Stack técnica
- TanStack Start + React + Tailwind v4 + shadcn.
- Lovable Cloud (Postgres + Auth + Storage para logos/fotos).
- Multi-tenant: tabela `tenants` (barbearias), toda tabela de dados leva `tenant_id` com RLS filtrando por membership.
- Roles: `super_admin` (SaaS), `owner`, `staff` (barbearia).
- Server functions para: criar agendamento público, validar CPF VIP, gerar QR PIX (payload EMV estático Mercado Pago), enviar WhatsApp (via edge — usarei placeholder de template já que você não deu credencial de gateway WhatsApp; deixo pronto para conectar Z-API / Evolution API depois).

## Entregáveis
- App da barbearia funcionando com todos os módulos acima.
- Link público de agendamento por tenant.
- Painel SaaS em `/saas` — te entrego o link publicado ao final.
- Seu usuário super-admin criado com a senha informada.

## Observações
- Envio real de WhatsApp exige um provedor (Z-API, Evolution, Twilio). Vou deixar a integração pronta com um campo de token nas Configurações; sem o token, o sistema apenas registra a mensagem que seria enviada. Se quiser, me diga qual provedor você usa.
- QR PIX será gerado como payload EMV estático (funciona em qualquer banco). Integração dinâmica com API Mercado Pago (cobrança automática, webhook) é um passo adicional que posso fazer depois se quiser.
- Isso é um projeto grande. Vou construir em fases dentro deste turno começando pelo esqueleto (auth + tenants + design system + navegação + Painel Geral + Agenda + Cadastros + Link público) e sigo com os demais módulos. Se ficar longo demais, entrego o essencial funcionando e continuamos.

Confirma que posso começar?