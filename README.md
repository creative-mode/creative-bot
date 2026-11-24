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

Em construção. Esta secção vai descrever:

- variáveis de ambiente (`.env`, a partir de `.env.example`);
- `config/config.json` (a partir de `config/config.example.json`);
- configuração da aplicação no Discord Developer Portal (intents, permissões, OAuth2);
- configuração do webhook do GitHub;
- permissões dos canais de cada produto.

## Testes manuais

Em construção. Os critérios de aceitação que não forem cobertos por testes automáticos vão ser descritos aqui, marco a marco.

## CI/CD

Fluxo: `issue → branch → PR para DEV → DEV → QUA → PRD`. `PRD` é a branch de release.

| Workflow | Quando corre | O que faz |
| --- | --- | --- |
| `ci.yml` | push e PR para `DEV`, `QUA`, `PRD` | `Typecheck` (tsc), `Tests` (bun test), `Bots scripts` (node --test) e `Docker build` |
| `pr-check.yml` | cada PR | Valida o nome da branch (`<tipo>/<n.º issue>-<descricao>`, ex.: `feature/23-login`), o destino e a associação `Closes #n` / `Refs #n`. PRs de funcionalidade vão para `DEV`; `hotfix/*` pode ir para `DEV` ou `QUA`; `PRD` só aceita `QUA`. |
| `promote-qua-prd.yml` | push em `QUA`, fim do CI em `QUA`, revisões | Mantém aberto o PR "Promoção QUA → PRD" e faz o merge quando os checks estão verdes e há aprovação de quem tem escrita. |
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
