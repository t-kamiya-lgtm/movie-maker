#!/usr/bin/env bash
# VM 上のアプリを最新版に更新する:  sudo bash /opt/movie-maker/deploy/update.sh
set -euo pipefail

APP_DIR="/opt/movie-maker"
APP_USER="moviemaker"
BRANCH="${BRANCH:-$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)}"

if [ "$(id -u)" -ne 0 ]; then
  echo "sudo を付けて実行してください: sudo bash $APP_DIR/deploy/update.sh" >&2
  exit 1
fi

echo "==> 最新版を取得しています（$BRANCH）"
sudo -u "$APP_USER" -H git -C "$APP_DIR" pull --ff-only origin "$BRANCH"

echo "==> ビルドしています（数分かかります）"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund && npm run build"

echo "==> 再起動しています"
systemctl restart movie-maker
sleep 3
systemctl is-active --quiet movie-maker && echo "==> 更新が完了しました" || {
  echo "起動に失敗しました。ログ: sudo journalctl -u movie-maker -n 100" >&2
  exit 1
}
