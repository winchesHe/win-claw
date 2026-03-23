# === 构建阶段 ===
# 安装所有依赖并构建全部子包产物
FROM node:22-slim AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile
RUN pnpm run build

# === 运行阶段 ===
# 仅复制构建产物和运行时必要文件，减小镜像体积
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/*/dist/ ./packages/
COPY --from=builder /app/packages/*/package.json ./packages/
COPY --from=builder /app/node_modules/ ./node_modules/
COPY config.yaml ./
# 入口点由具体部署场景决定（gateway / web-ui）
# CMD ["node", "packages/gateway/dist/index.js"]
