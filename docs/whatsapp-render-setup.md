# WhatsApp 24 horas no Render

O módulo usa uma única conexão de WhatsApp por loja:

1. A tela do salão chama a Edge Function `whatsapp-connector`.
2. A Edge Function valida o usuário e a loja.
3. O conector Node/Baileys fica ativo no Render.
4. As sessões são gravadas em um disco persistente.
5. Cadastros de clientes, agendamentos, remarcações, cancelamentos e lembretes entram em
   `whatsapp_message_queue`.
6. Um Job do Lovable/Supabase chama a Edge Function para processar a fila sem
   bloquear a criação do agendamento.

## Modo recomendado para reaproveitar um Render existente

Quando o mesmo Render precisa atender mais de um projeto LinkUp, mantenha o
Render como conector compartilhado. Ele deve cuidar apenas de QR Code, sessão e
envio direto pelo endpoint `/stores/:tenantId/send`.

Nesse modo:

- o Render continua com `LINKUP_WHATSAPP_CONNECTOR_SECRET` e
  `LINKUP_WHATSAPP_DATA_DIR`;
- o projeto Lovable recebe `LINKUP_WHATSAPP_CONNECTOR_URL` e
  `LINKUP_WHATSAPP_CONNECTOR_SECRET`;
- não coloque `SUPABASE_URL` nem `SUPABASE_SERVICE_ROLE_KEY` nesse Render
  compartilhado, porque isso amarra o worker de fila a uma única base;
- cada projeto processa a própria fila chamando a Edge Function
  `whatsapp-connector` com a ação `process-queue`.

## Requisitos

- Render no plano `Starter` ou superior.
- Um Persistent Disk montado em `/var/data`.
- Projeto conectado ao Supabase/Lovable Cloud.
- Migração `20260716231000_whatsapp_automation.sql` aplicada.
- Migração `20260717130424_customer_booking_accounts.sql` aplicada.
- Edge Function `whatsapp-connector` publicada.

O plano gratuito do Render não mantém o processo ativo 24 horas e não oferece
disco persistente. Sem o disco, o QR Code precisaria ser lido novamente depois
de reinícios e novos deploys.

## 1. Banco e Edge Function

Aplicar as migrações e publicar a função:

```powershell
npx supabase db push
npx supabase functions deploy whatsapp-connector
```

Se o projeto for administrado pelo Lovable Cloud, a migração pode ser executada
no SQL Editor e a função pode ser publicada pelo fluxo de deploy do próprio
Lovable.

Para conferir se o banco ficou pronto para o WhatsApp, rode no SQL Editor:

```sql
select
  to_regclass('public.tenant_whatsapp_settings') is not null as tem_configuracoes_whatsapp,
  to_regclass('public.whatsapp_message_queue') is not null as tem_fila_whatsapp,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenant_whatsapp_settings'
      and column_name = 'notify_client_registration'
  ) as tem_cadastro_cliente_whatsapp,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenant_whatsapp_settings'
      and column_name = 'client_registration_template'
  ) as tem_template_cadastro_cliente,
  exists (
    select 1
    from pg_trigger
    where tgname = 'queue_appointment_whatsapp_messages'
  ) as tem_trigger_agendamentos,
  exists (
    select 1
    from pg_trigger
    where tgname = 'enqueue_customer_registration_whatsapp'
  ) as tem_trigger_cadastro_cliente,
  exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_message_queue_event_type_check'
      and pg_get_constraintdef(oid) like '%client_registered%'
  ) as fila_aceita_cadastro_cliente;
```

Todos os campos precisam voltar `true`. Se algum voltar `false`, a migração de
WhatsApp ou a migração de cadastro de cliente ainda precisa ser aplicada.

## 2. Criar um segredo compartilhado

Gere uma senha longa e aleatória. O mesmo valor deve ser cadastrado no Render e
nos segredos das Edge Functions:

```text
LINKUP_WHATSAPP_CONNECTOR_SECRET
```

