# Bot de Discord por produto — Plano de implementação

Documento para guiar a implementação (pensado para ser entregue ao Claude Code). Deploy e Dockerfile ficam fora deste plano: serão tratados à parte.

## 1. Objectivo

Um bot para um servidor Discord com vários produtos, com três funcionalidades:

1. **GitHub → Discord:** um canal por produto recebe PRs e issues (via webhook do GitHub), com contexto, quem fez, quem fará e quem deve rever.
2. **Moderação de conversas fora do tema** em canais com uma finalidade definida, com escalonamento e ban só com aprovação humana.
3. **Onboarding** de novos membros.

Fora do âmbito: som cómico nas notificações (removido por decisão do Dizono, porque o Discord não toca áudio em canais de texto).

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Runtime | Bun |
| Bot | discord.js (corre no Bun sem configuração extra, segundo a documentação do Bun) |
| Servidor HTTP | `Bun.serve` (sem Express nem Elysia; há 3 rotas) |
| Base de dados | `bun:sqlite` (embutido) |
| Testes | `bun test` |
| Classificador | API da Anthropic, modelo Haiku (configurável por env) |
| Moderação | Escalonada: aviso → timeout → cartão para moderador (ban só com clique). **Começa em modo de ensaio** |
| Mapa GitHub → Discord | Comando `/vincular` (ver 6.4) |
| Deploy / Dockerfile | Fora deste plano; trata o Claude Code |

## 3. Arquitectura

Um único processo Bun:

```
Bun.serve ──► /webhooks/github   (HMAC, dedupe, 202 imediato)
          ├─► /healthz
          └─► /vincular/*        (callback OAuth2 do Discord)
discord.js Client ──► eventos: messageCreate, guildMemberAdd, interactionCreate
bun:sqlite  ──► estado
Anthropic API ──► classificação fora-do-tema
```

Estrutura sugerida:

```
src/
  index.ts            # arranque: client, servidor, handlers, shutdown limpo
  env.ts              # validação de variáveis de ambiente
  config.ts           # carrega e valida config.json (zod ou validação manual)
  db.ts               # bun:sqlite + migrações
  discord/gateway.ts  # interface PostGateway (send/edit) + implementação real
  github/signature.ts # verificação HMAC
  github/server.ts    # rotas
  github/handlers.ts  # lógica por evento
  github/render.ts    # embeds (funções puras)
  moderation/classifier.ts
  moderation/service.ts
  moderation/review.ts   # botões do cartão de moderação
  onboarding/panel.ts
  linking/            # /vincular + OAuth
  util/keyedLock.ts
config/config.example.json
test/
```

## 4. Configuração (`config.json`)

```jsonc
{
  "guildId": "…",
  "products": [
    {
      "id": "produto-x",
      "name": "Produto X",
      "roleId": "…",                    // cargo que dá acesso aos canais do produto
      "repos": ["org/repo-a", "org/repo-b"],
      "githubChannelId": "…",           // canal de PRs/issues
      "watchedChannels": [
        { "channelId": "…", "purpose": "Discussão técnica e dúvidas de uso do Produto X" }
      ]
    }
  ],
  "moderation": {
    "dryRun": true,                     // ensaio: só regista no log, não age
    "logChannelId": "…",
    "moderatorRoleId": "…",
    "timeoutMinutes": 10,
    "strikeWindowDays": 14,
    "strikeCooldownSeconds": 300,
    "minConfidence": 0.8,
    "minMessageLength": 15,
    "contextMessages": 5
  },
  "onboarding": {
    "welcomeChannelId": "…",
    "newMemberRoleId": "…",
    "memberRoleId": "…",
    "rules": ["…"]
  }
}
```

Variáveis de ambiente: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `PUBLIC_BASE_URL`, `GITHUB_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `CLASSIFIER_MODEL`, `PORT`, `CONFIG_PATH`, `DATABASE_PATH`.
Sem `ANTHROPIC_API_KEY`, a moderação fica desligada com aviso no arranque.

## 5. Base de dados (SQLite)

- `github_messages(key PK, channel_id, message_id, updated_at)` — `key` = `repo#pr|issue#número`.
- `deliveries(id PK, received_at)` — dedupe por `x-github-delivery` (limpar entradas antigas).
- `strikes(id, user_id, channel_id, message_id, reason, created_at, dry_run)` — strikes de ensaio não contam para escalonar.
- `mod_reviews(id, user_id, status, message_id, created_at)` — `pending | banned | timeout | dismissed`.
- `onboarding(user_id PK, selected_products, status)`.
- `github_links(discord_id PK, github_id UNIQUE, github_login, linked_at)`.

