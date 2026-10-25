#!/bin/sh
# pnpm verify が通った版を覚える。.githooks/pre-push が、dev・main への push のときに確かめる。
# 版はファイルの中身（tree）で覚えるので、通したあとにコミットしても、中身が同じならそのまま push できる
set -e
stamps="$(git rev-parse --git-common-dir)/verified"
mkdir -p "$stamps"
tmp=$(mktemp)
cp "$(git rev-parse --git-path index)" "$tmp"
# 今のファイル（新しいファイルも含む）と、変更済みの追跡中ファイルだけの 2 通りを覚える
GIT_INDEX_FILE=$tmp git add -A >/dev/null 2>&1 && touch "$stamps/$(GIT_INDEX_FILE=$tmp git write-tree)"
cp "$(git rev-parse --git-path index)" "$tmp"
GIT_INDEX_FILE=$tmp git add -u >/dev/null 2>&1 && touch "$stamps/$(GIT_INDEX_FILE=$tmp git write-tree)"
rm -f "$tmp"
echo "pnpm verify が通った版を覚えました（dev・main に push できます）"
