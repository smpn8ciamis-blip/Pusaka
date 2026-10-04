const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const DIST_DIR = path.join(__dirname, 'dist/website/berita');

async function generate() {
  console.log('🔍 Fetching published news...');
  const { data: news, error } = await supabase
    .from('website_news')
    .select('*, website_news_categories(name,color)')
    .eq('status', 'published');

  if (error) {
    console.error('❌ Error fetching news:', error);
    process.exit(1);
  }

  console.log(`📰 Found ${news.length} news articles`);

  // Create directory
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  // Generate HTML for each news
  news.forEach((n) => {
    const title = n.title || 'Berita';
    const description = n.excerpt || title;
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
  
  <!-- Open Graph -->
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${url}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="SMPN 8 Ciamis">
  <meta property="article:published_time" content="${pubDate}">
  <meta property="article:section" content="${category}">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${image}">
  
  <!-- SEO -->
  <meta name="description" content="${description}">
  <link rel="canonical" href="${url}">
  
  <!-- Redirect to SPA after 0 seconds for real users -->
  <noscript><meta http-equiv="refresh" content="0;url=https://pusaka.smpn8ciamis.sch.id/website/berita/${n.slug}"></noscript>
</head>
<body>
  <script>window.location.href = "https://pusaka.smpn8ciamis.sch.id/website/berita/${n.slug}";</script>
</body>
</html>`;

    const filePath = path.join(DIST_DIR, `${n.slug}.html`);
    fs.writeFileSync(filePath, html);
    console.log(`✅ Generated: ${n.slug}.html`);
  });

  console.log('🎉 OG HTML generation complete!');
}

generate();
