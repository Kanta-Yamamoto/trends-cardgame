#!/bin/sh
# Xcode Cloud が取ってきたリポジトリで、画面を組み立てて iOS プロジェクトに入れる（docs/ios-release.md）
set -e

brew install node@22
export PATH="$(brew --prefix node@22)/bin:$PATH"
corepack enable

cd "$CI_PRIMARY_REPOSITORY_PATH"
pnpm install --frozen-lockfile
pnpm turbo run build --filter='./packages/*'
pnpm --filter @trends/web cap:sync
