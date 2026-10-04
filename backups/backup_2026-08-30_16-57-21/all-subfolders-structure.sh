#!/bin/bash
# all-subfolders-structure.sh - Save struktur per subfolder

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
MAIN_FILE="full_structure_${TIMESTAMP}.txt"

echo "========================================="
echo "📁 STRUKTUR PER SUBFOLDER"
echo "========================================="
echo ""

# Mulai capture
{
    echo "========================================="
    echo "FULL STRUCTURE - $(date)"
    echo "========================================="
    echo ""
    
    # Root structure
    echo "📁 ROOT DIRECTORY:"
    echo ""
    tree -L 1 -I "node_modules|.git" --dirsfirst
    echo ""
    
    # src folder
    if [[ -d "src" ]]; then
        echo "========================================="
        echo "📁 SRC FOLDER"
        echo "========================================="
        tree -L 2 src -I "*.backup*" --dirsfirst
        echo ""
        
        # Components subfolder
        if [[ -d "src/components" ]]; then
            echo "========================================="
            echo "📁 COMPONENTS SUBFOLDER"
            echo "========================================="
            tree -L 2 src/components -I "*.backup*" --dirsfirst
            echo ""
            
            # List semua komponen
            echo "📋 DAFTAR KOMPONEN (${#COMPONENTS[@]} file):"
            find src/components -maxdepth 1 -type f -name "*.tsx" -not -name "*.backup*" | sort | while read -r file; do
                echo "  📄 $(basename "$file")"
            done
            echo ""
        fi
        
        # Pages subfolder
        if [[ -d "src/pages" ]]; then
            echo "========================================="
            echo "📁 PAGES SUBFOLDER"
            echo "========================================="
            tree -L 2 src/pages -I "*.backup*" --dirsfirst
            echo ""
        fi
    fi
    
    # Supabase folder
    if [[ -d "supabase" ]]; then
        echo "========================================="
        echo "📁 SUPABASE FOLDER"
        echo "========================================="
        tree -L 2 supabase --dirsfirst
        echo ""
    fi
    
    echo "========================================="
    echo "✅ Selesai"
    
} 2>&1 | tee "$MAIN_FILE"

echo ""
echo "📄 File tersimpan: $MAIN_FILE"
echo "========================================="