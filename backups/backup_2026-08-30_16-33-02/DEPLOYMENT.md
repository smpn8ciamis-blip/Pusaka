# 🚀 Panduan Instalasi Lengkap - Ubuntu VPS

## Prasyarat
- VPS dengan Ubuntu 22.04 LTS (minimal 4 vCPU, 8GB RAM, 160GB NVMe SSD)
- Domain yang sudah diarahkan ke IP VPS
- Akses SSH root atau sudo user

---

## 📋 Langkah 1: Setup Awal Server

```bash
# Login ke VPS
ssh root@IP_VPS_ANDA

# Update sistem
apt update && apt upgrade -y

# Set timezone Indonesia
timedctl set-timezone Asia/Jakarta

# Buat user non-root
adduser deploy
usermod -aG sudo deploy

# Setup SSH key untuk user baru
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Disable root login & password auth
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd
```

---

## 📋 Langkah 2: Firewall & Keamanan

```bash
# Login sebagai user deploy
su - deploy

# Setup UFW Firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Install Fail2ban
sudo apt install -y fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Edit konfigurasi Fail2ban
sudo tee /etc/fail2ban/jail.local > /dev/null <<'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 86400
EOF

sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Auto security updates
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## 📋 Langkah 3: Install Docker & Docker Compose

```bash
# Install dependencies
sudo apt install -y ca-certificates curl gnupg lsb-release

# Add Docker GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker deploy
newgrp docker

# Verify
docker --version
docker compose version
```

---

## 📋 Langkah 4: Install Supabase Self-Hosted

```bash
# Buat direktori project
mkdir -p ~/sekolah-app && cd ~/sekolah-app

# Clone Supabase Docker
git clone --depth 1 https://github.com/supabase/supabase.git supabase-docker
cd supabase-docker/docker

# Copy env file
cp .env.example .env
```

### Edit file `.env`:

```bash
nano .env
```

**Ubah variabel berikut:**

```env
############
# Secrets - GANTI SEMUA DENGAN VALUE RANDOM YANG KUAT!
############

# Generate dengan: openssl rand -base64 32
POSTGRES_PASSWORD=ganti_password_database_yang_kuat_sekali
JWT_SECRET=ganti_jwt_secret_minimal_32_karakter_random
ANON_KEY=generate_dari_jwt_secret
SERVICE_ROLE_KEY=generate_dari_jwt_secret

# Dashboard
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=ganti_password_dashboard

# Database
POSTGRES_HOST=db
POSTGRES_DB=postgres
POSTGRES_PORT=5432

# API
SITE_URL=https://domain-anda.com
API_EXTERNAL_URL=https://api.domain-anda.com

# Studio
STUDIO_DEFAULT_ORGANIZATION=Sekolah
STUDIO_DEFAULT_PROJECT=Sistem-Manajemen-Sekolah
SUPABASE_PUBLIC_URL=https://api.domain-anda.com

# SMTP (untuk email verifikasi)
SMTP_ADMIN_EMAIL=admin@domain-anda.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=email@gmail.com
SMTP_PASS=app_password_gmail
SMTP_SENDER_NAME=Sistem Manajemen Sekolah
```

### Generate JWT Keys:

```bash
# Install Node.js untuk generate key
sudo apt install -y nodejs npm

# Generate ANON_KEY
node -e "
const jwt = require('jsonwebtoken');
const payload = {
  role: 'anon',
  iss: 'supabase',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60)
};
console.log('ANON_KEY:', jwt.sign(payload, 'JWT_SECRET_ANDA'));
"

# Generate SERVICE_ROLE_KEY
node -e "
const jwt = require('jsonwebtoken');
const payload = {
  role: 'service_role',
  iss: 'supabase',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60)
};
console.log('SERVICE_ROLE_KEY:', jwt.sign(payload, 'JWT_SECRET_ANDA'));
"
```

> **Catatan**: Ganti `JWT_SECRET_ANDA` dengan nilai `JWT_SECRET` yang sudah Anda set di `.env`

### Optimasi PostgreSQL:

```bash
# Buat file konfigurasi PostgreSQL kustom
mkdir -p ~/sekolah-app/supabase-docker/docker/volumes/db
cat > ~/sekolah-app/supabase-docker/docker/volumes/db/custom-postgresql.conf <<'EOF'
# Memory (sesuaikan dengan RAM VPS)
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 64MB
maintenance_work_mem = 512MB
huge_pages = try

