# LinkUp Studio — WhatsApp Connector

Serviço Node persistente responsável por:

- manter uma sessão WhatsApp Web separada por loja/tenant;
- gerar o QR Code como `data URL`;
- restaurar automaticamente sessões salvas depois de reinícios;
- enviar mensagens solicitadas pela API do projeto;
- consumir `public.whatsapp_message_queue` no Supabase;
- renderizar os modelos da fila e o link de cancelamento;
- registrar tentativas, sucesso, falha e o ID da mensagem no próprio registro da fila.

O conector usa `@whiskeysockets/baileys`, uma integração não oficial com o
WhatsApp Web. Ela pode sofrer mudanças ou restrições impostas pelo WhatsApp.

## Por que o serviço roda separado

Uma sessão do WhatsApp Web precisa manter conexão permanente. Funções
serverless e Edge Functions são executadas sob demanda e não mantêm o socket
vivo. Por isso, o painel continua no Lovable/Supabase e este serviço roda 24
horas no Render com um disco persistente.

## Pré-requisitos

1. A migration que cria `tenant_whatsapp_settings` e
   `whatsapp_message_queue` precisa estar aplicada no Supabase.
2. O Render precisa usar um plano pago, pois o serviço não pode hibernar.
3. O disco persistente precisa permanecer montado no caminho configurado por
   `LINKUP_WHATSAPP_DATA_DIR`.
4. A chave `service_role` deve existir somente no Render. Nunca coloque essa
   chave em variáveis `VITE_*`, no navegador ou no repositório.

## Variáveis de ambiente

Obrigatórias:

```bash
LINKUP_WHATSAPP_CONNECTOR_SECRET=segredo-compartilhado-com-o-backend
LINKUP_WHATSAPP_DATA_DIR=/var/data/whatsapp
LINKUP_PUBLIC_APP_URL=https://seu-dominio-publico.example
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role
```

O serviço também aceita `SUPABASE_SECRET_KEY` como alternativa ao nome legado
`SUPABASE_SERVICE_ROLE_KEY`.

Opcionais:

```bash
HOST=0.0.0.0
PORT=10000
LOG_LEVEL=info
BAILEYS_LOG_LEVEL=silent
LINKUP_WHATSAPP_QR_MAX_AGE_MS=45000
LINKUP_WHATSAPP_RECONNECT_DELAY_MS=2500
LINKUP_WHATSAPP_QUEUE_ENABLED=true
LINKUP_WHATSAPP_QUEUE_POLL_MS=3000
LINKUP_WHATSAPP_QUEUE_BATCH_SIZE=10
LINKUP_WHATSAPP_QUEUE_CONCURRENCY=3
LINKUP_WHATSAPP_QUEUE_LOCK_TIMEOUT_MS=300000
LINKUP_WHATSAPP_RETRY_BASE_MS=30000
LINKUP_WHATSAPP_RETRY_MAX_MS=900000
```

## Rodar localmente

```bash
cd services/whatsapp-connector
npm ci
npm start
```

Para testar somente o servidor e as rotas sem acessar a fila:

```bash
LINKUP_WHATSAPP_QUEUE_ENABLED=false
```

O segredo do conector continua obrigatório.

## Rotas

Os endpoints de saúde são públicos:

```text
GET /
GET /health
GET /healthz
```

As demais rotas exigem:

```text
x-linkup-connector-secret: <LINKUP_WHATSAPP_CONNECTOR_SECRET>
```

Rotas por sessão:

```text
GET    /stores/:sessionId/status
POST   /stores/:sessionId/connect
DELETE /stores/:sessionId/session
POST   /stores/:sessionId/send
```

Exemplo de envio:

```json
{
  "phone": "11999999999",
  "message": "Mensagem de teste"
}
```

## Processamento da fila

O worker:

1. seleciona mensagens `pending` cujo `scheduled_for` já venceu;
2. reivindica cada linha com uma atualização condicional de status e número de
   tentativas;
3. confirma que a automação da loja continua habilitada;
4. renderiza variáveis como `{cliente}`, `{salao}`, `{profissional}`,
   `{servico}`, `{data}`, `{hora}` e `{link_cancelamento}`;
5. envia usando a sessão indicada pela configuração do tenant;
6. grava `sent_at`, `provider_message_id`, `rendered_message` e o novo status.

Falhas transitórias usam retentativa com atraso exponencial. Telefone inválido,
número inexistente no WhatsApp, modelo vazio e lembrete vencido são encerrados
sem novas tentativas. Locks abandonados por reinício do processo são
recuperados automaticamente.

O evento `client_registered` usa a mesma fila para confirmar o cadastro do
cliente. Ele não possui agendamento associado e usa as variáveis `{cliente}` e
`{salao}`.

O link de cancelamento é montado assim:

```text
{LINKUP_PUBLIC_APP_URL}/booking/{tenant_slug}?cancel={cancellation_token}
```

## Persistência e escala

Cada sessão fica em:

```text
{LINKUP_WHATSAPP_DATA_DIR}/sessions/{sessionId}
```

Não escale este serviço horizontalmente enquanto as sessões estiverem em um
único disco local. O Blueprint cria uma única instância Starter com disco
persistente.

## Implantação no Render

O arquivo `render.yaml` na raiz do repositório já declara o serviço. Ao criar o
Blueprint, o Render solicitará as variáveis marcadas com `sync: false`.

Depois da implantação:

1. copie a URL pública do serviço;
2. configure essa URL como `LINKUP_WHATSAPP_CONNECTOR_URL` no backend do
   Lovable/Supabase;
3. use exatamente o mesmo `LINKUP_WHATSAPP_CONNECTOR_SECRET` nos dois lados;
4. abra Configurações > WhatsApp e gere o QR Code.
