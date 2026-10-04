import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to verify authenticated user with bendahara or admin role
async function verifyBendaharaOrAdminAuth(req: Request): Promise<{ user: any; error: string | null }> {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { user: null, error: 'No authorization header provided' };
  }

  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
  
  if (error || !user) {
    return { user: null, error: 'Invalid or expired token' };
  }

  const { data: roleData } = await supabaseClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!roleData || !['admin', 'bendahara', 'tata_usaha'].includes(roleData.role)) {
    return { user: null, error: 'Admin, Bendahara, or Tata Usaha access required' };
  }

  return { user, error: null };
}

function parseIndonesianCurrency(value: string): number {
  if (!value) return 0;
  const cleaned = value.toString()
    .replace(/[Rp\s]/gi, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const ddmmyyyy = dateStr.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

function getCategoryFromKodeKegiatan(kode: string): string {
  if (!kode) return 'Lainnya';
  if (kode.startsWith('03.')) return 'Honorarium';
  if (kode.startsWith('04.')) return 'Perjalanan Dinas';
  if (kode.startsWith('05.')) return 'Pemeliharaan/Barang';
  if (kode.startsWith('06.')) return 'Langganan/Utilitas';
  if (kode.startsWith('07.')) return 'Honor/Transport';
  return 'Lainnya';
}

interface BKUTransaction {
  tanggal: string | null;
  kode_kegiatan: string | null;
  kode_rekening: string | null;
  no_bukti: string | null;
  uraian: string;
  penerimaan: number;
  pengeluaran: number;
  saldo: number;
  jenis_transaksi: 'penerimaan' | 'pengeluaran' | 'pajak' | 'transfer' | 'saldo_awal';
}

interface BKUSummary {
  total_penerimaan: number;
  total_pengeluaran: number;
  total_pajak: number;
  total_belanja: number; // pengeluaran tanpa pajak
  saldo_akhir: number;
  jumlah_transaksi: number;
}

interface ParsedItem {
  kode_kegiatan: string | null;
  kode_rekening: string | null;
  activity_name: string;
  category: string;
  amount: number;
  penerimaan: number;
  pengeluaran: number;
  saldo: number;
  transaction_date: string | null;
  description: string | null;
  jenis_transaksi: string;
}

// Parse table row format: | col1 | col2 | col3 |...
function parseTableRow(line: string): string[] {
  if (!line.includes('|')) return [];
  return line.split('|').map(cell => cell.trim()).filter((cell, idx, arr) => {
    // Keep all cells including empty ones in the middle
    return true;
  });
}

function isHeaderOrSeparator(line: string): boolean {
  const lower = line.toLowerCase();
  
  // Skip table headers - lines that are column headers
  // Pattern: | TANGGAL | KODE | KODE | NO. | URAIAN | PENERIMAAN | PENGELUARAN | SALDO |
  const isColumnHeader = 
    (lower.includes('tanggal') && (lower.includes('kode') || lower.includes('uraian'))) ||
    (lower.includes('penerimaan') && lower.includes('pengeluaran') && lower.includes('saldo')) ||
    (lower.includes('no.') && lower.includes('uraian') && lower.includes('bukti'));
  
  // Skip header info lines
  const isHeaderInfo = 
    line.includes('---') ||
    (lower.includes('halaman') && lower.includes('dari')) ||
    lower.includes('bku januari') ||
    lower.includes('bku februari') ||
    lower.includes('bku maret') ||
    lower.includes('bku april') ||
    lower.includes('bku mei') ||
    lower.includes('bku juni') ||
    lower.includes('bku juli') ||
    lower.includes('bku agustus') ||
    lower.includes('bku september') ||
    lower.includes('bku oktober') ||
    lower.includes('bku november') ||
    lower.includes('bku desember') ||
    lower.includes('npsn:') ||
    lower.includes('npsn |') ||
    lower.includes('nama sekolah') ||
    lower.includes('b u k u') ||
    lower.includes('k a s') ||
    lower.includes('u m u m') ||
    lower.includes('bulan :');
  
  // Skip single word column headers that might appear on their own
  const isSingleColumnHeader = 
    /^\s*\|\s*(pengeluaran|penerimaan|saldo|tanggal|kode|uraian|kegiatan|rekening)\s*\|\s*$/i.test(line);
  
  return isColumnHeader || isHeaderInfo || isSingleColumnHeader;
}

function extractKodeKegiatan(text: string): string | null {
  // Format: XX.XX.XX. (e.g., 07.12.01., 03.03.07.)
  const match = text.match(/\b(\d{2}\.\d{2}\.\d{2}\.?)\b/);
  if (match && !match[1].startsWith('5.')) {
    return match[1].replace(/\.$/, '');
  }
  return null;
}

function extractKodeRekening(text: string): string | null {
  // Format lengkap BKU: 5.1.02.04.01.0001 atau 5.1.02.02.01.0013
  // Juga support format pendek yang mungkin wrap ke baris berikutnya
  
  // Cek format lengkap 5.1.XX.XX.XX.XXXX (4 digit suffix)
  const fullMatch = text.match(/(5\.\d\.\d{2}\.\d{2}\.\d{2}\.\d{4})/);
  if (fullMatch) return fullMatch[1];
  
  // Cek format dengan 2 digit suffix: 5.1.XX.XX.XX.XX
  const partial2Match = text.match(/(5\.\d\.\d{2}\.\d{2}\.\d{2}\.\d{2})(?!\d)/);
  if (partial2Match) return partial2Match[1];
  
  // Cek format tanpa suffix: 5.1.XX.XX.XX
  const partialMatch = text.match(/(5\.\d\.\d{2}\.\d{2}\.\d{2})(?!\.\d)/);
  if (partialMatch) return partialMatch[1];
  
  return null;
}

// Fungsi untuk mencari kode rekening lengkap di sekitar baris transaksi
// Mendukung wrap text dimana kode rekening terpecah jadi 2 baris
// Juga mendukung transaksi di akhir halaman dengan mencari di baris sebelumnya
function findCompleteKodeRekening(lines: string[], currentIndex: number, currentLine: string): string | null {
  console.log(`Searching kode_rekening in line ${currentIndex}: ${currentLine.substring(0, 150)}`);
  
  // Parse cells dari baris saat ini
  const cells = currentLine.split('|').map(c => c.trim()).filter(c => c.length > 0);
  
  // Helper function untuk cek apakah baris adalah page break atau header halaman baru
  const isPageBreakOrNewPageHeader = (line: string): boolean => {
    const lower = line.toLowerCase();
    return line.includes('--- Page Break ---') ||
           (lower.includes('halaman') && lower.includes('dari')) ||
           lower.includes('npsn:') ||
           lower.includes('npsn |') ||
           lower.includes('nama sekolah') ||
           lower.includes('b u k u') ||
           lower.includes('k a s') ||
           lower.includes('u m u m');
  };
  
  // Helper function untuk extract kode rekening dari sebuah baris
  const extractFromLine = (line: string): string | null => {
    // Format lengkap 5.1.XX.XX.XX.XXXX
    const fullMatch = line.match(/(5\.\d\.\d{2}\.\d{2}\.\d{2}\.\d{4})/);
    if (fullMatch) return fullMatch[1];
    return null;
  };
  
  // ============ STEP 1: Cari format lengkap 5.1.XX.XX.XX.XXXX di baris saat ini ============
  for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
    const cell = cells[cellIdx];
    const fullMatch = cell.match(/(5\.\d\.\d{2}\.\d{2}\.\d{2}\.\d{4})/);
    if (fullMatch) {
      console.log(`Found complete kode_rekening in cell ${cellIdx}: ${fullMatch[1]}`);
      return fullMatch[1];
    }
  }
  
  // ============ STEP 2: Cari format 5.1.XX.XX.XX.XX dan gabung dengan suffix ============
  for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
    const cell = cells[cellIdx];
    
    // Pattern: 5.1.XX.XX.XX.XX (6 bagian dengan suffix 2 digit)
    const partialWithSuffix = cell.match(/(5\.\d\.\d{2}\.\d{2}\.\d{2}\.\d{2})$/);
    if (partialWithSuffix) {
      const baseWithPartialSuffix = partialWithSuffix[1];
      console.log(`Found kode with partial suffix in cell ${cellIdx}: ${baseWithPartialSuffix}`);
      
      // Cari 2 digit tambahan di cell berikutnya dalam baris yang sama
      for (let nextIdx = cellIdx + 1; nextIdx < cells.length; nextIdx++) {
        const nextCell = cells[nextIdx].trim();
        if (/^\d{2}$/.test(nextCell)) {
          const baseParts = baseWithPartialSuffix.split('.');
          const firstSuffix = baseParts[baseParts.length - 1];
          const baseKode = baseParts.slice(0, -1).join('.');
          const completeKode = `${baseKode}.${firstSuffix}${nextCell}`;
          console.log(`Combined suffix in same line: ${completeKode}`);
          return completeKode;
        }
      }
      
      // Cari 2 digit tambahan di baris berikutnya (wrap text) - skip jika page break
      for (let lineOffset = 1; lineOffset <= 3; lineOffset++) {
        const nextLineIdx = currentIndex + lineOffset;
        if (nextLineIdx >= lines.length) break;
        
        const nextLine = lines[nextLineIdx].trim();
        // Stop jika ketemu page break atau header baru
        if (isPageBreakOrNewPageHeader(nextLine)) break;
        if (isHeaderOrSeparator(nextLine)) continue;
        
        const nextCells = nextLine.split('|').map(c => c.trim()).filter(c => c.length > 0);
        
        for (const nextCell of nextCells) {
          if (/^\d{2}$/.test(nextCell)) {
            const baseParts = baseWithPartialSuffix.split('.');
            const firstSuffix = baseParts[baseParts.length - 1];
            const baseKode = baseParts.slice(0, -1).join('.');
            const completeKode = `${baseKode}.${firstSuffix}${nextCell}`;
            console.log(`Combined with 2-digit suffix from next line ${nextLineIdx}: ${completeKode}`);
            return completeKode;
          }
        }
      }
      
      // Jika tidak ada suffix tambahan, return as-is dengan padding
      const baseParts = baseWithPartialSuffix.split('.');
      const firstSuffix = baseParts[baseParts.length - 1];
      const baseKode = baseParts.slice(0, -1).join('.');
      const paddedKode = `${baseKode}.${firstSuffix}00`;
      console.log(`No additional suffix found, padded: ${paddedKode}`);
      return paddedKode;
    }
  }
  
  // ============ STEP 3: Cari format 5.1.XX.XX.XX (tanpa suffix) ============
  for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
    const cell = cells[cellIdx];
    
    const partialMatch = cell.match(/(5\.\d\.\d{2}\.\d{2}\.\d{2})(?:\.)?$/);
    if (partialMatch && !cell.match(/5\.\d\.\d{2}\.\d{2}\.\d{2}\.\d+/)) {
      const baseKode = partialMatch[1];
      console.log(`Found base kode without suffix in cell ${cellIdx}: ${baseKode}`);
      
      // Cari 4 digit suffix di cell berikutnya
      for (let nextIdx = cellIdx + 1; nextIdx < cells.length; nextIdx++) {
        const nextCell = cells[nextIdx].trim();
        if (/^\d{4}$/.test(nextCell)) {
          const completeKode = `${baseKode}.${nextCell}`;
          console.log(`Combined with 4-digit suffix: ${completeKode}`);
          return completeKode;
        }
      }
      
      // Cari di baris berikutnya (jika bukan page break)
      for (let lineOffset = 1; lineOffset <= 3; lineOffset++) {
        const nextLineIdx = currentIndex + lineOffset;
        if (nextLineIdx >= lines.length) break;
        
        const nextLine = lines[nextLineIdx].trim();
        if (isPageBreakOrNewPageHeader(nextLine)) break;
        if (isHeaderOrSeparator(nextLine)) continue;
        
        const nextCells = nextLine.split('|').map(c => c.trim()).filter(c => c.length > 0);
        
        for (const nextCell of nextCells) {
          if (/^\d{4}$/.test(nextCell)) {
            const completeKode = `${baseKode}.${nextCell}`;
            console.log(`Combined with 4-digit suffix from next line: ${completeKode}`);
            return completeKode;
          }
        }
      }
    }
  }
  
  // ============ STEP 4: Cari kode_rekening di baris SETELAH transaksi (BUKAN hanya setelah page header) ============
  // Pattern: Transaction line -> kode_rekening di baris berikutnya (wrap text atau continuation)
  // Termasuk pattern split: 5.1.XX.XX.XX.00 + 31 = 5.1.XX.XX.XX.0031
  {
    console.log(`Looking for kode_rekening in NEXT lines (STEP 4)`);
    
    for (let offset = 1; offset <= 5; offset++) {
      const nextIdx = currentIndex + offset;
      if (nextIdx >= lines.length) break;
      
      const nextLine = lines[nextIdx].trim();
      if (!nextLine) continue;
      
      // Stop jika ketemu transaksi baru (punya tanggal dan no_bukti)
      const hasDate = /\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/.test(nextLine);
      const hasBukti = /\bB[NPKBU]{1,2}U?\d{1,3}\b/i.test(nextLine);
      if (hasDate && hasBukti) {
        console.log(`Stopping at line ${nextIdx} - new transaction found`);
        break;
      }
      
      // Skip page header row tetapi tetap lanjut mencari
      if (/\|\s*1\s*\|\s*2\s*\|\s*3\s*\|\s*4\s*\|\s*5\s*\|/.test(nextLine)) {
        console.log(`Skipping page header at line ${nextIdx}, continuing search`);
        continue;
      }
      
      // Skip header lines
      if (isHeaderOrSeparator(nextLine)) continue;
      
      console.log(`Checking next line ${nextIdx}: ${nextLine.substring(0, 80)}...`);
      
      // PRIORITY 1: Cari format lengkap 5.1.XX.XX.XX.XXXX di baris berikutnya
      const fullMatch = nextLine.match(/(5\.\d\.\d{2}\.\d{2}\.\d{2}\.\d{4})/);
      if (fullMatch) {
        console.log(`Found complete kode_rekening in next line ${nextIdx}: ${fullMatch[1]}`);
        return fullMatch[1];
      }
      
      // PRIORITY 2: Cari split pattern 5.1.XX.XX.XX.XX + YY dalam cells
      const nextCells = nextLine.split('|').map(c => c.trim()).filter(c => c.length > 0);
      for (let cellIdx = 0; cellIdx < nextCells.length; cellIdx++) {
        const cell = nextCells[cellIdx];
        
        // Pattern: 5.1.02.02.01.00 (dengan 2 digit terakhir yang akan disambung)
        const partialMatch = cell.match(/(5\.\d\.\d{2}\.\d{2}\.\d{2}\.\d{2})$/);
        if (partialMatch) {
          console.log(`Found partial kode in next line cell ${cellIdx}: ${partialMatch[1]}`);
          
          // Cari 2-digit suffix di cell berikutnya
          for (let nextCellIdx = cellIdx + 1; nextCellIdx < nextCells.length; nextCellIdx++) {
            const suffixCell = nextCells[nextCellIdx];
            if (/^\d{2}$/.test(suffixCell)) {
              const baseParts = partialMatch[1].split('.');
              const firstSuffix = baseParts[baseParts.length - 1];
              const baseKode = baseParts.slice(0, -1).join('.');
              const completeKode = `${baseKode}.${firstSuffix}${suffixCell}`;
              console.log(`Combined split kode from next line: ${completeKode}`);
              return completeKode;
            }
          }
          
          // Cari 2-digit suffix di baris berikutnya lagi
          for (let suffixOffset = 1; suffixOffset <= 2; suffixOffset++) {
            const suffixLineIdx = nextIdx + suffixOffset;
            if (suffixLineIdx >= lines.length) break;
            
            const suffixLine = lines[suffixLineIdx].trim();
            if (!suffixLine || hasDate) break;
            if (isHeaderOrSeparator(suffixLine)) continue;
            
            const suffixCells = suffixLine.split('|').map(c => c.trim()).filter(c => c.length > 0);
            for (const sc of suffixCells) {
              if (/^\d{2}$/.test(sc)) {
                const baseParts = partialMatch[1].split('.');
                const firstSuffix = baseParts[baseParts.length - 1];
                const baseKode = baseParts.slice(0, -1).join('.');
                const completeKode = `${baseKode}.${firstSuffix}${sc}`;
                console.log(`Combined split kode with suffix from line ${suffixLineIdx}: ${completeKode}`);
                return completeKode;
              }
            }
          }
        }
        
        // Pattern: 5.1.02.02.01 (tanpa suffix sama sekali)
        const baseMatch = cell.match(/(5\.\d\.\d{2}\.\d{2}\.\d{2})(?:\.)?$/);
        if (baseMatch && !cell.match(/5\.\d\.\d{2}\.\d{2}\.\d{2}\.\d+/)) {
          console.log(`Found base kode in next line cell ${cellIdx}: ${baseMatch[1]}`);
          
          // Cari 4-digit suffix di cell berikutnya
          for (let nextCellIdx = cellIdx + 1; nextCellIdx < nextCells.length; nextCellIdx++) {
            const suffixCell = nextCells[nextCellIdx];
            if (/^\d{4}$/.test(suffixCell)) {
              const completeKode = `${baseMatch[1]}.${suffixCell}`;
              console.log(`Combined base with 4-digit suffix: ${completeKode}`);
              return completeKode;
            }
          }
        }
      }
    }
  }
  
  // ============ STEP 5: Cari kode_rekening di baris SEBELUM transaksi ============
  // Kadang kode_rekening muncul di baris sebelum transaksi karena wrap text dari transaksi sebelumnya
  // atau continuation dari halaman sebelumnya
  {
    console.log(`Looking for kode_rekening in previous lines (STEP 5)`);
    
    for (let offset = 1; offset <= 5; offset++) {
      const prevIdx = currentIndex - offset;
      if (prevIdx < 0) break;
      
      const prevLine = lines[prevIdx].trim();
      if (!prevLine) continue;
      
      // Skip jika baris sebelumnya adalah transaksi lengkap (punya tanggal dan no_bukti)
      const hasDate = /\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/.test(prevLine);
      const hasBukti = /\bB[NPKBU]{1,2}U?\d{1,3}\b/i.test(prevLine);
      if (hasDate && hasBukti) break; // Stop, ini adalah transaksi berbeda
      
      // Skip header
      if (isHeaderOrSeparator(prevLine)) continue;
      
      // Cari kode_rekening lengkap di baris sebelumnya
      const prevKodeRekening = extractFromLine(prevLine);
      if (prevKodeRekening) {
        console.log(`Found kode_rekening in previous line ${prevIdx}: ${prevKodeRekening}`);
        return prevKodeRekening;
      }
      
      // Cari pattern split: 5.1.XX.XX.XX.XX di baris sebelumnya + suffix di cell
      const prevCells = prevLine.split('|').map(c => c.trim()).filter(c => c.length > 0);
      for (let cellIdx = 0; cellIdx < prevCells.length; cellIdx++) {
        const cell = prevCells[cellIdx];
        const partialMatch = cell.match(/(5\.\d\.\d{2}\.\d{2}\.\d{2}\.\d{2})$/);
        if (partialMatch) {
          // Cari 2-digit suffix di cell berikutnya
          for (let nextCellIdx = cellIdx + 1; nextCellIdx < prevCells.length; nextCellIdx++) {
            if (/^\d{2}$/.test(prevCells[nextCellIdx])) {
              const baseParts = partialMatch[1].split('.');
              const firstSuffix = baseParts[baseParts.length - 1];
              const baseKode = baseParts.slice(0, -1).join('.');
              const completeKode = `${baseKode}.${firstSuffix}${prevCells[nextCellIdx]}`;
              console.log(`Found split kode_rekening in previous line ${prevIdx}: ${completeKode}`);
              return completeKode;
            }
          }
        }
      }
    }
  }
  
  // ============ STEP 6: Cari dari transaksi sebelumnya dengan kode_kegiatan sama ============
  const currentKodeKegiatan = extractKodeKegiatan(currentLine);
  if (currentKodeKegiatan) {
    console.log(`Looking for previous transaction with same kode_kegiatan: ${currentKodeKegiatan}`);
    
    for (let offset = 1; offset <= 50; offset++) {
      const prevIdx = currentIndex - offset;
      if (prevIdx < 0) break;
      
      const prevLine = lines[prevIdx].trim();
      if (!prevLine || !prevLine.includes('|')) continue;
      if (isHeaderOrSeparator(prevLine)) continue;
      
      const prevKodeKegiatan = extractKodeKegiatan(prevLine);
      if (prevKodeKegiatan === currentKodeKegiatan) {
        const prevKodeRekening = extractFromLine(prevLine);
        if (prevKodeRekening) {
          console.log(`Found kode_rekening from previous transaction with same kode_kegiatan at line ${prevIdx}: ${prevKodeRekening}`);
          return prevKodeRekening;
        }
        
        for (let nearOffset = 1; nearOffset <= 3; nearOffset++) {
          const nearIdx = prevIdx + nearOffset;
          if (nearIdx >= currentIndex) break;
          
          const nearLine = lines[nearIdx].trim();
          if (isPageBreakOrNewPageHeader(nearLine)) break;
          
          const nearKodeRekening = extractFromLine(nearLine);
          if (nearKodeRekening) {
            console.log(`Found kode_rekening near previous transaction at line ${nearIdx}: ${nearKodeRekening}`);
            return nearKodeRekening;
          }
        }
      }
    }
  }
  
  // ============ STEP 7: Gabungkan baris dengan baris sekitar ============
  let combinedText = currentLine;
  for (let offset = 1; offset <= 3; offset++) {
    if (currentIndex + offset < lines.length) {
      const nextLine = lines[currentIndex + offset].trim();
      if (isPageBreakOrNewPageHeader(nextLine)) break;
      combinedText += ' ' + nextLine;
    }
  }
  
  const combinedFullMatch = combinedText.match(/(5\.\d\.\d{2}\.\d{2}\.\d{2}\.\d{4})/);
  if (combinedFullMatch) {
    console.log(`Found complete kode in combined text: ${combinedFullMatch[1]}`);
    return combinedFullMatch[1];
  }
  
  const splitPattern = combinedText.match(/(5\.\d\.\d{2}\.\d{2}\.\d{2})\.(\d{2})[^\d]+(\d{2})/);
  if (splitPattern) {
    const completeKode = `${splitPattern[1]}.${splitPattern[2]}${splitPattern[3]}`;
    console.log(`Found split kode in combined text: ${completeKode}`);
    return completeKode;
  }
  
  console.log(`No kode_rekening found for line ${currentIndex}`);
  return null;
}