## 6. Funcionalidades

### 6.1 GitHub → Discord

- **Endpoint** `POST /webhooks/github`: ler o corpo bruto com `req.text()`, verificar `x-hub-signature-256` (HMAC SHA-256 + `timingSafeEqual`), ignorar `ping`, deduplicar por `x-github-delivery`, responder **202** e processar em segundo plano.
- **Roteamento:** `repository.full_name` (minúsculas) → produto → `githubChannelId`. Repos não mapeados são ignorados.
- **Eventos:** `pull_request`, `pull_request_review`, `issues`.
- **Embed da PR:** título + link, resumo do corpo (sem comentários HTML, truncado), `branch → base`, `+adições −remoções · N ficheiros`, labels, estado por cor (aberta, rascunho, merged, fechada).
  - **Quem fez:** autor da PR.
  - **Quem fará:** assignees.
  - **Quem revê:** `requested_reviewers` e equipas.
- **Embed da issue:** igual, com autor, assignees, labels, estado e motivo de fecho (`completed` / `not_planned`).
- **Menções:** resolver o login via `github_links` (preferir `github_id` ao login, que pode mudar). Quem não estiver vinculado aparece como link para o perfil. Menções dentro de embeds não notificam.
- **Uma mensagem por PR/issue:** criar na primeira ocorrência relevante (`opened`, `reopened`, `ready_for_review`, `review_requested`, `assigned` em issues) e **editar** nas seguintes (`edited`, `labeled`, `converted_to_draft`, `closed`, etc.). Eventos de actualização sem mensagem existente não criam mensagens novas.
- **Respostas à mensagem original** (com `failIfNotExists: false`): pedido de review (**único com ping real** ao reviewer vinculado), review aprovada / com alterações pedidas / comentário com texto, saída de rascunho, merge, fecho, atribuição de issue.
  - `opened` não faz ping: o GitHub envia um `review_requested` por reviewer logo a seguir.
  - Ignorar `synchronize` (ruído).
- **Concorrência:** lock por chave `repo#número` (um `KeyedLock`), porque `opened` e vários `review_requested` chegam quase em simultâneo e criariam mensagens duplicadas.
- Se a mensagem original tiver sido apagada, enviar uma nova e actualizar a base de dados.

### 6.2 Moderação de conversas fora do tema

**Detecção** (`messageCreate`): ignorar DMs, bots, canais não vigiados, mensagens curtas, e membros moderadores (cargo de moderação ou `ManageMessages`). Se o utilizador acabou de receber um strike (cooldown), saltar a classificação para poupar custo.

**Classificador** (Haiku, *tool use* forçado):
- Entrada: finalidade do canal + últimas N mensagens como contexto + a mensagem a avaliar.
- Saída: `off_topic: boolean`, `confidence: 0–1`, `category`, `reason`.
- O texto dos utilizadores é **dados não confiáveis**: ir dentro de tags, com instrução explícita de ignorar ordens contidas nas mensagens (injecção de prompt).
- Ser **tolerante**: cumprimentos, humor curto e respostas naturais ao contexto são no tema. Só sinaliza desvios claros (ex.: namoro, política, assuntos pessoais longos).
- Em erro da API: tratar como no tema (falha aberta) e registar.

**Escalonamento** (strikes dos últimos `strikeWindowDays`, com `strikeCooldownSeconds` entre strikes):

| Strike | Acção |
|---|---|
| 1 | Resposta pública com aviso e a finalidade do canal |
| 2 | Timeout de `timeoutMinutes` + aviso |
| 3+ | Cartão no `logChannelId` (embed com histórico e links para as mensagens) com botões **Banir / Timeout 24h / Perdoar**, ping ao cargo de moderação. Se já houver cartão pendente, aplica novo timeout em vez de criar outro |

- **Ban só com clique** de quem tenha `BanMembers` ou o cargo de moderação (verificar no handler do botão). `Perdoar` apaga os strikes activos. `customId`: `mod:<acção>:<reviewId>`.
- Usar um lock por utilizador ao aplicar strikes.

**Modo de ensaio (`dryRun: true`, valor inicial):** o bot classifica e escreve no log, por exemplo `[ENSAIO] teria avisado @x em #canal (confiança 0,91): motivo…`, mas **não** responde no canal, não aplica timeout e não cria cartões. Os registos ficam com `dry_run = 1` e não contam. Serve para calibrar `minConfidence` e a descrição das finalidades antes de passar a acção real.

