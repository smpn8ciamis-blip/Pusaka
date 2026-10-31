// Setelah build: buat salinan index.html per menu website (dist/website/<menu>/index.html) dengan judul, deskripsi,
// kanonik, dan Open Graph khusus menu itu. Tujuannya:
//  - Pratinjau tautan WhatsApp/Facebook menampilkan nama bagian ("Agenda Kegiatan - SMP Negeri 8 Ciamis"),
//    tanpa bergantung pada konfigurasi nginx tambahan.
//  - Google langsung melihat judul/kanonik yang benar di HTML awal.
// Aplikasi yang sama dimuat (React Router membaca alamat); nginx `try_files $uri $uri/ /index.html` menyajikan
// folder ini otomatis. Bila langkah ini gagal, build tetap berhasil dan situs memakai index.html biasa.
import fs from "fs";
import path from "path";
import type { Plugin } from "vite";
import { DEFAULT_SITE_URL, PAGE_SEO } from "./src/lib/seoPages";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function setMeta(html: string, attr: "property" | "name", key: string, value: string) {
  const re = new RegExp(`<meta\\s+${attr}="${key.replace(/[:.]/g, "\\$&")}"\\s+content="[^"]*"\\s*/?>`);
  const tag = `<meta ${attr}="${key}" content="${esc(value)}" />`;
  return re.test(html) ? html.replace(re, tag) : html.replace("</head>", `    ${tag}\n</head>`);
}

export function buildPageHtml(html: string, pagePath: string, siteUrl: string): string {
  const page = PAGE_SEO[pagePath];
  if (!page) throw new Error(`Halaman tidak dikenal: ${pagePath}`);
  const url = siteUrl + pagePath;
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`);
  out = setMeta(out, "name", "description", page.description);
  out = setMeta(out, "property", "og:title", page.title);
  out = setMeta(out, "property", "og:description", page.description);
  out = setMeta(out, "property", "og:url", url);
  out = setMeta(out, "name", "twitter:title", page.title);
  out = setMeta(out, "name", "twitter:description", page.description);
  out = out.replace(/<link rel="canonical"[^>]*>\s*/, "");
  out = out.replace("</head>", `    <link rel="canonical" href="${esc(url)}" />\n</head>`);
  // JSON-LD WebSite hanya untuk beranda
  out = out.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, "");
  return out;
}

export function seoPagesPlugin(): Plugin {
  let outDir = "dist";
  let root = process.cwd();
  return {
    name: "seo-pages",
    apply: "build",
    configResolved(cfg) { outDir = cfg.build.outDir; root = cfg.root; },
    closeBundle() {
      try {
        const dist = path.resolve(root, outDir);
        const indexFile = path.join(dist, "index.html");
        if (!fs.existsSync(indexFile)) return;
        const html = fs.readFileSync(indexFile, "utf8");
        const siteUrl = (process.env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
        let n = 0;
        for (const p of Object.keys(PAGE_SEO)) {
          const dir = path.join(dist, ...p.split("/").filter(Boolean));
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, "index.html"), buildPageHtml(html, p, siteUrl));
          n++;
        }
        console.log(`[seo-pages] ${n} halaman menu dibuat`);
      } catch (e: any) {
        console.warn(`[seo-pages] dilewati: ${e?.message ?? e}`);
      }
    },
  };
}