# Connections
max_connections = 200
superuser_reserved_connections = 5

# WAL
wal_level = replica
max_wal_size = 2GB
min_wal_size = 512MB
wal_buffers = 64MB

# Query Planning
random_page_cost = 1.1
effective_io_concurrency = 200
default_statistics_target = 200

# Logging
log_min_duration_statement = 1000
log_checkpoints = on
log_connections = off
log_disconnections = off
log_lock_waits = on
log_temp_files = 0

# Locale
lc_messages = 'en_US.UTF-8'
lc_monetary = 'id_ID.UTF-8'
lc_numeric = 'id_ID.UTF-8'
lc_time = 'id_ID.UTF-8'

# Timezone
timezone = 'Asia/Jakarta'
EOF
```

### Start Supabase:

```bash
cd ~/sekolah-app/supabase-docker/docker
docker compose up -d

# Cek status
docker compose ps

# Lihat log
docker compose logs -f --tail=50
```

---

## 📋 Langkah 5: Build & Deploy Aplikasi React

```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Bun (package manager)
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Clone atau upload kode aplikasi
cd ~/sekolah-app
# Jika dari Git:
git clone https://github.com/username/repo-sekolah.git app
# Atau upload manual via SCP:
# scp -r ./project deploy@IP_VPS:~/sekolah-app/app

cd app

# Install dependencies
bun install

# Buat file .env.production
cat > .env.production <<'EOF'
VITE_SUPABASE_URL=https://api.domain-anda.com
VITE_SUPABASE_PUBLISHABLE_KEY=ANON_KEY_ANDA
VITE_SUPABASE_PROJECT_ID=sekolah-app
EOF

# Build production
bun run build

# Hasil build ada di folder dist/
ls -la dist/
```

---

## 📋 Langkah 6: Setup Nginx Reverse Proxy

```bash
# Install Nginx
sudo apt install -y nginx

# Buat konfigurasi untuk aplikasi
sudo tee /etc/nginx/sites-available/sekolah-app <<'EOF'
# Rate limiting
limit_req_zone $binary_remote_addr zone=general:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

# Gzip compression
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss application/atom+xml image/svg+xml;

# === Frontend (React App) ===
server {
    listen 80;
    server_name domain-anda.com www.domain-anda.com;

    root /home/deploy/sekolah-app/app/dist;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api.domain-anda.com wss://api.domain-anda.com;" always;

    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # SPA fallback
    location / {
        limit_req zone=general burst=50 nodelay;
        try_files $uri $uri/ /index.html;
    }

    # Block sensitive files
    location ~ /\. {
        deny all;
    }
}