### 6.3 Onboarding

1. `guildMemberAdd` (ignorar bots): atribuir o cargo "Novo" e publicar no canal de boas-vindas um painel com menção ao membro, as regras, um menu de selecção de produtos (máx. 25) e o botão "Aceito as regras".
2. Menu: guarda a selecção em `onboarding` e actualiza o painel (`interaction.update`) com as opções marcadas por defeito.
3. Botão: exige pelo menos um produto; atribui os cargos dos produtos e o de "Membro", retira o de "Novo", marca como concluído e substitui o painel por uma mensagem final sem componentes.
4. `customId` com o ID do utilizador (`onb:<tipo>:<userId>`); quem não for o dono recebe resposta efémera. O estado vive na base de dados, por isso sobrevive a reinícios.

### 6.4 `/vincular` (GitHub ↔ Discord)

Objectivo: ligar cada conta Discord a uma conta GitHub **com prova de propriedade**, para mencionar as pessoas certas.

Proposta (a confirmar no teste inicial): usar o OAuth2 do Discord com os scopes `identify connections`.
1. `/vincular` responde (efémero) com um link para `PUBLIC_BASE_URL/vincular/start?state=…`, onde `state` é um token de uso único, curto e associado ao utilizador.
2. A página redirecciona para o consentimento OAuth2 do Discord.
3. No callback, o bot troca o código, lê as ligações da conta e procura a do tipo `github`. Guarda `github_id` e `github_login` em `github_links`.
4. Se a pessoa não tiver o GitHub ligado no perfil do Discord, a página explica como ligar e tentar de novo.
- Comandos auxiliares: `/vincular ver` (mostrar o vínculo actual), `/desvincular`, e um comando só para administradores que vincula manualmente (`/vincular-admin utilizador login`) para casos sem GitHub ligado.
- Alternativa se o ponto 3 não funcionar como esperado: OAuth App do GitHub (fluxo web), que prova a posse directamente, à custa de criar mais uma aplicação.
- Registar os slash commands no arranque (por guild, para propagarem de imediato).

## 7. Requisitos no Discord

- **Intents privilegiadas:** Server Members e Message Content (activar no Developer Portal).
- **Permissões do bot:** ver canais, enviar mensagens, embeds, ler histórico, gerir cargos, moderar membros (timeout), banir.
- O cargo do bot tem de estar **acima** dos cargos que atribui (Novo, Membro, cargos de produto).
- Webhook do GitHub: URL público `/webhooks/github`, `application/json`, segredo partilhado, eventos *Issues*, *Pull requests*, *Pull request reviews*.

## 8. Segurança e privacidade

- Verificar sempre a assinatura antes de processar; comparar em tempo constante.
- Nunca registar tokens nem o corpo completo dos webhooks.
- `state` do OAuth: aleatório, de uso único, com expiração curta.
- As mensagens dos canais vigiados são enviadas à API da Anthropic para classificação: avisar isto nas regras do servidor.
- Ban nunca é automático.

## 9. Marcos

1. **Base + teste do gateway:** projecto Bun, config, SQLite, ligação ao Discord e `Bun.serve`. Deixar o bot ligado **24 horas** para validar reconexões do discord.js no Bun. Confirmar a API de `routes` do `Bun.serve` e o `bun:sqlite`. Se o gateway for instável, recuar para Node (só mudam o servidor e a base de dados).
2. **Webhook do GitHub** com testes: assinatura, dedupe, embeds, handler com `PostGateway` falso, e script para enviar payloads de exemplo assinados.
3. **`/vincular`** (inclui validar o formato das ligações do Discord).
4. **Onboarding.**
5. **Moderação em modo de ensaio** durante alguns dias; só depois `dryRun: false`.
6. README com a configuração do Discord e do GitHub. Deploy fica para o Claude Code.

## 10. Critérios de aceitação

- Uma PR aberta com 2 reviewers gera **uma** mensagem no canal certo, com autor, reviewers e estado, e dois pings (um por reviewer).
- Fechar ou fazer merge actualiza a mesma mensagem e responde a ela.
- Pedidos com assinatura inválida recebem 401; entregas repetidas não duplicam mensagens.
- Em ensaio, mensagens fora do tema só aparecem no canal de log; fora do ensaio, seguem aviso → timeout → cartão.
- Nenhum ban acontece sem clique de um moderador autorizado.
- Um membro novo consegue concluir o onboarding e passa a ver apenas os canais dos produtos escolhidos.
- `/vincular` liga uma conta e as menções passam a usar `<@id>`.
