# Optional Render deploy: Web Service with Docker + Playwright browser deps.
# Base image matches Playwright major used in apps/api (see package.json).
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8.15.6 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @repo/color-extractor build && pnpm --filter api build

ENV NODE_ENV=production
WORKDIR /app/apps/api

EXPOSE 3001
CMD ["node", "dist/index.js"]
