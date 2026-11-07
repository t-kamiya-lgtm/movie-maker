#!/usr/bin/env bash
# VM 上のアプリを最新版に更新する:  sudo bash /opt/movie-maker/deploy/update.sh
#
# 動いているアプリとは別の場所（/opt/movie-maker.staging）でダウンロード・ビルドし、
# 最後に入れ替えて再起動する。そのため、更新中もアプリは使える（止まるのは最後の数秒だけ）。
# ビルドに失敗した場合は入れ替えないので、今のアプリはそのまま動き続ける。
# 1つ前のバージョンは /opt/movie-maker.prev に残す（元に戻す: sudo bash update.sh --rollback）。
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/movie-maker}"
STAGE_DIR="${STAGE_DIR:-$APP_DIR.staging}"
PREV_DIR="${PREV_DIR:-$APP_DIR.prev}"
APP_USER="${APP_USER:-moviemaker}"

if [ "$(id -u)" -ne 0 ]; then
  echo "sudo を付けて実行してください: sudo bash $APP_DIR/deploy/update.sh" >&2
  exit 1
fi

as_app() { sudo -u "$APP_USER" -H "$@"; }

swap_and_restart() {
  # $1: 新しく使うフォルダ  $2: 今のフォルダの退避先
  echo "==> 入れ替えて再起動しています（数秒）"
  systemctl stop movie-maker
  rm -rf "$2"
  mv "$APP_DIR" "$2"
  mv "$1" "$APP_DIR"
  systemctl start movie-maker
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    systemctl is-active --quiet movie-maker && return 0
  done
  return 1
}

if [ "${1:-}" = "--rollback" ]; then
  [ -d "$PREV_DIR" ] || { echo "元に戻せるバージョンがありません" >&2; exit 1; }
  swap_and_restart "$PREV_DIR" "$STAGE_DIR" && echo "==> 1つ前のバージョンに戻しました" && exit 0
  echo "起動に失敗しました。ログ: sudo journalctl -u movie-maker -n 100" >&2
  exit 1
fi

# アプリ用ユーザーで git を実行する（root で実行すると "dubious ownership" で止まるため）
BRANCH="${BRANCH:-$(as_app git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)}"

echo "==> 作業用のコピーを作っています"
rm -rf "$STAGE_DIR"
cp -a "$APP_DIR" "$STAGE_DIR" # .env・node_modules も含めてコピー（データは /var/lib にあるので対象外）

echo "==> 最新版を取得しています（$BRANCH）"
as_app git -C "$STAGE_DIR" fetch origin "$BRANCH"
as_app git -C "$STAGE_DIR" checkout -q "$BRANCH"
as_app git -C "$STAGE_DIR" merge --ff-only -q "origin/$BRANCH"

echo "==> ビルドしています（数分かかります。この間もアプリは使えます）"
if ! as_app bash -c "cd '$STAGE_DIR' && npm ci --no-audit --no-fund && npm run build"; then
  echo "ビルドに失敗しました。今のアプリはそのまま動いています。" >&2
  exit 1
fi

if swap_and_restart "$STAGE_DIR" "$PREV_DIR"; then
  echo "==> 更新が完了しました"
else
  echo "起動に失敗しました。元に戻すには: sudo bash $APP_DIR/deploy/update.sh --rollback" >&2
  echo "ログ: sudo journalctl -u movie-maker -n 100" >&2
  exit 1
fi
