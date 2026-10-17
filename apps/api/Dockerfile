# Cloud Run 用（API と Web を1つのサーバーで配る）。リポジトリ直下をビルドコンテキストにする:
#   docker build -f apps/api/Dockerfile -t trends-api .
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@trends/api... --filter=@trends/web...
RUN pnpm deploy --filter=@trends/api --prod --legacy /out && cp -r apps/web/dist /out/web

FROM node:22-slim
ENV NODE_ENV=production
# ビルドした Web（API が同じサーバーで配る）
ENV WEB_DIST=/app/web
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 8080
ENV PORT=8080
# 起動前に drizzle/ のマイグレーションを当てる
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/main.js"]
