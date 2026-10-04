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

  // Check if user has admin or bendahara role
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

// Parse Indonesian currency format to number
const parseIndonesianCurrency = (value: any): number => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  
  const str = String(value);
  let cleaned = str
    .replace(/Rp\.?/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .trim();
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

// Clean and validate kode_rekening - must start with "5.1."
const cleanKodeRekening = (value: string | null | undefined): string => {
  if (!value) return '';
  const str = String(value).trim();
  
  if (str.startsWith('5.1.')) {
    return str;
  }
  
  const match = str.match(/5\.1\.\d{2}\.\d{2}\.\d{2}\.\d{4}/);
  if (match) {
    return match[0];
  }
  
  return '';
};

// Clean kode_kegiatan - hierarchical activity codes like "03. 03. 07."
const cleanKodeKegiatan = (value: string | null | undefined): string => {
  if (!value) return '';
  const str = String(value).trim();
  
  let cleaned = str.replace(/5\.1\.\d{2}\.\d{2}\.\d{2}\.\d{4}/g, '').trim();
  
  if (/^\d{2}\.?\s*\d{2}\.?\s*\d{2}\.?/.test(cleaned)) {
    return cleaned;
  }
  
  return cleaned;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify authentication
  const { user, error: authError } = await verifyBendaharaOrAdminAuth(req);
  if (authError) {
    console.log('Authentication failed:', authError);
    return new Response(
      JSON.stringify({ error: authError }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('Parse RKAS initiated by:', user.email);

  try {
    const { pdfText, month, year } = await req.json();

    if (!pdfText) {
      return new Response(
        JSON.stringify({ error: 'PDF text content is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Parsing RKAS PDF for ${month}/${year}`);
    console.log(`PDF text length: ${pdfText.length} characters`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const systemPrompt = `Anda adalah asisten ahli yang mengekstrak data RKAS (Rencana Kegiatan dan Anggaran Sekolah) dari dokumen PDF dengan SANGAT TELITI dan LENGKAP.

TUGAS UTAMA: Ekstrak SELURUH item anggaran dari bagian "B. BELANJA" tanpa ada yang terlewat.

PENTING - PERBEDAAN KODE_KEGIATAN DAN KODE_REKENING:

1. KODE_KEGIATAN adalah kode hierarki aktivitas dengan format angka 2 digit dipisah titik dan spasi:
   - Contoh: "03. 03. 07.", "04. 01. 02.", "05. 02. 01."
   - Ini menunjukkan hierarki: Kategori Utama . Sub Kategori . Item Kegiatan
   - Digit pertama menunjukkan kategori utama (03=Proses, 04=Pendidik, 05=Sarpras, dll)

2. KODE_REKENING adalah kode akun anggaran yang SELALU dimulai dengan "5.1.":
   - Format: 5.1.XX.XX.XX.XXXX
   - Contoh: "5.1.02.04.01.0003", "5.1.01.01.01.0001"
   - Ini adalah kode rekening belanja standar pemerintah
   - JANGAN masukkan kode_kegiatan ke dalam kode_rekening!

KATEGORI UTAMA BELANJA (kode 2 digit pertama untuk kode_kegiatan):
- 03. Pengembangan Standar Proses
- 04. Pengembangan Pendidik dan Tenaga Kependidikan
- 05. Pengembangan Sarana dan Prasarana Sekolah
- 06. Pengembangan Standar Pengelolaan
- 07. Pengembangan Standar Pembiayaan
- 08. Pengembangan dan Implementasi Sistem Penilaian

INSTRUKSI PENTING:
1. Baca SELURUH dokumen dari awal sampai akhir
2. Ekstrak SEMUA baris yang memiliki nilai anggaran (jumlah rupiah)
3. PISAHKAN dengan benar:
   - kode_kegiatan: kode hierarki seperti "03. 03. 07."
   - kode_rekening: kode akun yang dimulai "5.1.XX.XX.XX.XXXX"
4. Perhatikan SETIAP item termasuk:
   - Biaya perjalanan dinas (transport, akomodasi)
   - Bantuan transportasi
   - Honorarium
   - Konsumsi (makan, snack, air mineral)
   - Pengadaan barang (ATK, perlengkapan)
   - Jasa dan layanan
   - Pendaftaran kegiatan/lomba
   - Dan semua item lainnya

FORMAT ANGKA INDONESIA:
- "Rp 1.500.000" = 1500000
- "1.500.000" = 1500000
- "Rp1500000" = 1500000
- Titik (.) adalah pemisah ribuan, BUKAN desimal

OUTPUT JSON (pastikan valid JSON):
{
  "items": [
    {
      "kode_rekening": "5.1.XX.XX.XX.XXXX (HARUS dimulai dengan 5.1.)",
      "kode_kegiatan": "XX. XX. XX. (kode hierarki aktivitas)",
      "main_category": "kode 2 digit (03, 04, 05, 06, 07, 08)",
      "main_category_name": "nama kategori utama",
      "sub_category": "kode sub kategori",
      "sub_category_name": "nama sub kategori",
      "activity_name": "nama kegiatan/uraian LENGKAP",
      "rincian_perhitungan": "detail perhitungan volume",
      "volume": angka_volume,
      "unit": "satuan",
      "jumlah": angka_total_tanpa_format
    }
  ],
  "summary": [
    {"kode": "03", "category": "nama kategori", "total": angka_total}
  ],
  "total_budget": angka_total_semua_belanja
}

PERINGATAN:
- JANGAN lewatkan item apapun
- JANGAN meringkas atau menggabungkan item
- JANGAN mencampur kode_kegiatan dengan kode_rekening
- Kode_rekening HARUS dimulai dengan "5.1." atau kosong jika tidak ada
- Setiap baris dengan nilai anggaran = 1 item
- Pastikan total_budget = jumlah semua item
- Kembalikan HANYA JSON valid tanpa teks tambahan`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro', // Use pro model for better accuracy
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Ekstrak SEMUA item anggaran dari dokumen RKAS berikut. Pastikan PISAHKAN kode_kegiatan (kode hierarki aktivitas) dan kode_rekening (kode akun 5.1.XX.XX.XX.XXXX) dengan benar:\n\n${pdfText.substring(0, 80000)}` }
        ],
        temperature: 0.05, // Very low temperature for consistency
        max_tokens: 64000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded, please try again later' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted, please add credits' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || '';
    
    console.log('AI Response received, length:', content.length);

    // Parse the JSON from AI response
    let parsedData;
    try {
      // Remove markdown code blocks if present
      let cleanContent = content;
      if (cleanContent.includes('```json')) {
        cleanContent = cleanContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      } else if (cleanContent.includes('```')) {
        cleanContent = cleanContent.replace(/```\s*/g, '');
      }
      
      // Try to extract JSON from the response
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];
        
        // Try to fix truncated JSON by closing open arrays/objects
        try {
          parsedData = JSON.parse(jsonStr);
        } catch (firstError) {
          console.log('First parse failed, attempting to fix truncated JSON');
          
          // Count open brackets and try to close them
          const openBrackets = (jsonStr.match(/\[/g) || []).length;
          const closeBrackets = (jsonStr.match(/\]/g) || []).length;
          const openBraces = (jsonStr.match(/\{/g) || []).length;
          const closeBraces = (jsonStr.match(/\}/g) || []).length;
          
          // Find last complete item by looking for the last complete object in items array
          const itemsMatch = jsonStr.match(/"items"\s*:\s*\[([\s\S]*)/);
          if (itemsMatch) {
            const itemsContent = itemsMatch[1];
            // Find all complete objects in the items array
            const completeItems = [];
            let depth = 0;
            let currentItem = '';
            let inString = false;
            let escape = false;
            
            for (let i = 0; i < itemsContent.length; i++) {
              const char = itemsContent[i];
              
              if (escape) {
                currentItem += char;
                escape = false;
                continue;
              }
              
              if (char === '\\') {
                currentItem += char;
                escape = true;
                continue;
              }
              
              if (char === '"' && !escape) {
                inString = !inString;
              }
              
              if (!inString) {
                if (char === '{') depth++;
                if (char === '}') depth--;
              }
              
              currentItem += char;
              
              if (depth === 0 && currentItem.trim().startsWith('{')) {
                try {
                  const parsed = JSON.parse(currentItem.trim());
                  completeItems.push(parsed);
                  currentItem = '';
                } catch {
                  // Not a complete object yet, continue
                }
              }
              
              if (char === ',' && depth === 0) {
                currentItem = '';
              }
            }
            
            if (completeItems.length > 0) {
              console.log(`Recovered ${completeItems.length} complete items from truncated response`);
              parsedData = {
                items: completeItems,
                summary: [],
                total_budget: 0 // Will be calculated below
              };
            } else {
              throw firstError;
            }
          } else {
            throw firstError;
          }
        }
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.log('Raw content preview:', content.substring(0, 3000));
      
      // Return a default structure if parsing fails
      parsedData = {
        items: [],
        summary: [],
        total_budget: 0,
        parse_error: 'Gagal mengekstrak data dari PDF. Format dokumen mungkin tidak sesuai.'
      };
    }

    // Transform items to match the expected format with robust number parsing
    if (parsedData.items && parsedData.items.length > 0) {
      parsedData.items = parsedData.items.map((item: any) => {
        const totalAmount = parseIndonesianCurrency(item.jumlah) || 
                          parseIndonesianCurrency(item.total_amount) ||
                          parseIndonesianCurrency(item.total) || 0;
        
        // Clean and validate kode_rekening and kode_kegiatan
        const rawKodeRekening = item.kode_rekening || '';
        const rawKodeKegiatan = item.kode_kegiatan || '';
        
        const cleanedKodeRekening = cleanKodeRekening(rawKodeRekening);
        const cleanedKodeKegiatan = cleanKodeKegiatan(rawKodeKegiatan);
        
        // Log if we cleaned up invalid data
        if (rawKodeRekening && !cleanedKodeRekening) {
          console.log(`Cleaned invalid kode_rekening: "${rawKodeRekening}" -> ""`);
        }
        
        return {
          category: item.main_category_name || item.category || 'Lainnya',
          main_category: item.main_category || '00',
          sub_category: item.sub_category || item.sub_category_name || '',
          kode_rekening: cleanedKodeRekening,
          kode_kegiatan: cleanedKodeKegiatan,
          activity_name: item.activity_name || item.uraian || item.nama_kegiatan || '-',
          description: item.rincian_perhitungan || item.description || item.keterangan || null,
          volume: parseFloat(item.volume) || 1,
          unit: item.unit || item.satuan || '-',
          unit_price: parseIndonesianCurrency(item.unit_price) || parseIndonesianCurrency(item.harga_satuan) || 0,
          total_amount: totalAmount,
        };
      });
      
      // ALWAYS recalculate total_budget from actual items sum
      const calculatedTotal = parsedData.items.reduce((sum: number, item: any) => sum + (item.total_amount || 0), 0);
      const aiReportedTotal = parseIndonesianCurrency(parsedData.total_budget);
      
      console.log(`AI reported total: ${aiReportedTotal}, Calculated from items: ${calculatedTotal}`);
      console.log(`Items count: ${parsedData.items.length}`);
      
      // Use calculated total (more accurate)
      parsedData.total_budget = calculatedTotal;
      
      // Log category breakdown
      const categoryTotals: Record<string, number> = {};
      parsedData.items.forEach((item: any) => {
        const cat = item.main_category || '00';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + (item.total_amount || 0);
      });
      console.log('Category breakdown:', JSON.stringify(categoryTotals));
      
      // Log kode_rekening stats
      const kodeRekeningCount = parsedData.items.filter((item: any) => item.kode_rekening).length;
      console.log(`Items with valid kode_rekening (5.1.*): ${kodeRekeningCount}/${parsedData.items.length}`);
    }

    console.log(`Parsed ${parsedData.items?.length || 0} items, total budget: ${parsedData.total_budget || 0}`);

    return new Response(
      JSON.stringify(parsedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in parse-rkas function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
