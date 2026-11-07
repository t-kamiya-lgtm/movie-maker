#!/usr/bin/env bash
# Movie Maker を Google Cloud の VM（Debian 12）にセットアップする。
#
# 使い方（VM の SSH 画面で）:
#   curl -fsSL https://raw.githubusercontent.com/t-kamiya-lgtm/movie-maker/claude/trusting-brown-wnh4h3/deploy/setup-vm.sh -o setup-vm.sh
#   sudo bash setup-vm.sh
#
# やること:
#   - Node.js 22 / ffmpeg / git / Caddy（HTTPS 対応の Web サーバー）を入れる
#   - アプリを /opt/movie-maker に置いてビルドし、常時起動（自動再起動）にする
#   - https://<IPアドレス>.sslip.io で公開し、ID とパスワードでログインが必要にする
# 何度実行しても大丈夫です（既存の .env やデータは消しません）。
set -euo pipefail

REPO="${REPO:-https://github.com/t-kamiya-lgtm/movie-maker.git}"
BRANCH="${BRANCH:-claude/trusting-brown-wnh4h3}"
APP_DIR="/opt/movie-maker"
APP_USER="moviemaker"
DATA_DIR="/var/lib/movie-maker"
LOGIN_USER="${LOGIN_USER:-movie}"

say() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "sudo を付けて実行してください: sudo bash setup-vm.sh" >&2
  exit 1
fi

# ---------- メモリ不足対策（ビルド用のスワップ 2GB） ----------
if ! swapon --show | grep -q /swapfile; then
  say "スワップ領域を作成しています"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

# ---------- ソフトのインストール ----------
say "必要なソフトをインストールしています（数分かかります）"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git ffmpeg debian-keyring debian-archive-keyring apt-transport-https

if ! command -v node >/dev/null || ! node -v | grep -q '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

# ---------- アプリの配置 ----------
say "アプリをダウンロードしています"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --create-home --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$DATA_DIR/storage"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone -b "$BRANCH" "$REPO" "$APP_DIR"
else
  # 2回目以降: アプリ用ユーザーの所有なので、そのユーザーで git を実行する
  sudo -u "$APP_USER" -H git -C "$APP_DIR" fetch origin "$BRANCH"
  sudo -u "$APP_USER" -H git -C "$APP_DIR" checkout "$BRANCH"
  sudo -u "$APP_USER" -H git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
fi

# ---------- API キー（.env） ----------
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  say "API キーを入力してください（入力した文字は画面に表示されません）"
  read -rsp "  Google の API キー（GEMINI_API_KEY）: " GEMINI_KEY </dev/tty; echo
  read -rsp "  Fish Audio の API キー（後で入れる場合は空のまま Enter）: " FISH_KEY </dev/tty; echo
  read -rsp "  fal.ai の API キー（後で入れる場合は空のまま Enter）: " FAL </dev/tty; echo
  umask 077
  cat >"$ENV_FILE" <<EOF
GEMINI_API_KEY=${GEMINI_KEY}
FAL_KEY=${FAL}
FISH_AUDIO_API_KEY=${FISH_KEY}
FISH_AUDIO_MODEL=s1
STORAGE_DIR=${DATA_DIR}/storage
EOF
  umask 022
else
  echo "既存の .env をそのまま使います（変更は: sudo nano $ENV_FILE）"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR"
chmod 600 "$ENV_FILE"

# ---------- ビルド ----------
say "アプリをビルドしています（数分かかります）"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund && npm run build"

# ---------- 常時起動（systemd） ----------
cat >/etc/systemd/system/movie-maker.service <<EOF
[Unit]
Description=Movie Maker
After=network-online.target
Wants=network-online.target

[Service]
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
ExecStart=/usr/bin/node ${APP_DIR}/node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable movie-maker >/dev/null
systemctl restart movie-maker

# ---------- HTTPS + ログイン（Caddy） ----------
EXTERNAL_IP="$(curl -fs -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip || true)"
if [ -z "${DOMAIN:-}" ]; then
  if [ -z "$EXTERNAL_IP" ]; then
    echo "外部 IP アドレスが取得できませんでした。VM に外部 IP を付けてから再実行してください。" >&2
    exit 1
  fi
  DOMAIN="${EXTERNAL_IP//./-}.sslip.io"
fi

CADDYFILE=/etc/caddy/Caddyfile
if [ ! -f /etc/caddy/.movie-maker-configured ] || [ "${RESET_PASSWORD:-}" = "1" ] || ! grep -q "^${DOMAIN} " "$CADDYFILE"; then
  say "ログイン用のパスワードを決めてください（ID は ${LOGIN_USER}）"
  while true; do
    read -rsp "  パスワード（8文字以上）: " PW1 </dev/tty; echo
    read -rsp "  もう一度: " PW2 </dev/tty; echo
    if [ "$PW1" != "$PW2" ]; then echo "  一致しません。もう一度入力してください。"; continue; fi
    if [ "${#PW1}" -lt 8 ]; then echo "  8文字以上にしてください。"; continue; fi
    break
  done
  HASH="$(caddy hash-password --plaintext "$PW1")"
  cat >"$CADDYFILE" <<EOF
${DOMAIN} {
	encode gzip
	basic_auth {
		${LOGIN_USER} ${HASH}
	}
	reverse_proxy 127.0.0.1:3000
}
EOF
  touch /etc/caddy/.movie-maker-configured
fi
systemctl enable caddy >/dev/null
systemctl restart caddy

say "完了しました"
cat <<EOF

  スマホ・パソコンのブラウザで次のアドレスを開いてください:

      https://${DOMAIN}

  ログイン ID: ${LOGIN_USER}
  パスワード : さきほど決めたもの

  ※ 初回は HTTPS 証明書の準備に 1 分ほどかかることがあります。
  ※ アプリの更新:      sudo bash ${APP_DIR}/deploy/update.sh
  ※ API キーの変更:    sudo nano ${ENV_FILE}  →  sudo systemctl restart movie-maker
  ※ パスワードの変更:  sudo RESET_PASSWORD=1 bash ${APP_DIR}/deploy/setup-vm.sh
  ※ 動作ログの確認:    sudo journalctl -u movie-maker -n 100

EOF