Não use prefixo `VITE_` e nunca coloque esse segredo em uma tabela pública ou no
frontend.

## 3. Publicar o conector no Render

Se for criar um Render exclusivo para este projeto, crie um Blueprint usando o
`render.yaml` da raiz deste repositório e preencha as variáveis marcadas como
secretas:

```text
LINKUP_WHATSAPP_CONNECTOR_SECRET=<mesmo segredo da Edge Function>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role/secret key do projeto>
LINKUP_PUBLIC_APP_URL=https://barber-pro-plus.lovable.app
```

Se for reaproveitar o Render compartilhado já existente
`https://linkup-whatsapp-connector.onrender.com`, mantenha nele apenas:

```text
LINKUP_WHATSAPP_CONNECTOR_SECRET=<segredo compartilhado>
LINKUP_WHATSAPP_DATA_DIR=/var/data/whatsapp
```

O Blueprint cria:

- serviço web Node;
- health check;
- uma única instância;
- plano `Starter`;
- disco persistente em `/var/data`;
- diretório de sessões em `/var/data/whatsapp`.

Depois do deploy, confirme:

```text
https://<servico>.onrender.com/health
```

## 4. Conectar a Edge Function ao Render

Cadastre estes segredos no Supabase/Lovable Cloud:

```text
LINKUP_WHATSAPP_CONNECTOR_URL=https://linkup-whatsapp-connector.onrender.com
LINKUP_WHATSAPP_CONNECTOR_SECRET=<mesmo segredo do Render>
```

Publique novamente a Edge Function após alterar os segredos, caso a plataforma
solicite.

Opcional, mas recomendado para preencher `{link_cancelamento}` nos modelos de
mensagem:

```text
LINKUP_PUBLIC_APP_URL=https://barber-pro-plus.lovable.app
```

## 4.1. Job para mensagens automáticas

Crie um Job no Lovable/Supabase para rodar a cada minuto chamando:

```text
POST https://<project-ref>.supabase.co/functions/v1/whatsapp-connector
```

Headers:

```text
Content-Type: application/json
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <SUPABASE_ANON_KEY>
x-linkup-connector-secret: <LINKUP_WHATSAPP_CONNECTOR_SECRET>
```

Body:

```json
{
  "action": "process-queue",
  "limit": 10
}
```

Esse Job é o que faz sair automaticamente:

- confirmação do agendamento para o cliente;
- aviso de novo agendamento para o profissional;
- lembrete antes do horário;
- cancelamentos e remarcações.

## 5. Conectar uma loja

No sistema:

1. Entre como proprietário, equipe administrativa ou superadministrador.
2. Abra `Configurações > WhatsApp`.
3. Clique em `Conectar WhatsApp`.
4. Leia o QR Code com o aparelho da loja.
5. Ative as automações desejadas.
6. Salve e envie uma mensagem de teste.

Cada loja usa o próprio `tenant_id` como identificador de sessão. Assim, uma
loja não acessa nem substitui a conexão de outra.

## 6. Operação

- O Render tenta restaurar as sessões após reinício.
- Mensagens com falha são tentadas novamente com atraso progressivo.
- A tela mostra o histórico recente e permite reenviar falhas.
- Se o WhatsApp encerrar a sessão, será necessário gerar um novo QR Code.
- Não aumente o serviço para mais de uma instância enquanto as sessões estiverem
  em um único Persistent Disk.

## Segurança

- A chave `SUPABASE_SERVICE_ROLE_KEY` existe apenas no Render.
- O segredo do conector existe apenas no Render e nas Edge Functions.
- O navegador nunca chama o Render diretamente.
- A fila e as configurações possuem isolamento por loja e RLS.
- O conector aceita somente requisições com
  `x-linkup-connector-secret`.

## Observação

O Baileys usa o WhatsApp Web e não é uma integração oficial da Meta. Use o
módulo para mensagens transacionais do salão, evitando campanhas em massa ou
spam.
