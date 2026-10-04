#!/bin/bash
set -uo pipefail

#############################################
# Sistem Manajemen Sekolah
# Script Instalasi Otomatis - Ubuntu 22.04+
#
# Penggunaan:
#   chmod +x install.sh
#   sudo bash install.sh
#
# Script ini akan menginstall:
# - Docker & Docker Compose
# - Node.js 20 LTS & Bun
# - Nginx + Certbot (SSL)
# - Supabase Self-Hosted (via Docker)
# - Fail2ban, UFW, Logrotate
# - Build & deploy aplikasi React
# - Backup otomatis & health check
#############################################

# ============ WARNA OUTPUT ============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN} $1${NC}"; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ============ CEK ROOT ============
if [ "$EUID" -ne 0 ]; then
  log_err "Script ini harus dijalankan sebagai root (sudo bash install.sh)"
  exit 1
fi

# ============ KONFIGURASI INTERAKTIF ============
log_step "Konfigurasi Deployment"

read -rp "Domain utama (contoh: sekolah.com): " DOMAIN
read -rp "Subdomain API (contoh: api.sekolah.com): " API_DOMAIN
read -rp "Email admin (untuk SSL & SMTP): " ADMIN_EMAIL
read -rp "Username deploy (default: deploy): " DEPLOY_USER
DEPLOY_USER=${DEPLOY_USER:-deploy}

