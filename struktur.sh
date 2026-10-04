#!/bin/bash
# Tentukan folder target (default: folder 
# saat ini)
TARGET_DIR="${1:-.}" 
OUTPUT_FILE="struktur_aplikasi.txt"
# Cek dan install utilitas 'tree' jika 
# belum ada di Debian
if ! command -v tree &> /dev/null; then 
    echo "Memasang package 'tree'..." sudo 
    apt update && sudo apt install -y tree
fi
# Tulis info header ke file output
{ echo 
    "==========================================" 
    echo " STRUKTUR APLIKASI: $(realpath 
    "$TARGET_DIR")" echo " Tanggal Dibuat : 
    $(date '+%Y-%m-%d %H:%M:%S')" echo 
    "==========================================" 
    echo ""
} > "$OUTPUT_FILE"
# Eksekusi tree (mengabaikan folder 
# log/cache bawaan yang terlalu besar)
tree -a -I 
'.git|node_modules|vendor|__pycache__|.next|storage' 
"$TARGET_DIR" >> "$OUTPUT_FILE" echo 
"Selesai! Hasil telah disimpan ke: 
$OUTPUT_FILE"