function extractNoBukti(text: string): string | null {
  // Format: BNUxx, BPUxx, BBUxx
  const match = text.match(/\b(B[NPKBU]{1,2}U?\d{1,3})\b/i);
  return match ? match[1].toUpperCase() : null;
}

function determineTransactionType(uraian: string, penerimaan: number, pengeluaran: number): 'penerimaan' | 'pengeluaran' | 'pajak' | 'transfer' | 'saldo_awal' {
  const lower = uraian.toLowerCase();
  
  // Saldo awal
  if (lower.includes('saldo') && (lower.includes('bulan') || lower.includes('awal') || lower.includes('bank') || lower.includes('tunai'))) {
    return 'saldo_awal';
  }
  
  // Pajak - "Setor" pajak/PPh/PPN
  if (lower.includes('setor') && (lower.includes('pph') || lower.includes('ppn') || lower.includes('sspd') || lower.includes('pajak'))) {
    return 'pajak';
  }
  
  // Transfer internal - skip these completely
  if (lower.includes('tarik tunai') || lower.includes('pergeseran uang')) {
    return 'transfer';
  }
  
  // Bunga bank dan pajak bunga - skip
  if (lower.includes('bunga bank') || lower.includes('pajak bunga')) {
    return 'transfer';
  }
  
  // Penerimaan - terima dana, terima pajak (untuk dikembalikan), dll
  if ((lower.includes('terima') && (lower.includes('dana') || lower.includes('bosp') || lower.includes('bos'))) ||
      lower.includes('pencairan')) {
    return 'penerimaan';
  }
  
  // Terima pajak (sementara sebelum setor) - skip, bukan penerimaan nyata
  if (lower.includes('terima') && (lower.includes('pph') || lower.includes('ppn') || lower.includes('sspd'))) {
    return 'transfer'; // treat as internal transfer, not real income
  }
  
  // Based on amounts
  if (penerimaan > 0 && pengeluaran === 0) return 'penerimaan';
  if (pengeluaran > 0) return 'pengeluaran';
  
  return 'pengeluaran';
}

