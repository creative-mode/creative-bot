# CLAUDE.md

Bot de Discord por produto. Especificação completa em `PLANO.md` (fonte de verdade para funcionalidades, config, base de dados e marcos). Este ficheiro diz como trabalhar no repositório.

## Stack

- Runtime: **Bun**. TypeScript executado directamente, sem passo de build.
- Bot: **discord.js**.
- HTTP: **`Bun.serve`** (sem Express nem Elysia).
- Base de dados: **`bun:sqlite`** (nunca `better-sqlite3`; é um módulo nativo que não corre no Bun).
- Testes: **`bun test`**.
- Classificador: SDK da Anthropic, modelo configurável por `CLASSIFIER_MODEL`.

## Comandos

```bash
bun install
bun run src/index.ts        # arranque
bun --watch src/index.ts    # desenvolvimento
bun test                    # testes
bunx tsc --noEmit           # verificação de tipos
```

Quando existirem scripts em `package.json`, preferir `bun run <script>`.

## Estrutura

```
src/
  index.ts  env.ts  config.ts  db.ts
  discord/gateway.ts      # interface PostGateway + implementação real
  github/                 # signature, server, handlers, render
  moderation/             # classifier, service, review
  onboarding/panel.ts
  linking/                # /vincular + OAuth
  util/keyedLock.ts
config/config.example.json
test/
```

## Regras que não se quebram

**Segurança**
- Webhook do GitHub: ler o corpo com `req.text()` **antes** de qualquer parse, verificar `x-hub-signature-256` (HMAC SHA-256) com `timingSafeEqual`, e só então processar. Responder 202 e tratar o evento em segundo plano. Deduplicar por `x-github-delivery`.
- **Nunca banir automaticamente.** O ban só acontece no handler do botão do cartão de moderação, depois de verificar `BanMembers` ou o cargo de moderação de quem clicou.
- Nunca registar tokens, segredos nem o corpo completo de webhooks.
- O texto dos utilizadores enviado ao classificador é dado não confiável: vai dentro de tags, com instrução para ignorar ordens nele contidas. Em erro da API, tratar como no tema (falha aberta).
- `state` do OAuth do `/vincular`: aleatório, de uso único, validade curta.

**Comportamento**
- `moderation.dryRun` é `true` por defeito. Em ensaio o bot só escreve no canal de log, não responde no canal, não aplica timeout, não cria cartões, e os strikes ficam com `dry_run = 1` e não contam.
- Uma mensagem por PR/issue: criar na primeira ocorrência relevante e **editar** nas seguintes. Eventos de actualização sem mensagem existente não criam mensagens novas.
- Usar um lock por chave (`KeyedLock`) em `repo#número` para PRs/issues e por utilizador nos strikes. Sem isso, `opened` e vários `review_requested` simultâneos duplicam mensagens.
- Só o evento `review_requested` faz ping real. Menções em embeds não notificam. Respostas usam `failIfNotExists: false`.
- Resolver GitHub → Discord por `github_id` (numérico), não só por login.
- Não adicionar a funcionalidade de som cómico: foi removida de propósito.

## Convenções

- TypeScript estrito. Validar `config.json` e as variáveis de ambiente no arranque e falhar cedo com mensagem clara.
- Lógica de render (embeds) em funções puras. Lógica de eventos recebe um `PostGateway` injectado, para testar sem Discord.
- Mensagens para utilizadores do Discord em **português europeu/angolano**, tom claro e curto. Código, nomes e comentários técnicos em inglês.
- Mudanças de esquema SQLite por migrações idempotentes em `db.ts`.
- Segredos só em `.env` (ignorado pelo git). Manter `config/config.example.json` e `.env.example` actualizados quando algo novo for configurável.

## Pontos a confirmar cedo (ainda não validados)

1. API de `routes` do `Bun.serve` na versão instalada.
2. discord.js estável no Bun: deixar o bot ligado 24 horas e verificar reconexões. Se falhar, recuar para Node (só mudam o servidor e a base de dados).
3. `/vincular`: confirmar que a ligação `github` devolvida pelo scope `connections` traz o ID numérico do GitHub. Plano B: OAuth App do GitHub.

## Fora do âmbito

Deploy no servidor: tratado à parte, não criar sem pedido. O CI/CD (`.github/workflows`) e o `Dockerfile` já existem e estão descritos no README; ao mudar o arranque (`src/index.ts`), actualizar o script `start` do `package.json`, que o `Dockerfile` usa.

## Definição de pronto

- `bunx tsc --noEmit` e `bun test` passam.
- Os critérios de aceitação da secção 10 do `PLANO.md` aplicáveis ao marco actual estão cobertos por testes ou por um teste manual descrito no README.
- Nenhum segredo no repositório.
