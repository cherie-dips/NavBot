FROM node:20-slim

RUN npm install -g pnpm@8.15.6

WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy packages needed by the server
COPY packages/typescript-config ./packages/typescript-config
COPY apps/server ./apps/server

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the server
RUN pnpm --filter server build

# Create data directory for SQLite
RUN mkdir -p /data

WORKDIR /app/apps/server

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/navbot.db

CMD ["node", "dist/index.js"]
