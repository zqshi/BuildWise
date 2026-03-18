# ---- Base ----
FROM node:22-alpine AS base
WORKDIR /app

# ---- Frontend build ----
FROM base AS frontend-build
COPY v2/package.json v2/package-lock.json ./v2/
RUN cd v2 && npm ci --ignore-scripts
COPY v2/src ./v2/src
COPY v2/index.html ./v2/index.html
COPY v2/tsconfig.json ./v2/
COPY v2/vite.config.ts ./v2/
COPY v2/model.json ./v2/
COPY v2/public ./v2/public
RUN cd v2 && npm run build

# ---- Backend build ----
FROM base AS backend-build
COPY v2/backend/package.json v2/backend/package-lock.json ./v2/backend/
RUN cd v2/backend && npm ci --ignore-scripts
COPY v2/backend/src ./v2/backend/src
COPY v2/backend/tsconfig.json ./v2/backend/
RUN cd v2/backend && npm run build

# ---- Production ----
FROM node:22-alpine AS production
WORKDIR /app

RUN addgroup -S buildwise && adduser -S buildwise -G buildwise

COPY v2/backend/package.json v2/backend/package-lock.json ./v2/backend/
RUN cd v2/backend && npm ci --omit=dev --ignore-scripts

COPY --from=backend-build /app/v2/backend/dist ./v2/backend/dist
COPY --from=frontend-build /app/v2/dist ./v2/dist
COPY v2/model.json ./v2/model.json

RUN mkdir -p /app/data && chown -R buildwise:buildwise /app

USER buildwise

ENV NODE_ENV=production
ENV PORT=5055
ENV HOST=0.0.0.0
ENV STORAGE_BACKEND=sqlite
ENV WORKSPACE_DB_FILE=/app/data/workspace.db
ENV WORKSPACE_DATA_FILE=/app/data/data.runtime.json
ENV MODEL_FILE=/app/v2/model.json

EXPOSE 5055

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5055/health || exit 1

CMD ["node", "v2/backend/dist/index.js"]