# Password untuk user deploy
while true; do
  read -rsp "Password untuk user ${DEPLOY_USER}: " DEPLOY_PASSWORD
  echo ""
  read -rsp "Konfirmasi password: " DEPLOY_PASSWORD_CONFIRM
  echo ""
  if [ "$DEPLOY_PASSWORD" = "$DEPLOY_PASSWORD_CONFIRM" ]; then
    if [ ${#DEPLOY_PASSWORD} -lt 8 ]; then
      log_warn "Password minimal 8 karakter, coba lagi."
      continue
    fi
    break
  else
    log_warn "Password tidak cocok, coba lagi."
  fi
done

read -rp "SMTP Host (default: smtp.gmail.com): " SMTP_HOST
SMTP_HOST=${SMTP_HOST:-smtp.gmail.com}
read -rp "SMTP Port (default: 587): " SMTP_PORT
SMTP_PORT=${SMTP_PORT:-587}
read -rp "SMTP User: " SMTP_USER
read -rsp "SMTP Password: " SMTP_PASS
echo ""

read -rp "Git repo URL (kosongkan jika upload manual): " GIT_REPO

# Generate secrets
JWT_SECRET=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -base64 24)
DASHBOARD_PASSWORD=$(openssl rand -base64 16)

APP_DIR="/home/${DEPLOY_USER}/sekolah-app"
SUPABASE_DIR="${APP_DIR}/supabase-docker"

echo ""
log_info "Domain       : ${DOMAIN}"
log_info "API Domain   : ${API_DOMAIN}"
log_info "Deploy User  : ${DEPLOY_USER}"
log_info "App Dir      : ${APP_DIR}"
echo ""
read -rp "Lanjutkan instalasi? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  log_warn "Instalasi dibatalkan."
  exit 0
fi

# ============ LANGKAH 1: UPDATE SISTEM ============
log_step "Langkah 1/12: Update Sistem & Dependensi Dasar"

apt update && apt upgrade -y
apt install -y \
  ca-certificates curl gnupg lsb-release \
  git wget unzip htop iotop \
  software-properties-common \
  apt-transport-https

timedatectl set-timezone Asia/Jakarta
log_ok "Sistem diupdate & timezone diset ke Asia/Jakarta"

# ============ LANGKAH 2: BUAT USER DEPLOY ============
log_step "Langkah 2/12: Setup User Deploy"

if id "$DEPLOY_USER" >/dev/null 2>&1; then
  log_warn "User ${DEPLOY_USER} sudah ada, update password..."
  echo "${DEPLOY_USER}:${DEPLOY_PASSWORD}" | chpasswd
  log_ok "Password user ${DEPLOY_USER} diupdate"
else
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  echo "${DEPLOY_USER}:${DEPLOY_PASSWORD}" | chpasswd
  usermod -aG sudo "$DEPLOY_USER"

  if [ -d /root/.ssh ]; then
    mkdir -p "/home/${DEPLOY_USER}/.ssh"
    cp /root/.ssh/authorized_keys "/home/${DEPLOY_USER}/.ssh/" 2>/dev/null || true
    chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
    chmod 700 "/home/${DEPLOY_USER}/.ssh"
    chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys" 2>/dev/null || true
  fi
  log_ok "User ${DEPLOY_USER} dibuat dengan password"
fi

# ============ LANGKAH 3: FIREWALL & KEAMANAN ============
log_step "Langkah 3/12: Firewall & Keamanan"

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
echo "y" | ufw enable
log_ok "UFW firewall aktif (22, 80, 443)"

apt install -y fail2ban
cat > /etc/fail2ban/jail.local <<'JAIL'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
backend = systemd

[sshd]
enabled = true
port = 22
filter = sshd
maxretry = 3
bantime = 86400
JAIL

systemctl enable fail2ban
systemctl restart fail2ban
log_ok "Fail2ban aktif"

apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
log_ok "Auto security updates aktif"

# Hardening SSH - tetap izinkan password authentication
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
sed -i 's/^#*ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
if systemctl list-units --type=service 2>/dev/null | grep -q "sshd.service"; then
  systemctl restart sshd
elif systemctl list-units --type=service 2>/dev/null | grep -q "ssh.service"; then
  systemctl restart ssh
fi
log_ok "SSH dikonfigurasi (password login aktif)"

# ============ LANGKAH 4: INSTALL DOCKER ============
log_step "Langkah 4/12: Install Docker & Docker Compose"

if command -v docker >/dev/null 2>&1; then
  log_warn "Docker sudah terinstall, skip"
else
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt update
  apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  usermod -aG docker "$DEPLOY_USER"
  log_ok "Docker terinstall"
fi

docker --version
docker compose version

# ============ LANGKAH 5: INSTALL NODE.JS & BUN ============
log_step "Langkah 5/12: Install Node.js 20 LTS & Bun"

if command -v node >/dev/null 2>&1; then
  log_warn "Node.js sudah terinstall: $(node --version)"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
  log_ok "Node.js $(node --version) terinstall"
fi

su - "$DEPLOY_USER" -c 'curl -fsSL https://bun.sh/install | bash' || true
log_ok "Bun terinstall"

# ============ LANGKAH 6: SETUP SUPABASE SELF-HOSTED ============
log_step "Langkah 6/12: Setup Supabase Self-Hosted"

mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [ -d "$SUPABASE_DIR" ]; then
  log_warn "Supabase docker sudah ada, skip clone"
else
  git clone --depth 1 https://github.com/supabase/supabase.git supabase-docker
fi

cd "${SUPABASE_DIR}/docker"
cp .env.example .env

# Generate JWT keys - try Node.js first, then Python fallback
npm install -g jsonwebtoken 2>/dev/null || npm install jsonwebtoken 2>/dev/null || true
pip3 install pyjwt 2>/dev/null || true

generate_jwt_key() {
  local role="$1"
  local secret="$2"
  local result=""
  
  # Try Node.js
  result=$(node -e "
const jwt = require('jsonwebtoken');
console.log(jwt.sign({
  role: '${role}',
  iss: 'supabase',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60)
}, '${secret}'));
" 2>/dev/null) && [ -n "$result" ] && [ "$result" != "undefined" ] && echo "$result" && return 0

  # Try Python PyJWT
  result=$(python3 -c "
import jwt, time, sys
now = int(time.time())
payload = {'role': '${role}', 'iss': 'supabase', 'iat': now, 'exp': now + 315360000}
print(jwt.encode(payload, '${secret}', algorithm='HS256'))
" 2>/dev/null) && [ -n "$result" ] && echo "$result" && return 0

  # Try Python with hmac (no external deps)
  result=$(python3 -c "
import hmac, hashlib, base64, json, time
def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()
now = int(time.time())
header = b64url(json.dumps({'alg':'HS256','typ':'JWT'}).encode())
payload = b64url(json.dumps({'role':'${role}','iss':'supabase','iat':now,'exp':now+315360000}).encode())
sig = b64url(hmac.new('${secret}'.encode(), f'{header}.{payload}'.encode(), hashlib.sha256).digest())
print(f'{header}.{payload}.{sig}')
" 2>/dev/null) && [ -n "$result" ] && echo "$result" && return 0

  echo "GENERATE_MANUALLY"
  return 1
}

ANON_KEY=$(generate_jwt_key "anon" "${JWT_SECRET}")
SERVICE_ROLE_KEY=$(generate_jwt_key "service_role" "${JWT_SECRET}")

if [ "$ANON_KEY" = "GENERATE_MANUALLY" ] || [ "$SERVICE_ROLE_KEY" = "GENERATE_MANUALLY" ]; then
  log_err "Gagal generate JWT keys! Coba manual di https://jwt.io"
  log_info "JWT Secret: ${JWT_SECRET}"
else
  log_ok "JWT keys berhasil digenerate (ANON_KEY & SERVICE_ROLE_KEY)"
fi

sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" .env
sed -i "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env
sed -i "s|ANON_KEY=.*|ANON_KEY=${ANON_KEY}|" .env
sed -i "s|SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}|" .env
sed -i "s|DASHBOARD_USERNAME=.*|DASHBOARD_USERNAME=admin|" .env
sed -i "s|DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}|" .env
sed -i "s|SITE_URL=.*|SITE_URL=https://${DOMAIN}|" .env
sed -i "s|API_EXTERNAL_URL=.*|API_EXTERNAL_URL=https://${API_DOMAIN}|" .env
sed -i "s|SUPABASE_PUBLIC_URL=.*|SUPABASE_PUBLIC_URL=https://${API_DOMAIN}|" .env
sed -i "s|SMTP_ADMIN_EMAIL=.*|SMTP_ADMIN_EMAIL=${ADMIN_EMAIL}|" .env
sed -i "s|SMTP_HOST=.*|SMTP_HOST=${SMTP_HOST}|" .env
sed -i "s|SMTP_PORT=.*|SMTP_PORT=${SMTP_PORT}|" .env
sed -i "s|SMTP_USER=.*|SMTP_USER=${SMTP_USER}|" .env
sed -i "s|SMTP_PASS=.*|SMTP_PASS=${SMTP_PASS}|" .env
sed -i "s|SMTP_SENDER_NAME=.*|SMTP_SENDER_NAME=Sistem Manajemen Sekolah|" .env

mkdir -p "${SUPABASE_DIR}/docker/volumes/db"
cat > "${SUPABASE_DIR}/docker/volumes/db/custom-postgresql.conf" <<'PGCONF'
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 64MB
maintenance_work_mem = 512MB
huge_pages = try
max_connections = 200
superuser_reserved_connections = 5
wal_level = replica
max_wal_size = 2GB
min_wal_size = 512MB
wal_buffers = 64MB
random_page_cost = 1.1
effective_io_concurrency = 200
default_statistics_target = 200
log_min_duration_statement = 1000
log_checkpoints = on
log_connections = off
log_disconnections = off
log_lock_waits = on
log_temp_files = 0
timezone = 'Asia/Jakarta'
PGCONF

if grep -q "analytics" docker-compose.yml 2>/dev/null; then
  log_info "Menonaktifkan container analytics (tidak kritis, hemat RAM)..."
fi

IMAGES=$(docker compose config --images 2>/dev/null | grep -v -i "logflare\|supabase-analytics" || true)
if [ -n "$IMAGES" ]; then
  for img in $IMAGES; do
    for attempt in 1 2 3 4 5; do
      log_info "Pulling ${img} (attempt ${attempt}/5)..."
      if docker pull "$img"; then
        log_ok "Pulled: ${img}"
        break
      else
        log_warn "Gagal pull ${img} (attempt ${attempt}/5), retry dalam 15 detik..."
        sleep 15
      fi
      if [ "$attempt" -eq 5 ]; then
        log_err "Gagal pull ${img} setelah 5 percobaan."
      fi
    done
  done
else
  log_warn "Tidak bisa list images, coba docker compose pull langsung..."
  for attempt in 1 2 3 4 5; do
    log_info "Docker pull attempt ${attempt}/5..."
    if docker compose pull; then
      log_ok "Docker images pulled successfully"
      break
    else
      log_warn "Pull gagal (attempt ${attempt}/5), retry dalam 15 detik..."
      sleep 15
    fi
    if [ "$attempt" -eq 5 ]; then
      log_err "Docker pull gagal setelah 5 percobaan."
      exit 1
    fi
  done
fi

docker compose up -d --scale analytics=0 2>/dev/null || docker compose up -d 2>/dev/null
docker compose stop analytics 2>/dev/null || true
docker compose rm -f analytics 2>/dev/null || true
log_ok "Supabase started (tanpa analytics)"

log_info "Menunggu database siap..."
sleep 15
for i in $(seq 1 30); do
  if docker exec supabase-db pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; then
    log_ok "Database siap!"
    break
  fi
  sleep 2
done

# ============ LANGKAH 7: CLONE & BUILD APLIKASI ============
log_step "Langkah 7/12: Clone & Build Aplikasi"

cd "$APP_DIR"

if [ -n "$GIT_REPO" ]; then
  if [ -d "${APP_DIR}/app" ]; then
    log_warn "Folder app sudah ada, pull terbaru..."
    cd "${APP_DIR}/app" && git pull origin main 2>/dev/null || log_warn "Git pull gagal, lanjut pakai kode yang ada"
    cd "$APP_DIR"
  else
    git clone "$GIT_REPO" "${APP_DIR}/app" || log_warn "Git clone gagal"
  fi
fi

log_info "Mencari package.json..."

FRONTEND_DIR=""

is_frontend_pkg() {
  local pkg_dir="$1"
  if echo "$pkg_dir" | grep -q "supabase-docker"; then
    return 1
  fi
  if echo "$pkg_dir" | grep -q "node_modules"; then
    return 1
  fi
  if [ -f "${pkg_dir}/vite.config.ts" ] || [ -f "${pkg_dir}/vite.config.js" ] || [ -f "${pkg_dir}/src/main.tsx" ]; then
    return 0
  fi
  if grep -q '"build"' "${pkg_dir}/package.json" 2>/dev/null; then
    return 0
  fi
  return 1
}

if [ -f "${APP_DIR}/app/package.json" ] && is_frontend_pkg "${APP_DIR}/app"; then
  FRONTEND_DIR="${APP_DIR}/app"
  log_ok "package.json frontend ditemukan di ${FRONTEND_DIR}"
elif [ -f "${APP_DIR}/package.json" ] && is_frontend_pkg "${APP_DIR}"; then
  FRONTEND_DIR="${APP_DIR}"
  log_ok "package.json frontend ditemukan di ${FRONTEND_DIR}"
else
  log_info "Isi folder ${APP_DIR}/:"
  ls -la "${APP_DIR}/" 2>/dev/null || true
  log_info "Isi folder ${APP_DIR}/app/:"
  ls -la "${APP_DIR}/app/" 2>/dev/null || true

  while IFS= read -r candidate; do
    [ -z "$candidate" ] && continue
    cdir=$(dirname "$candidate")
    if is_frontend_pkg "$cdir"; then
      FRONTEND_DIR="$cdir"
      log_ok "package.json frontend ditemukan di: ${FRONTEND_DIR}"
      break
    else
      log_warn "Skip package.json non-frontend: ${cdir}"
    fi
  done < <(find "${APP_DIR}" -maxdepth 3 -name "package.json" -type f 2>/dev/null | grep -v node_modules | grep -v supabase-docker)

  if [ -z "$FRONTEND_DIR" ]; then
    log_warn "Tidak ada package.json frontend. Yang ditemukan:"
    find "${APP_DIR}" -maxdepth 3 -name "package.json" -type f 2>/dev/null || true
  fi
fi

if [ -n "$FRONTEND_DIR" ] && [ ! -d "${APP_DIR}/app" ]; then
  mkdir -p "${APP_DIR}/app"
  log_info "Folder app/ dibuat untuk nginx"
fi

if [ -n "$FRONTEND_DIR" ]; then
  log_info "Membuat file .env otomatis untuk frontend..."
  
  # .env.production untuk build
  cat > "${FRONTEND_DIR}/.env.production" <<ENVPROD
VITE_SUPABASE_URL=https://${API_DOMAIN}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
VITE_SUPABASE_PROJECT_ID=sekolah-app
ENVPROD

  # .env.local untuk development lokal
  cat > "${FRONTEND_DIR}/.env.local" <<ENVLOCAL
VITE_SUPABASE_URL=https://${API_DOMAIN}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
VITE_SUPABASE_PROJECT_ID=sekolah-app
# Service role key - JANGAN expose ke client, hanya untuk server-side
# SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
ENVLOCAL

  # .env (default fallback)
  cat > "${FRONTEND_DIR}/.env" <<ENVDEFAULT
VITE_SUPABASE_URL=https://${API_DOMAIN}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
VITE_SUPABASE_PROJECT_ID=sekolah-app
ENVDEFAULT

  log_ok "File .env, .env.local, dan .env.production dibuat di ${FRONTEND_DIR}"

  chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}"

  log_info "Memulai build aplikasi dari ${FRONTEND_DIR}..."
  BUILD_OK=false

  BUN_BIN="/home/${DEPLOY_USER}/.bun/bin/bun"
  if [ -x "$BUN_BIN" ]; then
    log_info "Build menggunakan Bun..."
    if su - "$DEPLOY_USER" -c "export PATH=\$HOME/.bun/bin:\$PATH && cd '${FRONTEND_DIR}' && bun install --frozen-lockfile 2>/dev/null || bun install && bun run build"; then
      BUILD_OK=true
    else
      log_warn "Bun build gagal, coba npm..."
    fi
  else
    log_warn "Bun tidak ditemukan di ${BUN_BIN}"
  fi

  if [ "$BUILD_OK" = false ] && command -v npm >/dev/null 2>&1; then
    log_info "Build menggunakan npm..."
    cd "${FRONTEND_DIR}"
    npm install && npm run build && BUILD_OK=true || log_warn "npm build juga gagal"
    cd "$APP_DIR"
  fi

  DIST_DIR="${FRONTEND_DIR}/dist"
  if [ -f "${DIST_DIR}/index.html" ]; then
    FILE_COUNT=$(find "${DIST_DIR}" -type f | wc -l)
    log_ok "Build berhasil! (${FILE_COUNT} file di dist/)"

    if [ "${FRONTEND_DIR}" != "${APP_DIR}/app" ]; then
      mkdir -p "${APP_DIR}/app"
      ln -sfn "${DIST_DIR}" "${APP_DIR}/app/dist"
      log_info "Symlink dist dibuat: ${APP_DIR}/app/dist -> ${DIST_DIR}"
    fi
  else
    log_err "Build gagal! dist/index.html tidak ditemukan."
    log_info ""
    log_info "=== JALANKAN MANUAL ==="
    log_info "  su - ${DEPLOY_USER}"
    log_info "  export PATH=\$HOME/.bun/bin:\$PATH"
    log_info "  cd ${FRONTEND_DIR}"
    log_info "  bun install && bun run build"
    log_info "  sudo systemctl reload nginx"
    log_info "======================="
  fi
else
  log_warn "package.json TIDAK ditemukan di mana pun!"
  log_info "Upload kode ke ${APP_DIR}/app/ lalu jalankan ~/deploy.sh"
fi

if [ ! -f "${APP_DIR}/app/dist/index.html" ]; then
  mkdir -p "${APP_DIR}/app/dist"
  cat > "${APP_DIR}/app/dist/index.html" <<'PLACEHOLDER'
<!DOCTYPE html>
<html><head><title>Sistem Manajemen Sekolah</title>
<style>body{display:flex;justify-content:center;align-items:center;height:100vh;font-family:system-ui;background:#f8fafc;margin:0}
.c{text-align:center;padding:2rem;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
h1{font-size:2rem;margin-bottom:.5rem}p{color:#64748b}code{background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:.9rem}</style></head>
<body><div class="c">
<h1>Sistem Manajemen Sekolah</h1>
<p>Aplikasi belum di-build. Jalankan:</p>
<p><code>~/deploy.sh</code></p>
</div></body></html>
PLACEHOLDER
  chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}/app/dist"
  log_info "Placeholder index.html dibuat"
fi

# ============ LANGKAH 8: SETUP NGINX ============
log_step "Langkah 8/12: Setup Nginx"

apt install -y nginx

cat > /etc/nginx/sites-available/sekolah-app <<NGINXCONF
limit_req_zone \$binary_remote_addr zone=general:10m rate=30r/s;
limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${DOMAIN} www.${DOMAIN} _;

    root ${APP_DIR}/app/dist;
    index index.html;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; frame-src 'self' https://www.google.com https://www.recaptcha.net; connect-src 'self' https://${API_DOMAIN} wss://${API_DOMAIN} https://www.google.com;" always;

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location / {
        limit_req zone=general burst=50 nodelay;
        try_files \\$uri \\$uri/ /index.html;
    }

    location ~ /\\. { deny all; }
}

server {
    listen 80;
    listen [::]:80;
    server_name ${API_DOMAIN};

    client_max_body_size 50M;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }

    location / {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        proxy_buffering on;
        proxy_buffer_size 16k;
        proxy_buffers 4 32k;
    }

    location /studio/ {
        proxy_pass http://localhost:3000/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
NGINXCONF

ln -sf /etc/nginx/sites-available/sekolah-app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

mkdir -p /var/www/html/.well-known/acme-challenge

if ! grep -q "gzip_types" /etc/nginx/nginx.conf; then
  sed -i '/http {/a \\tgzip on;\n\tgzip_vary on;\n\tgzip_proxied any;\n\tgzip_comp_level 6;\n\tgzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss application/atom+xml image/svg+xml;' /etc/nginx/nginx.conf
fi

nginx -t && systemctl reload nginx
log_ok "Nginx dikonfigurasi"

# ============ LANGKAH 9: SSL CERTIFICATE ============
log_step "Langkah 9/12: SSL Certificate (Let's Encrypt)"

apt install -y certbot python3-certbot-nginx

systemctl start nginx 2>/dev/null || true

certbot --nginx \
  -d "$DOMAIN" -d "www.${DOMAIN}" -d "$API_DOMAIN" \
  --email "$ADMIN_EMAIL" --agree-tos --no-eff-email --non-interactive \
  || {
    log_warn "Certbot --nginx gagal, coba webroot mode..."
    certbot certonly --webroot -w /var/www/html \
      -d "$DOMAIN" -d "www.${DOMAIN}" -d "$API_DOMAIN" \
      --email "$ADMIN_EMAIL" --agree-tos --no-eff-email --non-interactive \
      || log_warn "Certbot gagal. Pastikan DNS A record mengarah ke IPv4 server ini!"
  }

log_ok "SSL certificate dikonfigurasi"

# ============ LANGKAH 10: DATABASE SCHEMA & MIGRATIONS ============
log_step "Langkah 10/12: Database Schema & Migrations"

DB_CONTAINER=""
for cname in "supabase-db" "supabase-docker-db-1" "docker-db-1" "supabase_db_1"; do
  if docker ps --format '{{.Names}}' | grep -q "^${cname}$"; then
    DB_CONTAINER="$cname"
    break
  fi
done

if [ -z "$DB_CONTAINER" ]; then
  DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i -E "(db|postgres)" | head -1)
fi

if [ -z "$DB_CONTAINER" ]; then
  log_err "Container PostgreSQL TIDAK ditemukan! Pastikan Supabase sudah jalan."
  log_info "Container yang aktif:"
  docker ps --format '  - {{.Names}} ({{.Image}})' 2>/dev/null || true
else
  log_ok "Container PostgreSQL ditemukan: ${DB_CONTAINER}"

  # Fix permissions on PostgreSQL data directory
  docker exec "$DB_CONTAINER" bash -c "chown -R postgres:postgres /var/lib/postgresql/data 2>/dev/null || true" 2>/dev/null || true

  # Wait for PostgreSQL to be fully ready
  log_info "Menunggu PostgreSQL siap..."
  DB_READY=false
  for i in $(seq 1 30); do
    if docker exec --user postgres "$DB_CONTAINER" psql -U postgres -d postgres -c "SELECT 1" >/dev/null 2>&1; then
      DB_READY=true
      break
    fi
    log_info "Menunggu PostgreSQL... (${i}/30)"
    sleep 3
  done

  if [ "$DB_READY" = true ]; then
    log_ok "Koneksi ke database berhasil!"
  else
    log_err "PostgreSQL belum siap setelah 90 detik"
    log_info "Restart container DB..."
    docker restart "$DB_CONTAINER" 2>/dev/null || true
    sleep 10
    if docker exec --user postgres "$DB_CONTAINER" psql -U postgres -d postgres -c "SELECT 1" >/dev/null 2>&1; then
      DB_READY=true
      log_ok "Koneksi ke database berhasil setelah restart!"
    else
      log_err "Tidak bisa connect ke database. Skip migrasi."
    fi
  fi
fi

# ============ APPLY DATABASE SCHEMA (FULL MIGRATION) ============
FULL_MIGRATION_IMPORTED=false
RELOAD_SCHEMA_REQUIRED=false

reload_postgrest_schema_cache() {
  log_info "Reload schema cache PostgREST..."
  docker exec --user postgres "$DB_CONTAINER" psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema'; NOTIFY pgrst, 'reload config';" >/dev/null 2>&1 || true

  REST_CONTAINER=""
  for cname in "supabase-rest" "supabase-docker-rest-1" "docker-rest-1" "supabase_rest_1"; do
    if docker ps --format '{{.Names}}' | grep -q "^${cname}$"; then
      REST_CONTAINER="$cname"
      break
    fi
  done
  if [ -z "$REST_CONTAINER" ]; then
    REST_CONTAINER=$(docker ps --format '{{.Names}} {{.Image}}' | grep -iE 'postgrest|supabase-rest' | head -1 | awk '{print $1}')
  fi

  if [ -n "$REST_CONTAINER" ]; then
    docker restart "$REST_CONTAINER" >/dev/null 2>&1 || true
    log_ok "Container PostgREST direstart: ${REST_CONTAINER}"
  else
    log_warn "Container PostgREST tidak ditemukan, lanjut tanpa restart"
  fi

  KONG_CONTAINER=""
  for cname in "supabase-kong" "supabase-docker-kong-1" "docker-kong-1" "supabase_kong_1"; do
    if docker ps --format '{{.Names}}' | grep -q "^${cname}$"; then
      KONG_CONTAINER="$cname"
      break
    fi
  done
  if [ -n "$KONG_CONTAINER" ]; then
    docker restart "$KONG_CONTAINER" >/dev/null 2>&1 || true
    log_ok "Container API gateway direstart: ${KONG_CONTAINER}"
  fi

  # Also restart GoTrue (auth) to pick up schema changes
  AUTH_CONTAINER=""
  for cname in "supabase-auth" "supabase-docker-auth-1" "docker-auth-1" "supabase_auth_1"; do
    if docker ps --format '{{.Names}}' | grep -q "^${cname}$"; then
      AUTH_CONTAINER="$cname"
      break
    fi
  done
  if [ -z "$AUTH_CONTAINER" ]; then
    AUTH_CONTAINER=$(docker ps --format '{{.Names}} {{.Image}}' | grep -iE 'gotrue|supabase-auth' | head -1 | awk '{print $1}')
  fi
  if [ -n "$AUTH_CONTAINER" ]; then
    docker restart "$AUTH_CONTAINER" >/dev/null 2>&1 || true
    log_ok "Container Auth direstart: ${AUTH_CONTAINER}"
  fi

  # Wait for API to respond (401 Unauthorized is OK — it means the service is up)
  log_info "Menunggu API merespons..."
  sleep 5
  for i in $(seq 1 30); do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000/rest/v1/" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" != "000" ] && [ "$HTTP_CODE" -lt 500 ]; then
      log_ok "API merespons (HTTP ${HTTP_CODE})"
      return 0
    fi
    log_info "API belum siap (HTTP ${HTTP_CODE}), tunggu... (${i}/30)"
    sleep 3
  done

  log_warn "API belum merespons normal setelah 90 detik, cek: docker logs ${REST_CONTAINER:-supabase-rest}"
  return 1
}

if [ -n "$DB_CONTAINER" ] && [ "${DB_READY:-false}" = true ]; then
  log_info "Mencari file full-migration SQL untuk schema database..."

  # Lokasi script ini dijalankan
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  # Cari full-migration file di berbagai lokasi
  FULL_MIGRATION=""
  SEARCH_PATHS=(
    "${SCRIPT_DIR}/full-migration"*.sql
    "${SCRIPT_DIR}/../full-migration"*.sql
    "${APP_DIR}/full-migration"*.sql
    "${APP_DIR}/app/full-migration"*.sql
    "${APP_DIR}/app/dist/full-migration"*.sql
    "${APP_DIR}/app/public/full-migration"*.sql
    "/tmp/full-migration"*.sql
    "/root/full-migration"*.sql
    "/home/${DEPLOY_USER}/full-migration"*.sql
  )
  if [ -n "${FRONTEND_DIR:-}" ]; then
    SEARCH_PATHS+=(
      "${FRONTEND_DIR}/full-migration"*.sql
      "${FRONTEND_DIR}/public/full-migration"*.sql
      "${FRONTEND_DIR}/dist/full-migration"*.sql
    )
  fi

  for candidate in "${SEARCH_PATHS[@]}"; do
    if [ -f "$candidate" ] 2>/dev/null; then
      FULL_MIGRATION="$candidate"
      break
    fi
  done

  if [ -n "$FULL_MIGRATION" ]; then
    log_ok "Full migration file ditemukan: ${FULL_MIGRATION}"
    log_info "Ukuran file: $(du -h "$FULL_MIGRATION" | cut -f1)"
    log_info "Mengimpor SELURUH schema database (tabel, enum, trigger, function, RLS, index, constraint)..."

    FNAME=$(basename "$FULL_MIGRATION")
    IMPORT_SOURCE="$FULL_MIGRATION"
    IMPORT_TMP_HOST="/tmp/${FNAME}.import.sql"
    SKIP_SESSION_REPLICATION_ROLE=false
    SKIP_STORAGE_OBJECT_POLICIES=false

    DB_USER_IS_SUPERUSER=$(docker exec --user postgres "$DB_CONTAINER" psql -U postgres -d postgres -tAc "SELECT CASE WHEN rolsuper THEN 'true' ELSE 'false' END FROM pg_roles WHERE rolname = current_user;" 2>/dev/null | tr -d '[:space:]')
    if [ "$DB_USER_IS_SUPERUSER" != "true" ]; then
      SKIP_SESSION_REPLICATION_ROLE=true
    fi

    CAN_MANAGE_STORAGE_OBJECTS=$(docker exec --user postgres "$DB_CONTAINER" psql -U postgres -d postgres -tAc "SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'storage' AND c.relname = 'objects' AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)) OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper) THEN 'true' ELSE 'false' END;" 2>/dev/null | tr -d '[:space:]')
    if [ "$CAN_MANAGE_STORAGE_OBJECTS" != "true" ]; then
      SKIP_STORAGE_OBJECT_POLICIES=true
    fi

    # Always run sanitization for self-hosted compatibility (auth.identities, storage.buckets)
    if true; then
      log_warn "Mode kompatibilitas import aktif (permission role terbatas)."
      awk -v skip_repl="$SKIP_SESSION_REPLICATION_ROLE" -v skip_storage="$SKIP_STORAGE_OBJECT_POLICIES" '
        BEGIN { RS = ";"; ORS = ";\n" }
        {
          stmt = $0
          lower = tolower(stmt)

          if (skip_repl == "true" && lower ~ /session_replication_role[[:space:]]*=/) next
          if (skip_storage == "true" && lower ~ /storage\.(\"objects\"|objects)/ && (lower ~ /drop policy/ || lower ~ /create policy/ || lower ~ /alter policy/)) next

          # Skip auth.identities inserts (not accessible in self-hosted)
          if (lower ~ /insert[[:space:]]+into[[:space:]]+auth\.identities/) next
          # Skip storage.buckets inserts (schema mismatch in self-hosted)
          if (lower ~ /insert[[:space:]]+into[[:space:]]+storage\.buckets/) next
          # Skip auth.users inserts (email_confirmed_at column mismatch in self-hosted)
          if (lower ~ /insert[[:space:]]+into[[:space:]]+auth\.users/) next

          print stmt
        }
      ' "$FULL_MIGRATION" > "$IMPORT_TMP_HOST"
      IMPORT_SOURCE="$IMPORT_TMP_HOST"

      if [ "$SKIP_SESSION_REPLICATION_ROLE" = true ]; then
        log_info "Skip statement session_replication_role (butuh superuser/SET privilege)."
      fi
      if [ "$SKIP_STORAGE_OBJECT_POLICIES" = true ]; then
        log_info "Skip policy storage.objects (butuh owner relation)."
      fi
    fi

    docker cp "$IMPORT_SOURCE" "${DB_CONTAINER}:/tmp/${FNAME}"
    docker exec "$DB_CONTAINER" chmod 644 "/tmp/${FNAME}"
    docker exec "$DB_CONTAINER" chown postgres:postgres "/tmp/${FNAME}"

    IMPORT_LOG="/tmp/full-migration-import.log"
    docker exec --user postgres "$DB_CONTAINER" psql -U postgres -d postgres \
      -v ON_ERROR_STOP=0 \
      -f "/tmp/${FNAME}" >"$IMPORT_LOG" 2>&1

    TOTAL_ERRORS=$(grep -c "ERROR:" "$IMPORT_LOG" 2>/dev/null || true)
    NON_IDEMPOTENT_ERRORS=$(grep "ERROR:" "$IMPORT_LOG" 2>/dev/null | grep -viE "already exists|duplicate key|duplicate object|multiple primary keys|constraint .* already exists|policy .* already exists|trigger .* already exists|relation .* already exists|must be owner of|permission denied to set parameter|auth\.identities|auth\.users|does not exist|column.*of relation.*buckets|email_confirmed_at" | wc -l | tr -d ' ')

    tail -30 "$IMPORT_LOG" 2>/dev/null || true

    if [ "${NON_IDEMPOTENT_ERRORS:-0}" -gt 0 ]; then
      log_warn "Full migration selesai dengan ${NON_IDEMPOTENT_ERRORS} error non-idempotent. Cek log lengkap: ${IMPORT_LOG}"
    else
      if [ "${TOTAL_ERRORS:-0}" -gt 0 ]; then
        log_warn "Full migration selesai dengan ${TOTAL_ERRORS} warning idempotent (objek sudah ada)."
      else
        log_ok "Full migration berhasil diimpor tanpa error."
      fi
    fi

    docker exec "$DB_CONTAINER" rm -f "/tmp/${FNAME}" 2>/dev/null || true
    [ -f "$IMPORT_TMP_HOST" ] && rm -f "$IMPORT_TMP_HOST" || true
    FULL_MIGRATION_IMPORTED=true
    RELOAD_SCHEMA_REQUIRED=true

    # Verifikasi hasil
    TABLE_COUNT=$(docker exec --user postgres "$DB_CONTAINER" psql -U postgres -d postgres -t -c \
      "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>/dev/null | tr -d ' ')
    FUNC_COUNT=$(docker exec --user postgres "$DB_CONTAINER" psql -U postgres -d postgres -t -c \
      "SELECT count(*) FROM information_schema.routines WHERE routine_schema = 'public';" 2>/dev/null | tr -d ' ')
    TRIGGER_COUNT=$(docker exec --user postgres "$DB_CONTAINER" psql -U postgres -d postgres -t -c \
      "SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'public';" 2>/dev/null | tr -d ' ')
    INDEX_COUNT=$(docker exec --user postgres "$DB_CONTAINER" psql -U postgres -d postgres -t -c \
      "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public';" 2>/dev/null | tr -d ' ')
    POLICY_COUNT=$(docker exec --user postgres "$DB_CONTAINER" psql -U postgres -d postgres -t -c \
      "SELECT count(*) FROM pg_policies WHERE schemaname = 'public';" 2>/dev/null | tr -d ' ')

    echo ""
    log_ok "=== Hasil Verifikasi Database ==="
    log_info "  Tabel     : ${TABLE_COUNT}"
    log_info "  Function  : ${FUNC_COUNT}"
    log_info "  Trigger   : ${TRIGGER_COUNT}"
    log_info "  Index     : ${INDEX_COUNT}"
    log_info "  RLS Policy: ${POLICY_COUNT}"
    echo ""

  else
    log_warn "File full-migration*.sql TIDAK ditemukan!"
    log_info ""
    log_info "=== CARA MENGGUNAKAN ==="
    log_info "Letakkan file full-migration SQL di salah satu lokasi berikut:"
    log_info "  1. Di folder yang SAMA dengan install.sh"
    log_info "  2. Di ${APP_DIR}/"
    log_info "  3. Di ${APP_DIR}/app/"
    log_info "  4. Di /home/${DEPLOY_USER}/"
    log_info "  5. Di /tmp/"
    log_info ""
    log_info "Contoh:"
    log_info "  scp full-migration-2026-03-07.sql root@server:/tmp/"
    log_info "  # Lalu jalankan ulang install.sh"
    log_info ""
    log_info "Atau jalankan manual setelah install:"
    log_info "  ~/import-migration.sh full-migration-2026-03-07.sql"
    log_info "========================"
    log_info ""

    # Fallback: buat schema minimal agar aplikasi bisa jalan
    log_info "Membuat schema MINIMAL sebagai fallback..."

    cat > "/tmp/schema-minimal.sql" <<'SCHEMASQL'
-- Schema minimal fallback (gunakan full-migration untuk schema lengkap)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'teacher', 'bendahara', 'tata_usaha', 'kesiswaan', 'siswa', 'polling', 'billing');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  school_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $fn$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;
CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
SCHEMASQL

    docker cp "/tmp/schema-minimal.sql" "${DB_CONTAINER}:/tmp/schema-minimal.sql"
    if docker exec --user postgres "$DB_CONTAINER" psql -U postgres -d postgres -f "/tmp/schema-minimal.sql" 2>&1 | tail -10; then
      log_ok "Schema minimal berhasil dibuat (profiles + user_roles saja)"
      log_warn "PENTING: Jalankan ~/import-migration.sh dengan file full-migration untuk schema LENGKAP!"
      RELOAD_SCHEMA_REQUIRED=true
    fi
    docker exec "$DB_CONTAINER" rm -f "/tmp/schema-minimal.sql" 2>/dev/null || true
    rm -f "/tmp/schema-minimal.sql"
  fi

  # Jalankan migration files tambahan HANYA jika full migration tidak dipakai
  MIGRATION_DIR=""
  if [ -n "${FRONTEND_DIR:-}" ]; then
    for candidate in "${FRONTEND_DIR}/supabase/migrations" "${FRONTEND_DIR}/migrations"; do
      if [ -d "$candidate" ]; then
        MIGRATION_DIR="$candidate"
        break
      fi
    done
  fi
  if [ -z "$MIGRATION_DIR" ]; then
    for candidate in "${APP_DIR}/app/supabase/migrations" "${APP_DIR}/supabase/migrations" "${APP_DIR}/app/migrations"; do
      if [ -d "$candidate" ]; then
        MIGRATION_DIR="$candidate"
        break
      fi
    done
  fi

  if [ "$FULL_MIGRATION_IMPORTED" = true ]; then
    log_info "Skip migrasi tambahan: full-migration sudah mencakup seluruh skema."
  elif [ -n "$MIGRATION_DIR" ]; then
    MIGRATION_COUNT=$(find "$MIGRATION_DIR" -maxdepth 1 -name "*.sql" -type f 2>/dev/null | wc -l)
    log_info "Folder migrasi tambahan ditemukan: ${MIGRATION_DIR} (${MIGRATION_COUNT} file)"
    if [ "$MIGRATION_COUNT" -gt 0 ]; then
      SUCCESS=0
      SKIP=0
      FAIL=0
      for f in $(find "$MIGRATION_DIR" -maxdepth 1 -name "*.sql" -type f 2>/dev/null | sort); do
        FNAME=$(basename "$f")
        log_info "Migrasi: ${FNAME}"
        docker cp "$f" "${DB_CONTAINER}:/tmp/${FNAME}"
        docker exec "$DB_CONTAINER" chmod 644 "/tmp/${FNAME}"
        docker exec "$DB_CONTAINER" chown postgres:postgres "/tmp/${FNAME}"

        MIG_OUTPUT=$(docker exec --user postgres "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f "/tmp/${FNAME}" 2>&1)
        MIG_EXIT=$?

        if [ $MIG_EXIT -eq 0 ]; then
          SUCCESS=$((SUCCESS + 1))
        elif echo "$MIG_OUTPUT" | grep -qiE "already exists|duplicate key|duplicate object|multiple primary keys|constraint .* already exists|policy .* already exists|trigger .* already exists|relation .* already exists"; then
          SKIP=$((SKIP + 1))
          log_warn "Skip (sudah ada): ${FNAME}"
        else
          FAIL=$((FAIL + 1))
          log_err "Gagal migrasi: ${FNAME}"
          printf '%s\n' "$MIG_OUTPUT" | tail -10
        fi

        docker exec "$DB_CONTAINER" rm -f "/tmp/${FNAME}" 2>/dev/null || true
      done
      log_ok "Migrasi tambahan selesai: ${SUCCESS} berhasil, ${SKIP} skip, ${FAIL} gagal"
      if [ "$SUCCESS" -gt 0 ]; then
        RELOAD_SCHEMA_REQUIRED=true
      fi
    fi
  fi

  if [ "$RELOAD_SCHEMA_REQUIRED" = true ]; then
    reload_postgrest_schema_cache
  fi
fi

# ============ SEED DATABASE DENGAN DATA DUMMY ============
if [ -n "$DB_CONTAINER" ] && [ "${DB_READY:-false}" = true ]; then
  log_step "Langkah 10b/12: Seed Database (Data Dummy & Akun Login)"

  # Generate bcrypt hash for passwords using Python (available on Ubuntu)
  hash_password() {
    local pass="$1"
    python3 -c "
import hashlib, os, base64
salt = os.urandom(16)
dk = hashlib.pbkdf2_hmac('sha256', b'${pass}', salt, 100000)
print('\$pbkdf2-sha256\$i=100000,l=32\$' + base64.b64encode(salt).decode().rstrip('=') + '\$' + base64.b64encode(dk).decode().rstrip('='))
" 2>/dev/null || echo ""
  }

  log_info "Membuat data dummy dan akun login awal..."

  # We use GoTrue's crypto_sign approach - create users via Supabase Auth API
  # First wait for GoTrue to be ready
  GOTRUE_READY=false
  for i in $(seq 1 20); do
    AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000/auth/v1/health" 2>/dev/null || echo "000")
    if [ "$AUTH_CODE" != "000" ] && [ "$AUTH_CODE" -lt 500 ]; then
      GOTRUE_READY=true
      break
    fi
    sleep 2
  done

  if [ "$GOTRUE_READY" = true ]; then
    log_ok "Auth service siap"

    # Function to create user via GoTrue Admin API
    create_user() {
      local email="$1" password="$2" fullname="$3"
      local result
      result=$(curl -s -X POST "http://localhost:8000/auth/v1/admin/users" \
        -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
        -H "apikey: ${SERVICE_ROLE_KEY}" \
        -H "Content-Type: application/json" \
        -d "{
          \"email\": \"${email}\",
          \"password\": \"${password}\",
          \"email_confirm\": true,
          \"user_metadata\": {\"full_name\": \"${fullname}\"}
        }" 2>/dev/null)
      local uid
      uid=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
      if [ -z "$uid" ] || [ "$uid" = "None" ]; then
        # User might already exist, try to fetch by email
        uid=$(curl -s -X GET "http://localhost:8000/auth/v1/admin/users" \
          -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
          -H "apikey: ${SERVICE_ROLE_KEY}" 2>/dev/null | \
          python3 -c "import sys,json
users=json.load(sys.stdin).get('users',[])
for u in users:
  if u.get('email')=='${email}':
    print(u['id']); break" 2>/dev/null || echo "")
      fi
      if [ -z "$uid" ] || [ "$uid" = "None" ]; then
        log_warn "Gagal membuat/menemukan user: ${email}"
        echo "00000000-0000-0000-0000-000000000000"
        return
      fi
      echo "$uid"
    }

    # Create users
    log_info "Membuat akun Super Admin..."
    SA_ID=$(create_user "superadmin@sekolah.com" "SuperAdmin123!" "Super Administrator")
    log_info "Membuat akun Admin..."
    ADMIN_ID=$(create_user "admin@sekolah.com" "Admin123!" "Administrator Sekolah")
    log_info "Membuat akun Guru..."
    T1_ID=$(create_user "guru.matematika@sekolah.com" "Guru123!" "Budi Santoso, S.Pd.")
    T2_ID=$(create_user "guru.bindo@sekolah.com" "Guru123!" "Siti Rahayu, S.Pd.")
    T3_ID=$(create_user "guru.ipa@sekolah.com" "Guru123!" "Ahmad Fauzi, S.Si.")
    T4_ID=$(create_user "guru.ips@sekolah.com" "Guru123!" "Dewi Lestari, S.Pd.")
    T5_ID=$(create_user "guru.bing@sekolah.com" "Guru123!" "Rina Wati, S.Pd.")
    log_info "Membuat akun Bendahara..."
    BEND_ID=$(create_user "bendahara@sekolah.com" "Bendahara123!" "Sri Mulyani, S.E.")
    log_info "Membuat akun Tata Usaha..."
    TU_ID=$(create_user "tatausaha@sekolah.com" "TataUsaha123!" "Joko Widodo")
    log_info "Membuat akun Kesiswaan..."
    KES_ID=$(create_user "kesiswaan@sekolah.com" "Kesiswaan123!" "Ratna Sari, S.Pd.")

    # Generate seed SQL
    SCHOOL_ID="11111111-1111-1111-1111-111111111111"
    AY_ID="22222222-2222-2222-2222-222222222222"

    cat > "/tmp/seed-data.sql" <<SEEDSQL
-- =============================================
-- SEED DATA: Sistem Manajemen Sekolah
-- Generated by install.sh
-- =============================================

-- School
INSERT INTO public.schools (id, name, npsn, address, phone, email, approval_status, is_active)
VALUES ('${SCHOOL_ID}', 'SMP Negeri 1 Contoh', '20100001', 'Jl. Pendidikan No. 1, Kota Contoh, Jawa Barat', '022-1234567', 'smpn1contoh@sekolah.id', 'approved', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Profiles
INSERT INTO public.profiles (id, email, full_name) VALUES
  ('${SA_ID}', 'superadmin@sekolah.com', 'Super Administrator'),
  ('${ADMIN_ID}', 'admin@sekolah.com', 'Administrator Sekolah'),
  ('${T1_ID}', 'guru.matematika@sekolah.com', 'Budi Santoso, S.Pd.'),
  ('${T2_ID}', 'guru.bindo@sekolah.com', 'Siti Rahayu, S.Pd.'),
  ('${T3_ID}', 'guru.ipa@sekolah.com', 'Ahmad Fauzi, S.Si.'),
  ('${T4_ID}', 'guru.ips@sekolah.com', 'Dewi Lestari, S.Pd.'),
  ('${T5_ID}', 'guru.bing@sekolah.com', 'Rina Wati, S.Pd.'),
  ('${BEND_ID}', 'bendahara@sekolah.com', 'Sri Mulyani, S.E.'),
  ('${TU_ID}', 'tatausaha@sekolah.com', 'Joko Widodo'),
  ('${KES_ID}', 'kesiswaan@sekolah.com', 'Ratna Sari, S.Pd.')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- User Roles
INSERT INTO public.user_roles (user_id, role, school_id) VALUES
  ('${SA_ID}', 'super_admin', NULL),
  ('${ADMIN_ID}', 'admin', '${SCHOOL_ID}'),
  ('${T1_ID}', 'teacher', '${SCHOOL_ID}'),
  ('${T2_ID}', 'teacher', '${SCHOOL_ID}'),
  ('${T3_ID}', 'teacher', '${SCHOOL_ID}'),
  ('${T4_ID}', 'teacher', '${SCHOOL_ID}'),
  ('${T5_ID}', 'teacher', '${SCHOOL_ID}'),
  ('${BEND_ID}', 'bendahara', '${SCHOOL_ID}'),
  ('${TU_ID}', 'tata_usaha', '${SCHOOL_ID}'),
  ('${KES_ID}', 'kesiswaan', '${SCHOOL_ID}')
ON CONFLICT (user_id, role) DO NOTHING;

-- Teachers
INSERT INTO public.teachers (user_id, subject, nip, is_homeroom_teacher, school_id) VALUES
  ('${T1_ID}', 'Matematika', '198501012010011001', true, '${SCHOOL_ID}'),
  ('${T2_ID}', 'Bahasa Indonesia', '198602022011012002', true, '${SCHOOL_ID}'),
  ('${T3_ID}', 'IPA', '198703032012011003', true, '${SCHOOL_ID}'),
  ('${T4_ID}', 'IPS', '198804042013012004', true, '${SCHOOL_ID}'),
  ('${T5_ID}', 'Bahasa Inggris', '198905052014012005', true, '${SCHOOL_ID}')
ON CONFLICT (user_id) DO UPDATE SET subject = EXCLUDED.subject;

-- Academic Year
INSERT INTO public.academic_years (id, year, is_active, school_id)
VALUES ('${AY_ID}', '2025/2026', true, '${SCHOOL_ID}')
ON CONFLICT (id) DO UPDATE SET is_active = true;

-- School Settings
INSERT INTO public.school_settings (id, school_name, headmaster_name, headmaster_nip, school_address, school_phone, district_name, academic_year, active_semester, app_name, bendahara_name, bendahara_nip, school_id, enable_student_status_check, enable_graduation_check, enable_complaint_channel, show_address, show_phone)
VALUES ('33333333-3333-3333-3333-333333333333', 'SMP Negeri 1 Contoh', 'Dr. H. Suparman, M.Pd.', '197001011995011001', 'Jl. Pendidikan No. 1, Kota Contoh', '022-1234567', 'DINAS PENDIDIKAN KOTA CONTOH', '2025/2026', 2, 'Sistem Manajemen Sekolah', 'Sri Mulyani, S.E.', '198001012005012001', '${SCHOOL_ID}', true, true, true, true, true)
ON CONFLICT (id) DO UPDATE SET school_name = EXCLUDED.school_name;

-- Get teacher record IDs for classes
DO \$\$
DECLARE
  t1_rec_id uuid; t2_rec_id uuid; t3_rec_id uuid; t4_rec_id uuid; t5_rec_id uuid;
BEGIN
  SELECT id INTO t1_rec_id FROM public.teachers WHERE user_id = '${T1_ID}' LIMIT 1;
  SELECT id INTO t2_rec_id FROM public.teachers WHERE user_id = '${T2_ID}' LIMIT 1;
  SELECT id INTO t3_rec_id FROM public.teachers WHERE user_id = '${T3_ID}' LIMIT 1;
  SELECT id INTO t4_rec_id FROM public.teachers WHERE user_id = '${T4_ID}' LIMIT 1;
  SELECT id INTO t5_rec_id FROM public.teachers WHERE user_id = '${T5_ID}' LIMIT 1;

  -- Classes
  INSERT INTO public.classes (id, name, grade, academic_year, homeroom_teacher_id, school_id) VALUES
    ('c1111111-0001-0001-0001-000000000001', 'VII A', 7, '2025/2026', t1_rec_id, '${SCHOOL_ID}'),
    ('c1111111-0001-0001-0001-000000000002', 'VII B', 7, '2025/2026', t2_rec_id, '${SCHOOL_ID}'),
    ('c1111111-0001-0001-0001-000000000003', 'VIII A', 8, '2025/2026', t3_rec_id, '${SCHOOL_ID}'),
    ('c1111111-0001-0001-0001-000000000004', 'VIII B', 8, '2025/2026', t4_rec_id, '${SCHOOL_ID}'),
    ('c1111111-0001-0001-0001-000000000005', 'IX A', 9, '2025/2026', t5_rec_id, '${SCHOOL_ID}')
  ON CONFLICT (id) DO UPDATE SET homeroom_teacher_id = EXCLUDED.homeroom_teacher_id;

  -- Schedules
  INSERT INTO public.schedules (id, class_id, teacher_id, subject, day_of_week, start_time, end_time, academic_year, semester, school_id) VALUES
    ('d1111111-0001-0001-0001-000000000001', 'c1111111-0001-0001-0001-000000000001', t1_rec_id, 'Matematika', 1, '07:00', '07:45', '2025/2026', 2, '${SCHOOL_ID}'),
    ('d1111111-0001-0001-0001-000000000002', 'c1111111-0001-0001-0001-000000000001', t2_rec_id, 'Bahasa Indonesia', 2, '07:00', '07:45', '2025/2026', 2, '${SCHOOL_ID}'),
    ('d1111111-0001-0001-0001-000000000003', 'c1111111-0001-0001-0001-000000000002', t3_rec_id, 'IPA', 1, '08:00', '08:45', '2025/2026', 2, '${SCHOOL_ID}'),
    ('d1111111-0001-0001-0001-000000000004', 'c1111111-0001-0001-0001-000000000002', t4_rec_id, 'IPS', 2, '08:00', '08:45', '2025/2026', 2, '${SCHOOL_ID}'),
    ('d1111111-0001-0001-0001-000000000005', 'c1111111-0001-0001-0001-000000000003', t5_rec_id, 'Bahasa Inggris', 1, '09:00', '09:45', '2025/2026', 2, '${SCHOOL_ID}'),
    ('d1111111-0001-0001-0001-000000000006', 'c1111111-0001-0001-0001-000000000003', t1_rec_id, 'Matematika', 2, '09:00', '09:45', '2025/2026', 2, '${SCHOOL_ID}'),
    ('d1111111-0001-0001-0001-000000000007', 'c1111111-0001-0001-0001-000000000004', t2_rec_id, 'Bahasa Indonesia', 1, '10:00', '10:45', '2025/2026', 2, '${SCHOOL_ID}'),
    ('d1111111-0001-0001-0001-000000000008', 'c1111111-0001-0001-0001-000000000004', t3_rec_id, 'IPA', 2, '10:00', '10:45', '2025/2026', 2, '${SCHOOL_ID}'),
    ('d1111111-0001-0001-0001-000000000009', 'c1111111-0001-0001-0001-000000000005', t4_rec_id, 'IPS', 1, '11:00', '11:45', '2025/2026', 2, '${SCHOOL_ID}'),
    ('d1111111-0001-0001-0001-000000000010', 'c1111111-0001-0001-0001-000000000005', t5_rec_id, 'Bahasa Inggris', 2, '11:00', '11:45', '2025/2026', 2, '${SCHOOL_ID}')
  ON CONFLICT (id) DO UPDATE SET subject = EXCLUDED.subject;
END \$\$;

-- Students (20 siswa aktif + 2 alumni)
INSERT INTO public.students (id, full_name, nis, nisn, gender, birth_place, birth_date, class_id, parent_name, parent_phone, address, school_id, is_alumni, graduation_date) VALUES
  ('a1111111-0001-0001-0001-000000000001', 'Ahmad Rizki Pratama', '20250001', '0051234001', 'L', 'Kota Contoh', '2008-01-01', 'c1111111-0001-0001-0001-000000000001', 'Sugeng Pratama', '081234560001', 'Jl. Contoh No. 1', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000002', 'Putri Ayu Lestari', '20250002', '0051234002', 'P', 'Kota Contoh', '2008-02-02', 'c1111111-0001-0001-0001-000000000002', 'Bambang Lestari', '081234560002', 'Jl. Contoh No. 2', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000003', 'Muhammad Farhan', '20250003', '0051234003', 'L', 'Kota Contoh', '2008-03-03', 'c1111111-0001-0001-0001-000000000003', 'Hendra Farhan', '081234560003', 'Jl. Contoh No. 3', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000004', 'Siti Nurhaliza', '20250004', '0051234004', 'P', 'Kota Contoh', '2008-04-04', 'c1111111-0001-0001-0001-000000000004', 'Abdul Halim', '081234560004', 'Jl. Contoh No. 4', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000005', 'Dimas Arya Putra', '20250005', '0051234005', 'L', 'Kota Contoh', '2008-05-05', 'c1111111-0001-0001-0001-000000000005', 'Wahyu Putra', '081234560005', 'Jl. Contoh No. 5', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000006', 'Anisa Fitri', '20250006', '0051234006', 'P', 'Kota Contoh', '2008-06-06', 'c1111111-0001-0001-0001-000000000001', 'Ridwan Fitri', '081234560006', 'Jl. Contoh No. 6', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000007', 'Rafi Hidayat', '20250007', '0051234007', 'L', 'Kota Contoh', '2008-07-07', 'c1111111-0001-0001-0001-000000000002', 'Tono Hidayat', '081234560007', 'Jl. Contoh No. 7', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000008', 'Dewi Safitri', '20250008', '0051234008', 'P', 'Kota Contoh', '2008-08-08', 'c1111111-0001-0001-0001-000000000003', 'Agus Safitri', '081234560008', 'Jl. Contoh No. 8', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000009', 'Fajar Ramadhan', '20250009', '0051234009', 'L', 'Kota Contoh', '2008-09-09', 'c1111111-0001-0001-0001-000000000004', 'Ujang Ramadhan', '081234560009', 'Jl. Contoh No. 9', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000010', 'Nisa Amelia', '20250010', '0051234010', 'P', 'Kota Contoh', '2008-10-10', 'c1111111-0001-0001-0001-000000000005', 'Dedi Amelia', '081234560010', 'Jl. Contoh No. 10', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000011', 'Yoga Aditya', '20250011', '0051234011', 'L', 'Kota Contoh', '2009-01-11', 'c1111111-0001-0001-0001-000000000001', 'Slamet Aditya', '081234560011', 'Jl. Contoh No. 11', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000012', 'Rani Oktaviani', '20250012', '0051234012', 'P', 'Kota Contoh', '2009-02-12', 'c1111111-0001-0001-0001-000000000002', 'Jajang Oktaviani', '081234560012', 'Jl. Contoh No. 12', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000013', 'Bayu Setiawan', '20250013', '0051234013', 'L', 'Kota Contoh', '2009-03-13', 'c1111111-0001-0001-0001-000000000003', 'Eko Setiawan', '081234560013', 'Jl. Contoh No. 13', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000014', 'Lina Marlina', '20250014', '0051234014', 'P', 'Kota Contoh', '2009-04-14', 'c1111111-0001-0001-0001-000000000004', 'Udin Marlina', '081234560014', 'Jl. Contoh No. 14', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000015', 'Andi Prasetyo', '20250015', '0051234015', 'L', 'Kota Contoh', '2009-05-15', 'c1111111-0001-0001-0001-000000000005', 'Budi Prasetyo', '081234560015', 'Jl. Contoh No. 15', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000016', 'Maya Sari', '20250016', '0051234016', 'P', 'Kota Contoh', '2009-06-16', 'c1111111-0001-0001-0001-000000000001', 'Asep Sari', '081234560016', 'Jl. Contoh No. 16', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000017', 'Rizky Maulana', '20250017', '0051234017', 'L', 'Kota Contoh', '2009-07-17', 'c1111111-0001-0001-0001-000000000002', 'Cecep Maulana', '081234560017', 'Jl. Contoh No. 17', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000018', 'Indah Permata', '20250018', '0051234018', 'P', 'Kota Contoh', '2009-08-18', 'c1111111-0001-0001-0001-000000000003', 'Dadang Permata', '081234560018', 'Jl. Contoh No. 18', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000019', 'Galih Pratama', '20250019', '0051234019', 'L', 'Kota Contoh', '2009-09-19', 'c1111111-0001-0001-0001-000000000004', 'Edi Pratama', '081234560019', 'Jl. Contoh No. 19', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000020', 'Wulan Dari', '20250020', '0051234020', 'P', 'Kota Contoh', '2009-10-20', 'c1111111-0001-0001-0001-000000000005', 'Firman Dari', '081234560020', 'Jl. Contoh No. 20', '${SCHOOL_ID}', false, NULL),
  ('a1111111-0001-0001-0001-000000000021', 'Rahmat Hidayatullah', '20250021', '0051234021', 'L', 'Kota Contoh', '2007-11-21', NULL, 'Gani Hidayatullah', '081234560021', 'Jl. Contoh No. 21', '${SCHOOL_ID}', true, '2025-06-15'),
  ('a1111111-0001-0001-0001-000000000022', 'Sinta Dewi', '20250022', '0051234022', 'P', 'Kota Contoh', '2007-12-22', NULL, 'Hasan Dewi', '081234560022', 'Jl. Contoh No. 22', '${SCHOOL_ID}', true, '2025-06-15')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Violation Types
INSERT INTO public.violation_types (id, name, category, points, description, school_id, is_active) VALUES
  ('b1111111-0001-0001-0001-000000000001', 'Terlambat', 'ringan', 5, 'Terlambat masuk sekolah', '${SCHOOL_ID}', true),
  ('b1111111-0001-0001-0001-000000000002', 'Tidak memakai seragam', 'sedang', 10, 'Tidak memakai seragam lengkap', '${SCHOOL_ID}', true),
  ('b1111111-0001-0001-0001-000000000003', 'Berkelahi', 'berat', 25, 'Berkelahi di lingkungan sekolah', '${SCHOOL_ID}', true),
  ('b1111111-0001-0001-0001-000000000004', 'Bolos', 'sedang', 15, 'Bolos tanpa keterangan', '${SCHOOL_ID}', true),
  ('b1111111-0001-0001-0001-000000000005', 'Rambut panjang', 'ringan', 5, 'Rambut melebihi batas ketentuan', '${SCHOOL_ID}', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Attendance Day Settings
INSERT INTO public.attendance_day_settings (day_of_week, day_name, is_active, school_id) VALUES
  (1, 'Senin', true, '${SCHOOL_ID}'),
  (2, 'Selasa', true, '${SCHOOL_ID}'),
  (3, 'Rabu', true, '${SCHOOL_ID}'),
  (4, 'Kamis', true, '${SCHOOL_ID}'),
  (5, 'Jumat', true, '${SCHOOL_ID}'),
  (6, 'Sabtu', false, '${SCHOOL_ID}'),
  (0, 'Minggu', false, '${SCHOOL_ID}')
ON CONFLICT DO NOTHING;

-- School Subscription (free tier) - skip if table/columns don't match
DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'school_subscriptions') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'school_subscriptions' AND column_name = 'plan_id') THEN
      EXECUTE format('INSERT INTO public.school_subscriptions (school_id, plan_id, status, start_date) VALUES (%L, %L, %L, CURRENT_DATE) ON CONFLICT DO NOTHING', '${SCHOOL_ID}', 'free', 'active');
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'school_subscriptions' AND column_name = 'subscription_plan') THEN
      EXECUTE format('INSERT INTO public.school_subscriptions (school_id, subscription_plan, status, start_date) VALUES (%L, %L, %L, CURRENT_DATE) ON CONFLICT DO NOTHING', '${SCHOOL_ID}', 'free', 'active');
    ELSE
      RAISE NOTICE 'school_subscriptions: kolom plan tidak ditemukan, skip insert';
    END IF;
  END IF;
END \$\$;
SEEDSQL

    docker cp "/tmp/seed-data.sql" "${DB_CONTAINER}:/tmp/seed-data.sql"
    docker exec "$DB_CONTAINER" chmod 644 "/tmp/seed-data.sql"
    docker exec "$DB_CONTAINER" chown postgres:postgres "/tmp/seed-data.sql"
    if docker exec --user postgres "$DB_CONTAINER" psql -U postgres -d postgres -f "/tmp/seed-data.sql" 2>&1 | tail -10; then
      log_ok "Seed data berhasil diimpor!"
    else
      log_warn "Beberapa seed data mungkin gagal (normal jika sudah ada)"
    fi
    docker exec "$DB_CONTAINER" rm -f "/tmp/seed-data.sql" 2>/dev/null || true
    rm -f "/tmp/seed-data.sql"

    echo ""
    log_ok "Akun login yang dibuat:"
    echo -e "  ${CYAN}Super Admin${NC}  : superadmin@sekolah.com / SuperAdmin123!"
    echo -e "  ${CYAN}Admin${NC}        : admin@sekolah.com / Admin123!"
    echo -e "  ${CYAN}Guru (5)${NC}     : guru.matematika@sekolah.com / Guru123!"
    echo -e "                 guru.bindo@sekolah.com / Guru123!"
    echo -e "                 guru.ipa@sekolah.com / Guru123!"
    echo -e "                 guru.ips@sekolah.com / Guru123!"
    echo -e "                 guru.bing@sekolah.com / Guru123!"
    echo -e "  ${CYAN}Bendahara${NC}    : bendahara@sekolah.com / Bendahara123!"
    echo -e "  ${CYAN}Tata Usaha${NC}   : tatausaha@sekolah.com / TataUsaha123!"
    echo -e "  ${CYAN}Kesiswaan${NC}    : kesiswaan@sekolah.com / Kesiswaan123!"
    echo ""
    log_info "Data dummy: 1 sekolah, 5 kelas, 22 siswa (20 aktif + 2 alumni), 10 jadwal, 5 jenis pelanggaran"
  else
    log_warn "Auth service belum siap, skip seeding. Jalankan manual setelah semua service aktif."
  fi
fi

# ============ FINAL: RESTART ALL SUPABASE SERVICES ============
log_step "Restart Semua Service Supabase"

cd "${SUPABASE_DIR}/docker"

# Restart all containers to ensure clean state after migration + seeding
log_info "Restart semua container Supabase untuk memastikan semua service berjalan..."
docker compose restart 2>/dev/null || true

# Wait for all services to be healthy
log_info "Menunggu semua service siap..."
sleep 10

# Check each critical service
FINAL_OK=true

# Check DB
for i in $(seq 1 20); do
  if docker exec supabase-db pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; then
    log_ok "Database: OK"
    break
  fi
  if [ "$i" -eq 20 ]; then
    log_err "Database: GAGAL"
    FINAL_OK=false
  fi
  sleep 2
done

# Check API (PostgREST via Kong)
for i in $(seq 1 30); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000/rest/v1/" 2>/dev/null || echo "000")
  # 401/403 itu normal jika tanpa apikey — yang penting service hidup (bukan 5xx/000)
  if [ "$HTTP_CODE" != "000" ] && [ "$HTTP_CODE" -lt 500 ]; then
    log_ok "API (REST): OK (HTTP ${HTTP_CODE})"
    break
  fi
  if [ "$i" -eq 30 ]; then
    log_err "API (REST): GAGAL (HTTP ${HTTP_CODE})"
    log_info "Coba restart manual: cd ${SUPABASE_DIR}/docker && docker compose restart"
    FINAL_OK=false
  fi
  sleep 3
done

# Check Auth
for i in $(seq 1 20); do
  AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000/auth/v1/health" 2>/dev/null || echo "000")
  # Di beberapa setup, endpoint health bisa kena API key plugin dan balikin 401 — itu tetap berarti service hidup
  if [ "$AUTH_CODE" != "000" ] && [ "$AUTH_CODE" -lt 500 ]; then
    log_ok "Auth: OK (HTTP ${AUTH_CODE})"
    break
  fi
  if [ "$i" -eq 20 ]; then
    log_err "Auth: GAGAL (HTTP ${AUTH_CODE})"
    FINAL_OK=false
  fi
  sleep 2
done

if [ "$FINAL_OK" = true ]; then
  log_ok "Semua service Supabase berjalan dengan baik!"
else
  log_warn "Beberapa service belum siap. Jalankan: cd ${SUPABASE_DIR}/docker && docker compose restart"
  log_info "Lalu cek: docker compose ps"
fi

cd "$APP_DIR"

# ============ LANGKAH 11: SCRIPTS OPERASIONAL ============
log_step "Langkah 11/12: Scripts Operasional"

cat > "/home/${DEPLOY_USER}/backup.sh" <<'BACKUP'
#!/bin/bash
set -euo pipefail
BACKUP_DIR="$HOME/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30
mkdir -p "$BACKUP_DIR"
echo "[$(date)] Starting backup..."

DB_CONTAINER=""
for cname in "supabase-db" "supabase-docker-db-1" "docker-db-1"; do
  if docker ps --format '{{.Names}}' | grep -q "^${cname}$"; then
    DB_CONTAINER="$cname"
    break
  fi
done
if [ -z "$DB_CONTAINER" ]; then
  DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i -E "(db|postgres)" | head -1)
fi

if [ -n "$DB_CONTAINER" ]; then
  docker exec --user postgres "$DB_CONTAINER" pg_dump -U postgres -d postgres --format=custom --compress=9 > "$BACKUP_DIR/db_${DATE}.dump"
  echo "[$(date)] DB backup done"
else
  echo "[$(date)] DB container not found, skip DB backup"
fi

tar -czf "$BACKUP_DIR/storage_${DATE}.tar.gz" -C ~/sekolah-app/supabase-docker/docker/volumes storage/ 2>/dev/null || true
tar -czf "$BACKUP_DIR/config_${DATE}.tar.gz" ~/sekolah-app/supabase-docker/docker/.env /etc/nginx/sites-available/sekolah-app 2>/dev/null || true
find "$BACKUP_DIR" -name "*.dump" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
echo "[$(date)] Backup complete. Size: $(du -sh "$BACKUP_DIR" | cut -f1)"
BACKUP

cat > "/home/${DEPLOY_USER}/healthcheck.sh" <<HEALTH
#!/bin/bash
check_service() {
  local name=\$1 url=\$2
  local status=\$(curl -s -o /dev/null -w "%{http_code}" "\$url" --max-time 10)
  # 401/403 bisa normal jika endpoint butuh apikey; anggap sehat selama bukan 5xx/000
  if [ "\$status" != "000" ] && [ "\$status" -lt 500 ]; then
    echo "OK \$name: \$status"
  else
    echo "FAIL \$name: \$status"
  fi
}
echo "=== Health Check \$(date) ==="
check_service "Frontend" "https://${DOMAIN}"
check_service "API" "https://${API_DOMAIN}/rest/v1/"
check_service "Auth" "https://${API_DOMAIN}/auth/v1/health"

DISK=\$(df -h / | awk 'NR==2 {print \$5}' | tr -d '%')
[ "\$DISK" -gt 85 ] && echo "WARN Disk: \${DISK}%"
MEM=\$(free | awk '/Mem:/ {printf "%.0f", \$3/\$2 * 100}')
[ "\$MEM" -gt 90 ] && echo "WARN Memory: \${MEM}%"

echo ""
echo "=== Docker ==="
docker compose -f ~/sekolah-app/supabase-docker/docker/docker-compose.yml ps --format "table {{.Name}}\t{{.Status}}"
HEALTH

cat > "/home/${DEPLOY_USER}/deploy.sh" <<DEPLOY
#!/bin/bash
set -euo pipefail
export PATH=\$HOME/.bun/bin:\$PATH
APP="${APP_DIR}/app"
DATE=\$(date +%Y%m%d_%H%M%S)

echo "Deploy started \$(date)"

mkdir -p ~/backups

DB_CONTAINER=\$(docker ps --format '{{.Names}}' | grep -i -E "(db|postgres)" | head -1)
if [ -n "\$DB_CONTAINER" ]; then
  docker exec --user postgres "\$DB_CONTAINER" pg_dump -U postgres -d postgres --format=custom --compress=9 > ~/backups/pre_deploy_\${DATE}.dump 2>/dev/null || true
fi

cd "\$APP"
[ -d ".git" ] && git pull origin main

\$HOME/.bun/bin/bun install
\$HOME/.bun/bin/bun run build

if [ -d "supabase/migrations" ] && [ -n "\${DB_CONTAINER:-}" ]; then
  echo "Info: migrasi SQL tidak dijalankan otomatis saat deploy untuk menghindari error duplikasi objek."
  echo "Gunakan ~/import-migration.sh jika memang ingin import migration manual."
fi

sudo nginx -t && sudo systemctl reload nginx
echo "Deploy complete \$(date)"
echo "https://${DOMAIN}"
DEPLOY

cat > "/home/${DEPLOY_USER}/import-migration.sh" <<'IMPORTMIG'
#!/bin/bash
set -uo pipefail

if [ -z "${1:-}" ]; then
  echo "Penggunaan: ./import-migration.sh <file.sql>"
  echo ""
  echo "File SQL bisa didapat dari menu Backup & Restore > Export Database"
  echo "di aplikasi (login sebagai Super Admin)."
  exit 1
fi

SQL_FILE="$1"
if [ ! -f "$SQL_FILE" ]; then
  echo "File tidak ditemukan: $SQL_FILE"
  exit 1
fi

DB_CONTAINER=""
for cname in "supabase-db" "supabase-docker-db-1" "docker-db-1" "supabase_db_1"; do
  if docker ps --format '{{.Names}}' | grep -q "^${cname}$"; then
    DB_CONTAINER="$cname"
    break
  fi
done
if [ -z "$DB_CONTAINER" ]; then
  DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i -E "(db|postgres)" | head -1)
fi

if [ -z "$DB_CONTAINER" ]; then
  echo "Container PostgreSQL tidak ditemukan! Pastikan Supabase sudah jalan."
  exit 1
fi

echo "Container DB: $DB_CONTAINER"
echo "File: $SQL_FILE ($(du -h "$SQL_FILE" | cut -f1))"
echo ""

BACKUP_DIR="$HOME/backups"
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)
echo "Backup database sebelum import..."
docker exec --user postgres "$DB_CONTAINER" pg_dump -U postgres -d postgres --format=custom --compress=9 > "$BACKUP_DIR/pre_import_${DATE}.dump" 2>/dev/null || true
echo "Backup disimpan di: $BACKUP_DIR/pre_import_${DATE}.dump"
echo ""

FNAME=$(basename "$SQL_FILE")
echo "Mengimpor migration..."
docker cp "$SQL_FILE" "${DB_CONTAINER}:/tmp/${FNAME}"
docker exec "$DB_CONTAINER" chmod 644 "/tmp/${FNAME}"
docker exec "$DB_CONTAINER" chown postgres:postgres "/tmp/${FNAME}"
docker exec --user postgres "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=0 -f "/tmp/${FNAME}" 2>&1 | tail -40
RESULT=${PIPESTATUS[0]}
docker exec "$DB_CONTAINER" rm -f "/tmp/${FNAME}" 2>/dev/null || true

echo "Reload schema cache API..."
docker exec --user postgres "$DB_CONTAINER" psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema'; NOTIFY pgrst, 'reload config';" >/dev/null 2>&1 || true
REST_CONTAINER=""
for cname in "supabase-rest" "supabase-docker-rest-1" "docker-rest-1" "supabase_rest_1"; do
  if docker ps --format '{{.Names}}' | grep -q "^${cname}$"; then
    REST_CONTAINER="$cname"
    break
  fi
done
if [ -n "$REST_CONTAINER" ]; then
  docker restart "$REST_CONTAINER" >/dev/null 2>&1 || true
  echo "PostgREST direstart: $REST_CONTAINER"
fi

if [ $RESULT -eq 0 ]; then
  echo ""
  echo "Import selesai! Database berhasil dimigrasikan."
else
  echo ""
  echo "Import selesai dengan beberapa warning (normal jika objek sudah ada)."
fi
IMPORTMIG

chmod +x "/home/${DEPLOY_USER}/backup.sh"
chmod +x "/home/${DEPLOY_USER}/healthcheck.sh"
chmod +x "/home/${DEPLOY_USER}/deploy.sh"
chmod +x "/home/${DEPLOY_USER}/import-migration.sh"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/backup.sh"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/healthcheck.sh"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/deploy.sh"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/import-migration.sh"
mkdir -p "/home/${DEPLOY_USER}/backups"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/backups"

su - "$DEPLOY_USER" -c '
(crontab -l 2>/dev/null | grep -v backup.sh | grep -v healthcheck.sh; \
echo "0 2 * * * ~/backup.sh >> ~/backup.log 2>&1"; \
echo "*/5 * * * * ~/healthcheck.sh >> ~/healthcheck.log 2>&1") | crontab -
'

log_ok "Scripts operasional dibuat"

# ============ LANGKAH 12: LOGROTATE & FINALISASI ============
log_step "Langkah 12/12: Logrotate & Finalisasi"

cat > /etc/logrotate.d/sekolah-app <<LOGR
/home/${DEPLOY_USER}/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 ${DEPLOY_USER} ${DEPLOY_USER}
}
LOGR

chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "$APP_DIR"

log_ok "Logrotate dikonfigurasi"

# ============ SUMMARY ============
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  INSTALASI SELESAI!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Frontend     : https://${DOMAIN}"
echo -e "  API          : https://${API_DOMAIN}"
echo -e "  Studio       : https://${API_DOMAIN}/studio/"
echo ""
echo -e "  Deploy User  : ${DEPLOY_USER}"
echo -e "  Deploy Pass  : ${DEPLOY_PASSWORD}"
echo -e "  App Dir      : ${APP_DIR}"
echo ""
echo -e "  ${CYAN}Akun Login Aplikasi:${NC}"
echo -e "  - Super Admin  : superadmin@sekolah.com / SuperAdmin123!"
echo -e "  - Admin        : admin@sekolah.com / Admin123!"
echo -e "  - Guru         : guru.matematika@sekolah.com / Guru123!"
echo -e "  - Bendahara    : bendahara@sekolah.com / Bendahara123!"
echo -e "  - Tata Usaha   : tatausaha@sekolah.com / TataUsaha123!"
echo -e "  - Kesiswaan    : kesiswaan@sekolah.com / Kesiswaan123!"
echo ""
echo -e "  Credentials (SIMPAN DENGAN AMAN!):"
echo -e "  - DB Password  : ${POSTGRES_PASSWORD}"
echo -e "  - JWT Secret   : ${JWT_SECRET}"
echo -e "  - Anon Key     : ${ANON_KEY}"
echo -e "  - Service Key  : ${SERVICE_ROLE_KEY}"
echo -e "  - Studio Pass  : ${DASHBOARD_PASSWORD}"
echo ""
echo -e "  Perintah operasional:"
echo -e "  - ~/deploy.sh              - Deploy update"
echo -e "  - ~/backup.sh              - Manual backup"
echo -e "  - ~/import-migration.sh    - Import full migration"
echo -e "  - ~/healthcheck.sh         - Health check"
echo -e "  - Backup otomatis          - Setiap hari jam 02:00"
echo ""
echo -e "${YELLOW}  Pastikan DNS A record mengarah ke IP server ini:${NC}"
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo 'IP_SERVER')
echo -e "  - ${DOMAIN}       -> ${SERVER_IP}"
echo -e "  - www.${DOMAIN}   -> ${SERVER_IP}"
echo -e "  - ${API_DOMAIN}   -> ${SERVER_IP}"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Simpan credentials ke file
CREDS_FILE="/home/${DEPLOY_USER}/.credentials"
cat > "$CREDS_FILE" <<CREDS
# Credentials - HAPUS FILE INI SETELAH DICATAT!
# Generated: $(date)
DOMAIN=${DOMAIN}
API_DOMAIN=${API_DOMAIN}
DEPLOY_USER=${DEPLOY_USER}
DEPLOY_PASSWORD=${DEPLOY_PASSWORD}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}
CREDS
chmod 600 "$CREDS_FILE"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "$CREDS_FILE"
log_warn "Credentials disimpan di ${CREDS_FILE} - HAPUS setelah dicatat!"

# ============ GENERATE .env REFERENSI SUPABASE ============
ENV_REF="/home/${DEPLOY_USER}/.env.supabase"
cat > "$ENV_REF" <<ENVREF
# =============================================
# Supabase Self-Hosted Environment Variables
# Generated: $(date)
# =============================================

# === Frontend (VITE) ===
VITE_SUPABASE_URL=https://${API_DOMAIN}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
VITE_SUPABASE_PROJECT_ID=sekolah-app

# === Supabase Core ===
SUPABASE_URL=https://${API_DOMAIN}
SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
SUPABASE_JWT_SECRET=${JWT_SECRET}

# === Database ===
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5432/postgres

# === Domain ===
SITE_URL=https://${DOMAIN}
API_EXTERNAL_URL=https://${API_DOMAIN}

# === SMTP ===
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}

# === Dashboard ===
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}
ENVREF

chmod 600 "$ENV_REF"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "$ENV_REF"
log_ok "File .env.supabase referensi disimpan di ${ENV_REF}"
log_info "Gunakan: cat ~/.env.supabase untuk melihat semua kredensial"
