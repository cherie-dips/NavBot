FROM node:20-slim

RUN npm install -g pnpm@8.15.6

WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy all packages and apps needed by the API
COPY packages/typescript-config ./packages/typescript-config
COPY packages/color-extractor ./packages/color-extractor
COPY packages/chat-widget ./packages/chat-widget
COPY apps/api ./apps/api

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the chat widget (so it can be served by the API)
RUN pnpm --filter chat-widget build || true

# Build the API
RUN pnpm --filter api build

# Create data directory for SQLite
RUN mkdir -p /data

WORKDIR /app/apps/api

EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/navbot.db

CMD ["node", "dist/index.js"]
