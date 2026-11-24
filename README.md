# creative-bot

Bot de Discord por produto: PRs e issues do GitHub num canal por produto, moderação de conversas fora do tema e onboarding de novos membros.

A especificação completa está em [`PLANO.md`](PLANO.md). As regras de trabalho no repositório estão em [`CLAUDE.md`](CLAUDE.md).

## Requisitos

- [Bun](https://bun.com) 1.4.4 ou superior (a versão usada no CI e no `Dockerfile`).

## Comandos

```bash
bun install          # instalar dependências
bun run start        # arrancar o bot
bun run dev          # desenvolvimento, com recarga automática
bun run test         # testes
bun run typecheck    # verificação de tipos
bun run test:bots    # testes dos scripts de CI (Node)
```

## Configuração

Em construção. Ainda faltam:

- variáveis de ambiente (`.env`, a partir de `.env.example`);
- `config/config.json` (a partir de `config/config.example.json`);
- intents e permissões do bot no Discord Developer Portal;
- configuração do webhook do GitHub.

### OAuth2 do `/vincular`

No [Discord Developer Portal](https://discord.com/developers/applications), na aplicação do bot:

1. Abrir **OAuth2** → **Redirects** e acrescentar `<PUBLIC_BASE_URL>/vincular/callback`, por exemplo `https://bot.exemplo.ao/vincular/callback`.
2. O endereço tem de coincidir **exactamente** com o que o bot envia: mesmo protocolo, mesmo domínio, sem `/` no fim. Se não coincidir, o Discord recusa o consentimento com `Invalid OAuth2 redirect_uri`.
3. Copiar o **Client ID** e o **Client Secret** para `DISCORD_CLIENT_ID` e `DISCORD_CLIENT_SECRET` no `.env`.

### Permissões dos canais de cada produto

O bot só atribui cargos. Quem decide o que cada membro vê são as permissões dos canais, que se configuram à mão no Discord:

1. Pôr os canais de cada produto numa categoria própria (por exemplo, «Produto X»).
2. Nas permissões da categoria:
   - `@everyone`: **Ver canal** negado;
   - cargo do produto (o `roleId` em `config.json`): **Ver canal** permitido.
3. Sincronizar as permissões dos canais com a categoria.
4. O canal de boas-vindas tem de ser visível ao cargo «Novo», para o membro conseguir fazer o onboarding.
5. No **Server Settings** → **Roles**, o cargo do bot tem de estar **acima** dos cargos «Novo», «Membro» e de todos os cargos de produto. Se não estiver, o Discord recusa a atribuição.

Para confirmar: com **View Server As Role** (em Server Settings → Roles), escolher só o cargo de um produto e verificar que aparecem apenas os canais desse produto.

## Testes manuais

Em construção. Os critérios de aceitação que não forem cobertos por testes automáticos vão ser descritos aqui, marco a marco.

## CI/CD

Fluxo: `issue → branch → PR para DEV → DEV → QUA → PRD`. `PRD` é a branch de release.

| Workflow | Quando corre | O que faz |
| --- | --- | --- |
| `ci.yml` | push e PR para `DEV`, `QUA`, `PRD` | `Typecheck` (tsc), `Tests` (bun test), `Bots scripts` (node --test) e `Docker build` |
| `pr-check.yml` | cada PR | Valida o nome da branch (`<tipo>/[<n.º issue>-]<descricao>`, ex.: `feature/23-login` ou `feature/login`) e o destino. Associar uma issue (`Closes #n` / `Refs #n`) é opcional; se a branch tiver número e o PR associar issues, o número tem de estar entre elas. PRs de funcionalidade vão para `DEV`; `hotfix/*` pode ir para `DEV` ou `QUA`; `PRD` só aceita `QUA`. |
| `promote-qua-prd.yml` | push em `QUA`, fim do CI em `QUA`, revisões | Mantém aberto o PR "Promoção QUA → PRD" e faz o merge quando os checks estão verdes, sem conflitos nem pedidos de alterações. A aprovação de outro colaborador é opcional (`MIN_APPROVALS`, por defeito `0`). |
| `publish.yml` | push em `PRD` (ou manual) | Constrói e publica a imagem em `ghcr.io/creative-mode/creative-bot` (`latest` + sha curto). |
| `dependency-audit.yml` | dia 1 de cada mês (ou manual) | `bun audit`, sem bloquear. |

Configuração no GitHub:

- Settings → Actions → General → activar "Allow GitHub Actions to create and approve pull requests", **ou** criar o secret `PROMOTE_TOKEN` (PAT com scope `repo`).
- Proteger `DEV`, `QUA` e `PRD` exigindo os checks `Typecheck`, `Tests`, `Bots scripts`, `Docker build` e `Verificar branch, destino e issue`.

Correr a imagem:

```bash
docker run -d --env-file .env \
  -v creative-bot-data:/app/data \
  -v "$PWD/config/config.json:/app/config/config.json:ro" \
  -p 3000:3000 ghcr.io/creative-mode/creative-bot:latest
```

Deploy no servidor fica fora deste repositório.