# === Supabase API Proxy ===
server {
    listen 80;
    server_name api.domain-anda.com;

    # Kong API Gateway
    location / {
        limit_req zone=api burst=20 nodelay;

        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (untuk Realtime)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 16k;
        proxy_buffers 4 32k;
    }

    # Supabase Studio (opsional, untuk admin)
    location /studio/ {
        proxy_pass http://localhost:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # Batasi akses studio
        # allow IP_ADMIN_ANDA;
        # deny all;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/sekolah-app /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test & reload
sudo nginx -t
sudo systemctl reload nginx
```

---

## 📋 Langkah 7: SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Generate SSL untuk kedua domain
sudo certbot --nginx -d domain-anda.com -d www.domain-anda.com -d api.domain-anda.com \
  --email admin@domain-anda.com --agree-tos --no-eff-email

# Auto-renew sudah otomatis, verifikasi:
sudo certbot renew --dry-run

# Cek auto-renew timer
sudo systemctl status certbot.timer
```

---

## 📋 Langkah 8: Import Database & Migrasi

```bash
cd ~/sekolah-app/app

# Export dari Lovable Cloud (jika ada data existing)
# Download file SQL migrasi dari project

# Jalankan semua migrasi
for f in supabase/migrations/*.sql; do
  echo "Running migration: $f"
  docker exec -i supabase-db psql -U postgres -d postgres < "$f"
done

# Verifikasi tabel
docker exec -it supabase-db psql -U postgres -d postgres -c "\dt public.*"
```

---

## 📋 Langkah 9: Deploy Edge Functions

```bash
# Install Supabase CLI
npm install -g supabase

# Login ke Supabase lokal
export SUPABASE_URL=http://localhost:8000
export SUPABASE_SERVICE_ROLE_KEY=SERVICE_ROLE_KEY_ANDA

# Deploy edge functions
cd ~/sekolah-app/app

# Copy edge functions ke Supabase docker
for func_dir in supabase/functions/*/; do
  func_name=$(basename "$func_dir")
  echo "Deploying function: $func_name"
  
  # Deploy menggunakan Supabase CLI
  npx supabase functions deploy "$func_name" \
    --project-ref local \
    --no-verify-jwt  # Sesuaikan per function
done

# Atau deploy manual dengan Docker
# Salin folder functions ke volume Supabase
cp -r supabase/functions ~/sekolah-app/supabase-docker/docker/volumes/functions/
```

---

## 📋 Langkah 10: Backup Otomatis

```bash
# Buat script backup
sudo tee /home/deploy/backup.sh <<'SCRIPT'
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/home/deploy/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."

# 1. Database backup
docker exec supabase-db pg_dump -U postgres -d postgres \
  --format=custom --compress=9 \
  > "$BACKUP_DIR/db_${DATE}.dump"

# 2. Storage backup
tar -czf "$BACKUP_DIR/storage_${DATE}.tar.gz" \
  -C ~/sekolah-app/supabase-docker/docker/volumes storage/ 2>/dev/null || true

# 3. Config backup
tar -czf "$BACKUP_DIR/config_${DATE}.tar.gz" \
  ~/sekolah-app/supabase-docker/docker/.env \
  /etc/nginx/sites-available/sekolah-app

# 4. Cleanup old backups
find "$BACKUP_DIR" -name "*.dump" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete

# 5. Log size
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "[$(date)] Backup complete. Total backup size: $TOTAL_SIZE"
SCRIPT

chmod +x /home/deploy/backup.sh

# Setup crontab - backup setiap hari jam 2 pagi
(crontab -l 2>/dev/null; echo "0 2 * * * /home/deploy/backup.sh >> /home/deploy/backup.log 2>&1") | crontab -

# Backup mingguan ke remote (opsional)
# 0 3 * * 0 rsync -avz /home/deploy/backups/ user@backup-server:/backups/sekolah/
```

---

## 📋 Langkah 11: Monitoring & Health Check

```bash
# Install monitoring tools
sudo apt install -y htop iotop

# Buat health check script
sudo tee /home/deploy/healthcheck.sh <<'SCRIPT'
#!/bin/bash

check_service() {
  local name=$1
  local url=$2
  local status=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 10)
  
  if [ "$status" -ge 200 ] && [ "$status" -lt 400 ]; then
    echo "✅ $name: OK ($status)"
  else
    echo "❌ $name: FAIL ($status)"
    # Kirim notifikasi (opsional)
    # curl -X POST "https://api.telegram.org/botTOKEN/sendMessage" \
    #   -d "chat_id=CHAT_ID&text=⚠️ $name DOWN! Status: $status"
  fi
}

echo "=== Health Check $(date) ==="
check_service "Frontend" "https://domain-anda.com"
check_service "API" "https://api.domain-anda.com/rest/v1/"
check_service "Auth" "https://api.domain-anda.com/auth/v1/health"

# Cek disk usage
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$DISK_USAGE" -gt 85 ]; then
  echo "⚠️ Disk usage tinggi: ${DISK_USAGE}%"
fi

# Cek memory
MEM_USAGE=$(free | awk '/Mem:/ {printf "%.0f", $3/$2 * 100}')
if [ "$MEM_USAGE" -gt 90 ]; then
  echo "⚠️ Memory usage tinggi: ${MEM_USAGE}%"
fi

# Cek Docker containers
echo ""
echo "=== Docker Status ==="
docker compose -f ~/sekolah-app/supabase-docker/docker/docker-compose.yml ps --format "table {{.Name}}\t{{.Status}}"
SCRIPT

chmod +x /home/deploy/healthcheck.sh

# Jalankan health check setiap 5 menit
(crontab -l 2>/dev/null; echo "*/5 * * * * /home/deploy/healthcheck.sh >> /home/deploy/healthcheck.log 2>&1") | crontab -
```

---

## 📋 Langkah 12: Auto-Deploy Script (CI/CD Sederhana)

```bash
# Script untuk update aplikasi
sudo tee /home/deploy/deploy.sh <<'SCRIPT'
#!/bin/bash
set -euo pipefail

APP_DIR="/home/deploy/sekolah-app/app"
BACKUP_DIR="/home/deploy/backups"
DATE=$(date +%Y%m%d_%H%M%S)

echo "🚀 Starting deployment at $(date)..."

cd "$APP_DIR"

# 1. Backup database sebelum deploy
echo "📦 Creating pre-deploy backup..."
docker exec supabase-db pg_dump -U postgres -d postgres \
  --format=custom --compress=9 \
  > "$BACKUP_DIR/pre_deploy_${DATE}.dump"

# 2. Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# 3. Install dependencies
echo "📦 Installing dependencies..."
bun install

# 4. Run database migrations
echo "🗄️ Running migrations..."
for f in supabase/migrations/*.sql; do
  echo "  Migration: $(basename $f)"
  docker exec -i supabase-db psql -U postgres -d postgres < "$f" 2>/dev/null || true
done

# 5. Build frontend
echo "🔨 Building frontend..."
bun run build

# 6. Deploy edge functions
echo "⚡ Deploying edge functions..."
for func_dir in supabase/functions/*/; do
  func_name=$(basename "$func_dir")
  if [ -f "$func_dir/index.ts" ]; then
    echo "  Function: $func_name"
    # Deploy function logic here
  fi
done

# 7. Reload Nginx
echo "🔄 Reloading Nginx..."
sudo nginx -t && sudo systemctl reload nginx

echo "✅ Deployment complete at $(date)!"
echo "🌐 Site: https://domain-anda.com"
SCRIPT

chmod +x /home/deploy/deploy.sh
```

---

## 📋 Langkah 13: Logrotate

```bash
# Setup log rotation
sudo tee /etc/logrotate.d/sekolah-app <<'EOF'
/home/deploy/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 deploy deploy
}
EOF
```

---

## ✅ Checklist Final

```
Keamanan:
  [ ] SSH key-only, root login disabled
  [ ] UFW firewall aktif (22, 80, 443 only)
  [ ] Fail2ban aktif
  [ ] SSL certificate terpasang
  [ ] Security headers di Nginx
  [ ] Auto security updates aktif

Aplikasi:
  [ ] Supabase berjalan (docker compose ps)
  [ ] Frontend bisa diakses via HTTPS
  [ ] API endpoint berfungsi
  [ ] Auth (login/register) berfungsi
  [ ] Edge functions deployed
  [ ] Database migrasi lengkap

Operasional:
  [ ] Backup harian terjadwal
  [ ] Health check berjalan
  [ ] Log rotation aktif
  [ ] Monitoring aktif
  [ ] Deploy script siap

DNS:
  [ ] domain-anda.com → IP VPS (A record)
  [ ] www.domain-anda.com → IP VPS (CNAME/A)
  [ ] api.domain-anda.com → IP VPS (A record)
```

---

## 🔄 Perintah Operasional Harian

```bash
# Cek status semua service
docker compose -f ~/sekolah-app/supabase-docker/docker/docker-compose.yml ps

# Restart Supabase
docker compose -f ~/sekolah-app/supabase-docker/docker/docker-compose.yml restart

# Lihat log realtime
docker compose -f ~/sekolah-app/supabase-docker/docker/docker-compose.yml logs -f

# Manual backup
~/backup.sh

# Health check manual
~/healthcheck.sh

# Deploy update
~/deploy.sh

# Cek disk space
df -h

# Cek memory
free -h

# Cek proses
htop
```

---

## 📞 Troubleshooting

| Masalah | Solusi |
|---------|--------|
| 502 Bad Gateway | `docker compose restart` lalu cek `docker compose logs` |
| Database connection refused | `docker compose restart db` lalu tunggu 30 detik |
| SSL expired | `sudo certbot renew --force-renewal` |
| Disk penuh | `docker system prune -a` dan hapus backup lama |
| Memory tinggi | Kurangi `max_connections` di PostgreSQL config |
| Slow queries | Cek `docker exec supabase-db psql -U postgres -c "SELECT * FROM pg_stat_activity WHERE state='active'"` |
