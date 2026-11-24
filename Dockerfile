# Imagem de produção do creative-bot (publicada em ghcr.io por .github/workflows/publish.yml).
FROM oven/bun:1.4.4-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.4-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/app/data/bot.sqlite \
    CONFIG_PATH=/app/config/config.json
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/data /app/config && chown -R bun:bun /app/data
USER bun
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["bun", "run", "start"]
