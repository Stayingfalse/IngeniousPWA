FROM node:22-alpine AS base
RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm

# Build shared
FROM base AS shared-build
WORKDIR /app/shared
COPY shared/package.json ./
RUN pnpm install
COPY shared/ ./
RUN pnpm build

# Build client
FROM base AS client-build
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY client/package.json ./client/
COPY shared/ ./shared/
COPY --from=shared-build /app/shared/dist ./shared/dist
RUN pnpm install --filter @ingenious/client
WORKDIR /app/client
COPY client/ ./
RUN pnpm build

# Build server
FROM base AS server-build
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY server/package.json ./server/
COPY shared/package.json ./shared/
COPY --from=shared-build /app/shared/dist ./shared/dist
RUN pnpm install --filter @ingenious/server
WORKDIR /app/server
COPY server/ ./
RUN pnpm build
# Install production-only deps while python3/make/g++ are available from base
WORKDIR /app
RUN CI=true pnpm install --filter @ingenious/server --prod

# Runtime
FROM node:22-alpine AS runtime
WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY server/package.json ./server/
COPY shared/package.json ./shared/

COPY --from=shared-build /app/shared/dist ./shared/dist
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=client-build /app/client/dist ./client/dist
COPY --from=server-build /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=3000
ENV CLIENT_DIST=/app/client/dist
ENV DB_PATH=/app/data/ingenious.db

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
