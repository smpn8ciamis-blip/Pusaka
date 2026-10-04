require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

console.log('🔍 Environment:');
console.log('   URL:', supabaseUrl || '❌ Missing');
console.log('   KEY:', supabaseKey ? '✅ Set (' + supabaseKey.length + ' chars)' : '❌ Missing');

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing env vars');
  process.exit(1);
}

// Create client TANPA realtime untuk hindari WebSocket error
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const distDir = path.join(__dirname, '../dist/website/berita');

async function generate() {
  console.log('\n📰 Fetching news...');
  
  const { data: news, error } = await supabase
    .from('website_news')
    .select('*, website_news_categories(name)')
    .eq('status', 'published');

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  if (!news || news.length === 0) {
    console.log('⚠️  No published news found');
    return;
  }

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  console.log(`📄 Found ${news.length} articles\n`);

  news.forEach((n) => {
    const title = (n.title || 'Berita').replace(/"/g, '&quot;');
    const desc = (n.excerpt || n.title || '').replace(/"/g, '&quot;');
    const image = n.cover_image_url || 'https://pusaka.smpn8ciamis.sch.id/og-default.jpg';
    const url = `https://pusaka.smpn8ciamis.sch.id/website/berita/${n.slug}`;

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>${title} - SMPN 8 Ciamis</title>
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${url}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="SMPN 8 Ciamis">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${image}">
  <meta name="description" content="${desc}">
  <script>if(!navigator.userAgent.match(/bot|crawler|spider|facebook|whatsapp|twitter|linkedin|telegram/i))window.location.href='/'</script>
</head>
<body><h1>${title}</h1><p>${desc}</p></body>
</html>`;

    fs.writeFileSync(path.join(distDir, `${n.slug}.html`), html);
    console.log(`✅ ${n.slug}.html`);
  });

  console.log(`\n🎉 Done! ${news.length} files generated`);
}

generate();
