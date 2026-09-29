# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN npm run build -w @qrgenerator/contracts \
  && npm run build -w @qrgenerator/api

FROM node:24-alpine AS production-dependencies
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --omit=dev \
  --workspace @qrgenerator/api \
  --workspace @qrgenerator/contracts \
  --include-workspace-root=false \
  && npm cache clean --force \
  && mkdir -p apps/api/node_modules packages/contracts/node_modules

FROM node:24-alpine AS runtime
WORKDIR /workspace

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=8080

COPY --from=production-dependencies /workspace/node_modules ./node_modules
COPY --from=production-dependencies /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=production-dependencies /workspace/packages/contracts/node_modules ./packages/contracts/node_modules
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY --from=build /workspace/apps/api/dist apps/api/dist
COPY --from=build /workspace/apps/api/drizzle apps/api/drizzle
COPY --from=build /workspace/packages/contracts/dist packages/contracts/dist

USER node
EXPOSE 8080

CMD ["node", "apps/api/dist/server.js"]