function parseBKUText(pdfText: string): { items: ParsedItem[], summary: BKUSummary } {
  const items: ParsedItem[] = [];
  const lines = pdfText.split('\n');
  
  let totalPenerimaan = 0;
  let totalPengeluaran = 0;
  let saldoAkhir = 0;
  let lastValidSaldo = 0;
  let foundJumlahLine = false;
  
  console.log(`Processing ${lines.length} lines...`);
  console.log(`First 5 lines sample:`, lines.slice(0, 5));
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and page breaks
    if (!line || line.length < 3 || line.includes('--- Page Break ---')) continue;
    
    // Skip header/separator lines
    if (isHeaderOrSeparator(line)) continue;
    
    // Check for "Jumlah" totals line - extract final totals
    // Look for pattern: | ... | Jumlah | ... | 313.911.455 | 72.516.465 | 241.394.990 |
    if (line.toLowerCase().includes('jumlah') && !line.toLowerCase().includes('jumlah :')) {
      const cells = line.split('|').map(c => c.trim());
      console.log(`Found Jumlah line: ${line}`);
      console.log(`Cells: ${JSON.stringify(cells)}`);
      
      // Extract all numeric values
      const numericValues: number[] = [];
      for (const cell of cells) {
        const cleaned = cell.replace(/[.,\s]/g, '');
        if (/^\d{6,}$/.test(cleaned)) { // At least 6 digits for significant amounts
          numericValues.push(parseIndonesianCurrency(cell));
        }
      }
      
      console.log(`Numeric values found: ${JSON.stringify(numericValues)}`);
      
      // Last 3 values should be: penerimaan, pengeluaran, saldo
      if (numericValues.length >= 3) {
        totalPenerimaan = numericValues[numericValues.length - 3];
        totalPengeluaran = numericValues[numericValues.length - 2];
        saldoAkhir = numericValues[numericValues.length - 1];
        foundJumlahLine = true;
        console.log(`Extracted from Jumlah - Penerimaan: ${totalPenerimaan}, Pengeluaran: ${totalPengeluaran}, Saldo: ${saldoAkhir}`);
      }
      continue;
    }
    
    // Check for "Saldo Buku Kas Umum" line
    if (line.toLowerCase().includes('saldo buku kas umum') && line.includes('Rp')) {
      const match = line.match(/Rp\.?\s*([\d.,]+)/);
      if (match) {
        const extractedSaldo = parseIndonesianCurrency(match[1]);
        if (extractedSaldo > 0) {
          saldoAkhir = extractedSaldo;
          console.log(`Extracted Saldo Akhir from closing: ${saldoAkhir}`);
        }
      }
      continue;
    }
    
    // Parse table rows
    if (!line.includes('|')) continue;
    
    const cells = line.split('|').map(c => c.trim());
    if (cells.length < 4) continue;
    
    let tanggal: string | null = null;
    let kode_kegiatan: string | null = null;
    let kode_rekening: string | null = null;
    let no_bukti: string | null = null;
    let uraian = '';
    let penerimaan = 0;
    let pengeluaran = 0;
    let saldo = 0;
    
    // Extract date from cells
    for (const cell of cells) {
      const dateMatch = cell.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/);
      if (dateMatch) {
        tanggal = parseDate(dateMatch[1]);
        break;
      }
    }
    
    // Extract from all cells
    const fullLine = cells.join(' ');
    kode_kegiatan = extractKodeKegiatan(fullLine);
    no_bukti = extractNoBukti(fullLine);
    
    // Gunakan fungsi untuk mencari kode rekening lengkap di sekitar baris transaksi
    kode_rekening = findCompleteKodeRekening(lines, i, line);
    
    if (kode_rekening) {
      console.log(`Found kode_rekening: ${kode_rekening} for line: ${line.substring(0, 50)}`);
    }
    
    // Find numeric values from end of cells
    const numericCells: number[] = [];
    for (let j = cells.length - 1; j >= 0; j--) {
      const cell = cells[j];
      const cleaned = cell.replace(/[.,\s]/g, '');
      if (/^\d+$/.test(cleaned) && cleaned.length >= 1) {
        numericCells.unshift(parseIndonesianCurrency(cell));
        if (numericCells.length >= 4) break;
      } else if (numericCells.length > 0 && cell.length > 0 && !/^\d/.test(cell)) {
        break;
      }
    }
    
    // Assign amounts based on count
    if (numericCells.length >= 3) {
      penerimaan = numericCells[numericCells.length - 3];
      pengeluaran = numericCells[numericCells.length - 2];
      saldo = numericCells[numericCells.length - 1];
    } else if (numericCells.length === 2) {
      saldo = numericCells[1];
      const tentativeUraian = cells.join(' ').toLowerCase();
      if (tentativeUraian.includes('terima') && (tentativeUraian.includes('dana') || tentativeUraian.includes('bos'))) {
        penerimaan = numericCells[0];
      } else {
        pengeluaran = numericCells[0];
      }
    }
    
    // Track last valid saldo
    if (saldo > 0) {
      lastValidSaldo = saldo;
    }
    
    // Extract uraian (description) - cells that are not dates, codes, or numbers
    const uraianCells: string[] = [];
    for (const cell of cells) {
      if (!cell || cell === '-') continue;
      const isDate = /\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/.test(cell);
      const isKodeKegiatan = /^\d{2}\.\d{2}\.\d{2}\.?$/.test(cell);
      const isKodeRekening = /^5\.\d\.\d{2}/.test(cell);
      const isNoBukti = /^B[NPKBU]{1,2}U?\d{1,3}$/i.test(cell);
      const isNumber = /^[\d.,]+$/.test(cell.replace(/\s/g, ''));
      const isPageInfo = cell.toLowerCase().includes('halaman');
      
      if (!isDate && !isKodeKegiatan && !isKodeRekening && !isNoBukti && !isNumber && !isPageInfo) {
        // Also extract no_bukti from uraian like "BPU25 Aqua Galon"
        const extractedNoBukti = extractNoBukti(cell);
        if (extractedNoBukti && !no_bukti) {
          no_bukti = extractedNoBukti;
        }
        // Remove no_bukti from uraian
        const cleanedCell = cell.replace(/\bB[NPKBU]{1,2}U?\d{1,3}\b/gi, '').trim();
        if (cleanedCell) {
          uraianCells.push(cleanedCell);
        }
      }
    }
    uraian = uraianCells.join(' ').trim();
    
    // Skip if no meaningful data
    if (penerimaan === 0 && pengeluaran === 0 && saldo === 0) continue;
    
    // Determine transaction type
    const jenis_transaksi = determineTransactionType(uraian, penerimaan, pengeluaran);
    
    // Skip saldo awal dan transfer
    if (jenis_transaksi === 'saldo_awal' || jenis_transaksi === 'transfer') {
      continue;
    }
    
    // Abaikan transaksi pajak untuk sementara
    if (jenis_transaksi === 'pajak') {
      console.log('Skipping pajak transaction:', { uraian: uraian.substring(0, 30), pengeluaran });
      continue;
    }
    
    // HANYA hitung transaksi yang memiliki kode_kegiatan DAN no_bukti (nomor BKU)
    // kode_rekening opsional karena di BKU Indonesia biasanya tidak ada di setiap baris
    const hasKodeKegiatan = kode_kegiatan && kode_kegiatan.trim() !== '';
    const hasNoBukti = no_bukti && no_bukti.trim() !== '';
    
    if (!hasKodeKegiatan || !hasNoBukti) {
      console.log('Skipping transaction without kode_kegiatan or no_bukti:', {
        kode_kegiatan: kode_kegiatan || 'MISSING',
        no_bukti: no_bukti || 'MISSING',
        uraian: uraian.substring(0, 30),
        pengeluaran
      });
      continue;
    }
    
    console.log('Including transaction:', {
      kode_kegiatan,
      kode_rekening: kode_rekening || 'N/A',
      no_bukti,
      uraian: uraian.substring(0, 30),
      pengeluaran
    });
    
    // Determine category - pada titik ini jenis_transaksi hanya 'penerimaan' atau 'pengeluaran'
    // karena pajak, saldo_awal, dan transfer sudah diskip sebelumnya
    let category = 'Lainnya';
    if (jenis_transaksi === 'penerimaan') {
      category = 'Penerimaan';
    } else if (kode_kegiatan) {
      category = getCategoryFromKodeKegiatan(kode_kegiatan);
    }
    
    // Clean uraian
    if (!uraian || uraian.length < 2) {
      uraian = jenis_transaksi === 'penerimaan' ? 'Penerimaan Dana' : 'Pengeluaran';
    }
    
    items.push({
      kode_kegiatan,
      kode_rekening,
      activity_name: uraian,
      category,
      amount: pengeluaran,
      penerimaan,
      pengeluaran,
      saldo,
      transaction_date: tanggal,
      description: no_bukti ? `No. Bukti: ${no_bukti}` : null,
      jenis_transaksi,
    });
  }
  
  // ============ POST-PROCESSING: Inherit kode_rekening dari transaksi sebelumnya ============
  // Untuk transaksi tanpa kode_rekening, cari dari transaksi dengan kode_kegiatan sama
  console.log(`=== POST-PROCESSING: ${items.length} items, checking for missing kode_rekening ===`);
  
  // Log semua items sebelum inheritance
  const itemsWithoutKode = items.filter(item => !item.kode_rekening && item.kode_kegiatan);
  console.log(`Items without kode_rekening: ${itemsWithoutKode.length}`);
  for (const item of itemsWithoutKode) {
    console.log(`  - "${item.activity_name}" (kode_kegiatan: ${item.kode_kegiatan})`);
  }
  
  for (let i = 0; i < items.length; i++) {
    if (!items[i].kode_rekening && items[i].kode_kegiatan) {
      const currentKegiatan = items[i].kode_kegiatan;
      console.log(`Finding kode_rekening for "${items[i].activity_name}" with kode_kegiatan ${currentKegiatan}`);
      
      // Cari dari items sebelumnya dengan kode_kegiatan sama
      for (let j = i - 1; j >= 0; j--) {
        if (items[j].kode_kegiatan === currentKegiatan && items[j].kode_rekening) {
          console.log(`  INHERITED from previous: ${items[j].kode_rekening} (from "${items[j].activity_name}")`);
          items[i].kode_rekening = items[j].kode_rekening;
          break;
        }
      }
      
      // Jika masih tidak ditemukan, cari dari items SESUDAH
      if (!items[i].kode_rekening) {
        for (let j = i + 1; j < items.length; j++) {
          if (items[j].kode_kegiatan === currentKegiatan && items[j].kode_rekening) {
            console.log(`  INHERITED from next: ${items[j].kode_rekening} (from "${items[j].activity_name}")`);
            items[i].kode_rekening = items[j].kode_rekening;
            break;
          }
        }
      }
      
      // Log jika masih tidak ditemukan
      if (!items[i].kode_rekening) {
        console.log(`  WARNING: No kode_rekening found for "${items[i].activity_name}" with kode_kegiatan ${currentKegiatan}`);
        // List semua items dengan kode_kegiatan yang sama untuk debugging
        const sameKegiatan = items.filter(it => it.kode_kegiatan === currentKegiatan);
        console.log(`  Items with same kode_kegiatan ${currentKegiatan}: ${sameKegiatan.length}`);
        for (const sk of sameKegiatan) {
          console.log(`    - "${sk.activity_name}": kode_rekening=${sk.kode_rekening || 'NONE'}`);
        }
      }
    }
  }
  
  // Use saldo akhir from last valid saldo if not found from Jumlah line
  if (saldoAkhir === 0 && lastValidSaldo > 0) {
    saldoAkhir = lastValidSaldo;
  }
  
  // Calculate pajak and belanja from items
  let totalPajak = 0;
  let totalBelanja = 0;
  
  for (const item of items) {
    if (item.jenis_transaksi === 'pajak') {
      totalPajak += item.pengeluaran;
    } else if (item.jenis_transaksi === 'pengeluaran') {
      totalBelanja += item.pengeluaran;
    }
  }
  
  // If totals not found from Jumlah line, calculate from items
  if (!foundJumlahLine) {
    totalPenerimaan = items
      .filter(item => item.jenis_transaksi === 'penerimaan')
      .reduce((sum, item) => sum + item.penerimaan, 0);
    
    totalPengeluaran = totalBelanja + totalPajak;
  } else {
    // Recalculate pajak from items
    totalPajak = items
      .filter(item => item.jenis_transaksi === 'pajak')
      .reduce((sum, item) => sum + item.pengeluaran, 0);
    
    totalBelanja = totalPengeluaran - totalPajak;
  }
  
  const summary: BKUSummary = {
    total_penerimaan: totalPenerimaan,
    total_pengeluaran: totalPengeluaran, // Total semua pengeluaran termasuk pajak
    total_pajak: totalPajak,
    total_belanja: totalBelanja, // Belanja tanpa pajak
    saldo_akhir: saldoAkhir,
    jumlah_transaksi: items.length,
  };
  
  console.log(`Parsed ${items.length} transactions`);
  console.log('Summary:', JSON.stringify(summary));
  
  return { items, summary };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { spjId, fileUrl, pdfText } = await req.json();

    if (!spjId || !pdfText) {
      throw new Error('Missing required parameters: spjId and pdfText');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Update status to processing
    await supabase
      .from('spj_documents')
      .update({ status: 'processing' })
      .eq('id', spjId);

    // Delete existing items for this SPJ document (for re-parsing)
    await supabase
      .from('spj_items')
      .delete()
      .eq('spj_id', spjId);

    // Parse BKU text
    console.log('Parsing BKU text...');
    const { items, summary } = parseBKUText(pdfText);
    console.log(`Extracted ${items.length} transactions from BKU`);
    console.log('Summary:', summary);

    // Insert items into database
    if (items.length > 0) {
      const itemsToInsert = items.map((item) => ({
        spj_id: spjId,
        kode_kegiatan: item.kode_kegiatan,
        kode_rekening: item.kode_rekening,
        activity_name: item.activity_name,
        category: item.category,
        main_category: item.jenis_transaksi,
        sub_category: null,
        amount: item.amount,
        description: item.description,
        transaction_date: item.transaction_date,
      }));

      const { error: insertError } = await supabase
        .from('spj_items')
        .insert(itemsToInsert);

      if (insertError) {
        console.error('Error inserting items:', insertError);
        throw insertError;
      }
    }

    // Prepare Excel-like data for parsed_data field
    const excelData = items.map((item, index) => ({
      no: index + 1,
      tanggal: item.transaction_date || '-',
      kode_kegiatan: item.kode_kegiatan || '-',
      kode_rekening: item.kode_rekening || '-',
      uraian: item.activity_name,
      kategori: item.category,
      jenis: item.jenis_transaksi,
      penerimaan: item.penerimaan,
      pengeluaran: item.pengeluaran,
      saldo: item.saldo,
    }));

    // Update document with results
    const { error: updateError } = await supabase
      .from('spj_documents')
      .update({
        status: 'completed',
        total_realization: summary.total_pengeluaran,
        parsed_data: { 
          items: excelData, 
          summary: {
            total_penerimaan: summary.total_penerimaan,
            total_pengeluaran: summary.total_pengeluaran,
            total_pajak: summary.total_pajak,
            total_belanja: summary.total_belanja,
            saldo_akhir: summary.saldo_akhir,
            jumlah_transaksi: summary.jumlah_transaksi,
          }
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', spjId);

    if (updateError) {
      console.error('Error updating document:', updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total_penerimaan: summary.total_penerimaan,
          total_pengeluaran: summary.total_pengeluaran,
          total_pajak: summary.total_pajak,
          total_belanja: summary.total_belanja,
          saldo_akhir: summary.saldo_akhir,
        },
        items_count: items.length,
        excel_data: excelData,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in parse-spj:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Try to update status to failed
    try {
      const { spjId } = await req.json().catch(() => ({}));
      if (spjId) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        await supabase
          .from('spj_documents')
          .update({ status: 'failed' })
          .eq('id', spjId);
      }
    } catch (e) {
      console.error('Failed to update status:', e);
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
