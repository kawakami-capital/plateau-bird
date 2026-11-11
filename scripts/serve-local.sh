#!/bin/sh
# リポジトリのルートを、このマシンだけに向けて HTTP で開きます。外部公開の待受は使いません。
set -e
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8771}"
echo "ローカル確認用: http://127.0.0.1:${PORT}/viewer/"
echo "制作支援プランの試作: http://127.0.0.1:${PORT}/support-plan/"
exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT"
