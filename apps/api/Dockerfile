# Cloud Run 用。リポジトリ直下をビルドコンテキストにする:
#   docker build -f apps/api/Dockerfile -t trends-api .
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@trends/api...
RUN pnpm deploy --filter=@trends/api --prod --legacy /out

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 8080
ENV PORT=8080
# 起動前に drizzle/ のマイグレーションを当てる
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/main.js"]
