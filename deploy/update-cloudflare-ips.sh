#!/usr/bin/env bash
# Pasang/perbarui daftar IP Cloudflare untuk nginx agar IP pengunjung asli terbaca (header CF-Connecting-IP).
# Tanpa ini, di belakang Cloudflare semua pengunjung terbaca sebagai IP Cloudflare sehingga batas laju
# (nginx limit_req dan rateLimit di bot) tidak bisa membedakan pengunjung.
# Jalankan sebagai root di server:  bash deploy/update-cloudflare-ips.sh
# Aman dijalankan ulang (mis. tiap bulan lewat cron). Bila nginx -t gagal, berkas lama dikembalikan.
set -euo pipefail

OUT=/etc/nginx/conf.d/cloudflare-realip.conf
BAK="${OUT}.bak"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

fetch() { curl -fsS --max-time 20 "https://www.cloudflare.com/$1"; }
V4="$(fetch ips-v4)"
V6="$(fetch ips-v6)"

{
  echo "# Dibuat oleh deploy/update-cloudflare-ips.sh pada $(date -u +%Y-%m-%dT%H:%M:%SZ). Jangan diedit manual."
  n=0
  while IFS= read -r ip; do
    ip="${ip//[[:space:]]/}"
    [ -z "$ip" ] && continue
    if [[ ! "$ip" =~ ^[0-9a-fA-F:.]+/[0-9]{1,3}$ ]]; then echo "Baris tidak valid dari Cloudflare: $ip" >&2; exit 1; fi
    echo "set_real_ip_from $ip;"
    n=$((n+1))
  done < <(printf '%s\n%s\n' "$V4" "$V6")
  [ "$n" -ge 10 ] || { echo "Daftar IP Cloudflare terlalu sedikit ($n); dibatalkan." >&2; exit 1; }
  echo "real_ip_header CF-Connecting-IP;"
  echo "real_ip_recursive off;"
} > "$TMP"

[ -f "$OUT" ] && cp -f "$OUT" "$BAK"
install -m 644 "$TMP" "$OUT"
if nginx -t; then
  systemctl reload nginx
  echo "OK: $(grep -c set_real_ip_from "$OUT") rentang IP Cloudflare dipasang di $OUT"
else
  if [ -f "$BAK" ]; then mv -f "$BAK" "$OUT"; else rm -f "$OUT"; fi
  echo "nginx -t gagal; perubahan dibatalkan." >&2
  exit 1
fi
