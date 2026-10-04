#!/bin/bash

# ==========================================
# SCRIPT BACKUP OTOMATIS + CHANGELOG
# ==========================================
# Dibuat oleh: [Nama Anda]
# Tanggal: $(date)
# Deskripsi: Backup project dengan catatan log perubahan
# ==========================================

# Warna untuk output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Konfigurasi
BACKUP_DIR="backups"
PROJECT_DIR="."
CHANGELOG_FILE="CHANGELOG.md"
EXCLUDE_DIRS=("node_modules" ".git" "dist" ".next" "backups" ".cache" ".vite")
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_NAME="backup_${TIMESTAMP}"

# Buat folder backup jika belum ada
mkdir -p "$BACKUP_DIR"

# Fungsi untuk menampilkan banner
print_banner() {
    echo -e "${BLUE}"
    echo "=========================================="
    echo "   BACKUP PROJECT + CHANGELOG OTOMATIS   "
    echo "=========================================="
    echo -e "${NC}"
}

# Fungsi untuk menulis log
write_log() {
    echo -e "${1}[$(date +"%H:%M:%S")] $2${NC}"
}

# Fungsi untuk menampilkan daftar perubahan terakhir
show_last_changes() {
    echo -e "${YELLOW}"
    echo "=========================================="
    echo "        CATATAN PERUBAHAN TERAKHIR       "
    echo "=========================================="
    echo -e "${NC}"
    if [ -f "$CHANGELOG_FILE" ]; then
        tail -n 30 "$CHANGELOG_FILE"
    else
        echo "Belum ada file CHANGELOG.md"
    fi
}

# Fungsi untuk menambahkan perubahan ke CHANGELOG
add_changelog() {
    local message="$1"
    local timestamp=$(date +"%d-%m-%Y %H:%M")
    
    # Jika file belum ada, buat header
    if [ ! -f "$CHANGELOG_FILE" ]; then
        cat > "$CHANGELOG_FILE" <<EOF
# 📝 Changelog

Semua perubahan penting pada project ini akan dicatat di file ini.

Format: [Tanggal] - Deskripsi Perubahan

---
EOF
    fi

    # Tambahkan perubahan baru
    cat >> "$CHANGELOG_FILE" <<EOF

## ${timestamp}
- ${message}
EOF

    write_log "${GREEN}" "✅ Changelog ditambahkan: ${message}"
}

# Fungsi untuk membuat metadata backup
create_metadata() {
    local file_count=$(find "$PROJECT_DIR" -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' | wc -l)
    local dir_count=$(find "$PROJECT_DIR" -type d -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' | wc -l)
    
    cat > "$BACKUP_DIR/$BACKUP_NAME/backup-info.json" <<EOF
{
    "timestamp": "$(date -Iseconds)",
    "project": "$(basename "$PROJECT_DIR")",
    "files_count": $file_count,
    "directories_count": $dir_count,
    "changelog": "$(tail -n 1 "$CHANGELOG_FILE" 2>/dev/null | sed 's/^## //')",
    "backup_version": "1.0.0"
}
EOF
}

# Fungsi untuk melakukan backup
perform_backup() {
    write_log "${YELLOW}" "📦 Memulai proses backup..."
    
    # Buat folder backup spesifik
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME"
    
    # Copy file dengan rsync (atau cp -r jika rsync tidak ada)
    write_log "${BLUE}" "📂 Menyalin file project..."
    
    # Gunakan rsync jika tersedia, jika tidak pakai cp
    if command -v rsync &> /dev/null; then
        rsync -av --progress \
            --exclude 'node_modules' \
            --exclude '.git' \
            --exclude 'dist' \
            --exclude 'backups' \
            --exclude '.next' \
            --exclude '.cache' \
            --exclude '.vite' \
            "$PROJECT_DIR/" "$BACKUP_DIR/$BACKUP_NAME/"
    else
        # Fallback ke cp dengan rsync-like exclude
        cp -r "$PROJECT_DIR"/* "$BACKUP_DIR/$BACKUP_NAME/" 2>/dev/null
        # Hapus folder yang dikecualikan
        rm -rf "$BACKUP_DIR/$BACKUP_NAME/node_modules" \
               "$BACKUP_DIR/$BACKUP_NAME/.git" \
               "$BACKUP_DIR/$BACKUP_NAME/dist" \
               "$BACKUP_DIR/$BACKUP_NAME/backups" \
               "$BACKUP_DIR/$BACKUP_NAME/.next" \
               "$BACKUP_DIR/$BACKUP_NAME/.cache" \
               "$BACKUP_DIR/$BACKUP_NAME/.vite" 2>/dev/null
    fi
    
    # Copy CHANGELOG ke dalam backup
    if [ -f "$CHANGELOG_FILE" ]; then
        cp "$CHANGELOG_FILE" "$BACKUP_DIR/$BACKUP_NAME/"
    fi
    
    # Buat metadata
    create_metadata
    
    write_log "${GREEN}" "✅ Backup selesai!"
}

# Fungsi untuk menghapus backup lama (retensi 10 backup terakhir)
cleanup_old_backups() {
    write_log "${YELLOW}" "🧹 Membersihkan backup lama (menyimpan 10 terakhir)..."
    cd "$BACKUP_DIR" || exit
    
    # List semua folder backup, sort descending, ambil yang lebih dari 10
    ls -dt backup_* 2>/dev/null | tail -n +11 | while read -r old_backup; do
        rm -rf "$old_backup"
        write_log "${RED}" "🗑️  Menghapus backup lama: $old_backup"
    done
    
    cd ..
}

# Fungsi utama
main() {
    print_banner
    
    # Tampilkan perubahan terakhir
    show_last_changes
    
    echo ""
    
    # Input perubahan dari user
    echo -e "${YELLOW}Masukkan catatan perubahan (changelog) untuk backup ini:${NC}"
    read -p "> " changelog_message
    
    # Jika kosong, beri default
    if [ -z "$changelog_message" ]; then
        changelog_message="Backup otomatis tanpa catatan spesifik"
    fi
    
    # Tambahkan ke CHANGELOG
    add_changelog "$changelog_message"
    
    # Lakukan backup
    perform_backup
    
    # Bersihkan backup lama
    cleanup_old_backups
    
    echo ""
    write_log "${GREEN}" "=========================================="
    write_log "${GREEN}" "🎉 BACKUP BERHASIL!"
    write_log "${GREEN}" "📍 Lokasi: $BACKUP_DIR/$BACKUP_NAME/"
    write_log "${GREEN}" "📝 Changelog: $CHANGELOG_FILE"
    write_log "${GREEN}" "=========================================="
}

# Jalankan script
main