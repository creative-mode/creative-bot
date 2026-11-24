# creative-bot

Bot de Discord por produto: PRs e issues do GitHub num canal por produto, moderação de conversas fora do tema e onboarding de novos membros.

A especificação completa está em [`PLANO.md`](PLANO.md). As regras de trabalho no repositório estão em [`CLAUDE.md`](CLAUDE.md).

## Requisitos

- [Bun](https://bun.com) 1.4.5 ou superior.

## Comandos

```bash
bun install          # instalar dependências
bun run start        # arrancar o bot
bun run dev          # desenvolvimento, com recarga automática
bun run test         # testes
bun run typecheck    # verificação de tipos
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
