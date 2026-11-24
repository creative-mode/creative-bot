# creative-bot

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

To type check:

```bash
bun run typecheck
```

Run `bun fmt` to format the code.

This project was created using `bun init` in bun v1.4.5. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

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
