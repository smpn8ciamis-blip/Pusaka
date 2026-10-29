// Pulih otomatis saat file JS hasil build lama sudah tidak ada di server
// (terjadi bila tab masih terbuka dengan versi lama setelah ada deploy baru).
// Cukup memuat ulang sekali agar browser mengambil index.html dan chunk versi terbaru.

const KEY = "chunk-reload-at";
const WINDOW_MS = 15_000; // cegah perulangan reload bila masalahnya bukan versi lama

const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < WINDOW_MS) return; // sudah dicoba barusan, jangan mengulang
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* sessionStorage tidak tersedia: tetap coba reload satu kali */
  }
  window.location.reload();
}

export function initChunkReload() {
  // Vite memicu event ini saat preload chunk gagal
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    reloadOnce();
  });

  // import() dinamis yang gagal (mis. React.lazy) muncul sebagai promise rejection
  window.addEventListener("unhandledrejection", (e) => {
    const msg = String((e.reason && (e.reason.message || e.reason)) || "");
    if (CHUNK_ERROR.test(msg)) {
      e.preventDefault();
      reloadOnce();
    }
  });
}
