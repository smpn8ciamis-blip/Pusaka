import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Set VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const distDir = path.join(__dirname, '../dist/website/berita');

async function generate() {
  console.log(' Fetching news...');
  
  const { data: news, error } = await supabase
    .from('website_news')
    .select('*, website_news_categories(name)')
    .eq('status', 'published');

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
    console.log(' Created directory:', distDir);
  }

  console.log(`📄 Found ${news.length} articles. Generating HTML pages...`);

  news.forEach((n) => {
    const title = (n.title || 'Berita').replace(/"/g, '&quot;');
    const desc = (n.excerpt || n.title || '').replace(/"/g, '&quot;');
    const image = n.cover_image_url || 'https://pusaka.smpn8ciamis.sch.id/og-default.jpg';
    const url = `https://pusaka.smpn8ciamis.sch.id/website/berita/${n.slug}`;
    const category = n.website_news_categories?.name || 'Berita';
    const pubDate = n.published_at ? new Date(n.published_at).toISOString() : '';

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - SMPN 8 Ciamis</title>
  
  <!-- Open Graph / WhatsApp / Facebook -->
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${url}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="SMPN 8 Ciamis">
  ${pubDate ? `<meta property="article:published_time" content="${pubDate}">` : ''}
  <meta property="article:section" content="${category}">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${image}">
  
  <!-- SEO Meta -->
  <meta name="description" content="${desc}">
  <link rel="canonical" href="${url}">
  
  <!-- Redirect ke React App untuk user biasa (bukan bot) -->
  <script>
    if (!navigator.userAgent.match(/bot|crawler|spider|facebook|whatsapp|twitter|linkedin|telegram/i)) {
      window.location.href = '/';
    }
  </script>
</head>
<body>
  <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; background: #f8fafc; border-radius: 12px;">
    <h1 style="color: #1e293b; margin-bottom: 16px;">${title}</h1>
    <p style="color: #64748b; margin-bottom: 24px; line-height: 1.6;">${desc}</p>
    ${n.cover_image_url ? `<img src="${n.cover_image_url}" alt="${title}" style="max-width: 100%; height: auto; border-radius: 8px; margin-bottom: 24px;">` : ''}
    <p><a href="/" style="color: #1e40af; text-decoration: none; font-weight: 600;">← Kembali ke website</a></p>
  </div>
</body>
</html>`;

    const filePath = path.join(distDir, `${n.slug}.html`);
    fs.writeFileSync(filePath, html);
    console.log(`✅ Generated: ${n.slug}.html`);
  });

  console.log('\n🎉 Done! Generated', news.length, 'HTML files with OG tags');
  console.log('📂 Location:', distDir);
}

generate();
