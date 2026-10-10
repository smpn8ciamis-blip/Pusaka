import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, CreditCard, Download, GraduationCap, Hash, Loader2, MapPin, RotateCw, School, User } from 'lucide-react';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import CryptoJS from 'crypto-js';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Button } from '@/components/ui/button';

/**
 * Kartu pelajar (OSIS) di akun siswa.
 * Tampilan sama persis dengan kartu yang dicetak admin di halaman Siswa
 * (memakai pengaturan kartu yang tersimpan di school_settings).
 * HARUS SAMA dengan CARD_SECRET di Students.tsx agar QR bisa diverifikasi.
 */
const CARD_SECRET = 'PUSAKA-SMPN8-CIAMIS-2026';

const THEME_COLORS: Record<string, string> = { blue: '#1e40af', green: '#0f766e', red: '#b91c1c', purple: '#6d28d9', black: '#111827' };
const THEME_DARK: Record<string, string> = { blue: '#172554', green: '#042f2e', red: '#7f1d1d', purple: '#4c1d95', black: '#000000' };
const THEME_LIGHT: Record<string, string> = { blue: '#bfdbfe', green: '#99f6e4', red: '#fecaca', purple: '#ddd6fe', black: '#e5e7eb' };

const DEFAULT_LAYOUT = {
  f: {
    headerH: 46, photoX: 10, photoY: 52, photoW: 74, photoH: 92,
    infoX: 92, infoY: 53, footerH: 16, dotsOpacity: 0.35,
    sigLeft: 110, sigY: 30, stampLeft: 62, stampBottom: 30,
    validX: 10, validY: 148, validW: 74,
    printX: 10, printY: 19,
  },
  b: {
    bandTopH: 40, bandBottomH: 26,
    titleX: 70, titleY: 8, subX: 70, subY: 48,
    qrX: 14, qrY: 52, qrSize: 84, bcX: 14, bcY: 148, bcW: 118,
    wmX: 44, wmY: 62, wmSize: 110, wmOpacity: 0.1, footY: 8,
    logoLeftX: 10, logoLeftY: 5, logoLeftSize: 30,
    logoRightX: 10, logoRightY: 5, logoRightSize: 30,
  },
};

const num = (v: any, d = 0) => { const n = Number(v); return isNaN(n) ? d : n; };
const toTitleCase = (name?: string | null): string =>
  (name || '').toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const fixGelarToken = (t: string) => {
  const clean = t.trim();
  if (!clean) return '';
  if (clean.length <= 2) return clean.toUpperCase();
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
};
const formatKepsekName = (raw?: string | null) => {
  if (!raw) return '';
  const parts = String(raw).split(',');
  const namePart = toTitleCase(parts[0]);
  const gelars = parts.slice(1).map((g) => {
    const hadDot = g.trim().endsWith('.');
    let out = g.split('.').map(fixGelarToken).filter(Boolean).join('.');
    if (hadDot) out += '.';
    return out.trim();
  }).filter(Boolean);
  return gelars.length ? `${namePart}, ${gelars.join(', ')}` : namePart;
};
const formatDateID = (dateStr?: string | null) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const urlToDataUrl = (url?: string | null) => new Promise<string>((resolve) => {
  if (!url) { resolve(''); return; }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || 300; c.height = img.naturalHeight || 300;
      c.getContext('2d')?.drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    } catch { resolve(url); }
  };
  img.onerror = () => resolve(url);
  img.src = url;
});

interface Props {
  student: any;
  className?: string | null;
  school: any;
}

export default function StudentIdCardTab({ student, className, school }: Props) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [assets, setAssets] = useState<Record<string, string>>({});
  const [qr, setQr] = useState('');
  const [barcode, setBarcode] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(1);
  const boxRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  const s = school || {};

  // Pengaturan yang disimpan admin (tata letak + tema)
  const cfg = useMemo(() => {
    let p: any = {};
    try { if (s.card_layout) p = JSON.parse(s.card_layout); } catch { /* abaikan */ }
    const theme = p.theme || 'blue';
    const custom = p.customColor || '#1e40af';
    const size = p.size === 'large' ? 'large' : 'standard';
    return {
      L: { ...DEFAULT_LAYOUT.f, ...(p.f || {}) },
      B: { ...DEFAULT_LAYOUT.b, ...(p.b || {}) },
      color: theme === 'custom' ? custom : (THEME_COLORS[theme] || THEME_COLORS.blue),
      dark: theme === 'custom' ? custom : (THEME_DARK[theme] || '#0f172a'),
      light: theme === 'custom' ? '#f3f4f6' : (THEME_LIGHT[theme] || '#bfdbfe'),
      px: size === 'large' ? { w: 378, h: 246 } : { w: 340, h: 214 },
      mm: size === 'large' ? { w: 100, h: 65 } : { w: 85.6, h: 54 },
    };
  }, [s.card_layout]);
  const { L, B, color: cardColor, dark: cardDark, light: cardLight } = cfg;

  const validityText = s.card_validity_text || 'Berlaku Selama Menjadi Siswa';
  const cetak = s.card_print_date_text || new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  // Muat aset gambar (diubah ke data URL supaya aman untuk PDF), QR, dan barcode
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReady(false);
      const urls = Array.from(new Set([
        student?.photo_url, s.logo_url, s.right_logo_url, s.watermark_url, s.headmaster_signature_url, s.school_stamp_url,
      ].filter(Boolean))) as string[];
      const results = await Promise.all(urls.map((u) => urlToDataUrl(u)));
      const map: Record<string, string> = {};
      urls.forEach((u, i) => { map[u] = results[i]; });

      let qrUrl = '';
      try {
        const token = CryptoJS.AES.encrypt(JSON.stringify({ nis: student.nis, nisn: student.nisn || '' }), CARD_SECRET).toString();
        qrUrl = await QRCode.toDataURL(`${window.location.origin}/verify-student?token=${encodeURIComponent(token)}`, {
          width: 256, margin: 1, color: { dark: '#000000ff', light: '#ffffffff' },
        });
      } catch { /* QR opsional */ }

      let bc = '';
      try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, String(student.nisn || student.nis), {
          format: 'CODE128', displayValue: false, margin: 0, height: 28, width: 1.4,
          background: 'rgba(0,0,0,0)', lineColor: '#000000',
        });
        bc = canvas.toDataURL('image/png');
      } catch { /* barcode opsional */ }

      if (cancelled) return;
      setAssets(map); setQr(qrUrl); setBarcode(bc); setReady(true);
    })();
    return () => { cancelled = true; };
  }, [student?.id, student?.photo_url, student?.nis, student?.nisn, s.logo_url, s.right_logo_url, s.watermark_url, s.headmaster_signature_url, s.school_stamp_url]);

  // Skala kartu mengikuti lebar layar
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1.35, el.clientWidth / cfg.px.w));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cfg.px.w]);

  const asset = (url?: string | null) => (url && assets[url]) || url || '';

  const renderFront = (unit: string) => {
    const cardLogo = s.right_logo_url || s.logo_url;
    const kelasShort = String(className || '-').trim().slice(0, 2);
    return (
      <div className="sic-card" data-card-unit={unit}>
        {s.watermark_url && <img className="idc-bg" src={asset(s.watermark_url)} alt="" />}
        <div className="idc-bg-fade" />
        <div className="idc-dots" style={{ position: 'absolute', top: num(L.headerH) + 4, right: 8, opacity: num(L.dotsOpacity, 0.35) }} />
        <div className="idc-dots" style={{ position: 'absolute', bottom: num(L.footerH, 16) + 52, left: 8, opacity: num(L.dotsOpacity, 0.35) * 0.7 }} />
        <div className="idc-ring" style={{ position: 'absolute', top: num(L.headerH) - 6, right: -18, borderColor: cardColor }} />
        <div className="idc-ring idc-ring-sm" style={{ position: 'absolute', bottom: num(L.footerH, 16) - 4, left: -14, borderColor: cardColor }} />

        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: num(L.headerH, 46), zIndex: 2 }}>
          <div className="idc-header-panel" style={{ background: `linear-gradient(120deg, ${cardDark} 0%, ${cardColor} 65%)` }} />
          <div className="idc-header-sheen" />
          <div className="idc-header-accent" style={{ background: cardLight }} />
          <div className="idc-header-content">
            <div className="idc-logo-wrap">
              {cardLogo ? <img src={asset(cardLogo)} alt="" /> : <School className="idc-logo-fallback" style={{ color: cardColor }} />}
            </div>
            <div>
              <p className="idc-motto">{(s.district_name || 'PEMERINTAH KABUPATEN CIAMIS').toUpperCase()}</p>
              <p className="idc-school">{(s.school_name || 'NAMA SEKOLAH').toUpperCase()}</p>
              {s.school_address && <p className="idc-addrline">{toTitleCase(s.school_address)}</p>}
            </div>
          </div>
          <div className="idc-title-wrap">
            <p className="idc-title" style={{ color: cardDark }}>KARTU PELAJAR</p>
            <p className="idc-subtitle" style={{ color: cardColor }}>STUDENT IDENTITY CARD</p>
            <div className="idc-title-line" style={{ background: `linear-gradient(90deg, ${cardColor}, ${cardLight})` }} />
          </div>
        </div>

        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: num(L.footerH, 16), zIndex: 2 }}>
          <div className="idc-footer-panel" style={{ background: `linear-gradient(120deg, ${cardColor} 35%, ${cardDark} 100%)` }} />
          <div className="idc-footer-sheen" />
          <div className="idc-footer-accent" style={{ background: cardLight }} />
        </div>

        <div className="idc-photo" style={{ position: 'absolute', left: num(L.photoX, 10), top: num(L.photoY, 52), width: num(L.photoW, 74), height: num(L.photoH, 92), borderColor: cardColor, zIndex: 2 }}>
          {student.photo_url ? <img src={asset(student.photo_url)} alt="" /> : <User className="idc-photo-fallback" />}
        </div>

        <div style={{ position: 'absolute', left: num(L.validX, 10), top: num(L.validY, 148), width: num(L.validW, 74), zIndex: 2, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 5.5, fontWeight: 700, letterSpacing: 0.3, borderRadius: 3, padding: 2, background: cardLight, color: cardDark, whiteSpace: 'pre-line', lineHeight: 1.5 }}>
            {validityText}
          </p>
        </div>

        <div className="idc-info" style={{ position: 'absolute', left: num(L.infoX, 92), top: num(L.infoY, 53), right: 10, zIndex: 2 }}>
          {[
            { Icon: User, label: 'Nama', val: toTitleCase(student.full_name), cls: 'idc-name' },
            { Icon: CreditCard, label: 'NIS', val: student.nis },
            { Icon: Hash, label: 'NISN', val: student.nisn || '-' },
            { Icon: GraduationCap, label: 'Kelas', val: kelasShort },
            { Icon: CalendarDays, label: 'Tempat, Tgl Lahir', val: `${toTitleCase(student.birth_place) || '-'}, ${formatDateID(student.birth_date)}` },
          ].map(({ Icon, label, val, cls }) => (
            <div className="idc-row" key={label}>
              <span className="idc-chip" style={{ background: `linear-gradient(135deg, ${cardColor}, ${cardDark})` }}><Icon className="idc-ic" /></span>
              <span className="idc-label">{label}</span>
              <span className={`idc-val ${cls || ''}`}>{val}</span>
            </div>
          ))}
          <div className="idc-row" style={{ alignItems: 'flex-start' }}>
            <span className="idc-chip" style={{ background: `linear-gradient(135deg, ${cardColor}, ${cardDark})`, marginTop: 1 }}><MapPin className="idc-ic" /></span>
            <span className="idc-label" style={{ marginTop: 1 }}>Alamat</span>
            <span className="idc-val idc-val-multi">{toTitleCase(student.address) || '-'}</span>
          </div>
        </div>

        <div className="idc-printdate" style={{ position: 'absolute', left: num(L.printX, 10), bottom: num(L.printY, 19), zIndex: 2 }}>
          <p>Dicetak: {cetak}</p>
        </div>

        <div className="idc-sign-area" style={{ position: 'absolute', left: num(L.sigLeft, 110), bottom: num(L.sigY, 30), zIndex: 3 }}>
          <p className="idc-sign-jab">Kepala Sekolah,</p>
          <div className="idc-sign-space">
            {s.headmaster_signature_url && <img className="idc-signature" src={asset(s.headmaster_signature_url)} alt="" />}
          </div>
          <p className="idc-sign-name">{formatKepsekName(s.headmaster_name) || '(............................)'}</p>
          {s.headmaster_nip && <p className="idc-nip">NIP. {s.headmaster_nip}</p>}
        </div>
        {s.school_stamp_url && (
          <img className="idc-stamp" src={asset(s.school_stamp_url)} alt="" style={{ position: 'absolute', left: num(L.stampLeft, 62), bottom: num(L.stampBottom, 30), zIndex: 4 }} />
        )}
      </div>
    );
  };

  const renderBack = (unit: string) => {
    const schoolShort = ((s.school_name || 'SEKOLAH').split(' ').map((w: string) => w.charAt(0)).join('').slice(0, 5)).toUpperCase();
    const serial = `${schoolShort}-${new Date().getFullYear()}-${student.nis}`;
    const logoLeftSrc = s.logo_url || s.right_logo_url;
    const logoRightSrc = s.right_logo_url || s.logo_url;
    const wmSrc = s.right_logo_url || s.logo_url;
    const bTitle = (s.id_card_back_title || 'Kartu\nNomor Induk\nSiswa Nasional').split('\n');
    const bSub = (s.id_card_back_sub || 'Departemen Pendidikan Nasional\nRepublik Indonesia').split('\n');
    const bFooter = s.id_card_back_footer || 'hanya berlaku selama pemegang menjadi siswa';
    return (
      <div className="sic-card" data-card-unit={unit}>
        <div style={{ position: 'absolute', top: 0, left: -16, right: -16, height: num(B.bandTopH, 40), transform: 'skewX(-14deg)', zIndex: 1, background: `linear-gradient(120deg, ${cardDark} 0%, ${cardColor} 65%)`, boxShadow: '0 2px 6px rgba(15,23,42,.18)' }} />
        <div className="idb-band-top-sheen" style={{ position: 'absolute', top: 0, left: -16, width: '26%', height: num(B.bandTopH, 40), transform: 'skewX(-14deg)', zIndex: 1 }} />
        <div className="idb-band-top-accent" style={{ position: 'absolute', top: num(B.bandTopH, 40) + 2, left: '8%', background: cardLight, zIndex: 2 }} />
        <div style={{ position: 'absolute', bottom: 0, left: -16, right: -16, height: num(B.bandBottomH, 26), transform: 'skewX(-14deg)', zIndex: 1, background: `linear-gradient(120deg, ${cardColor} 35%, ${cardDark} 100%)`, boxShadow: '0 -2px 6px rgba(15,23,42,.15)' }} />
        <div className="idb-band-bottom-sheen" style={{ position: 'absolute', bottom: 0, right: -16, width: '20%', height: num(B.bandBottomH, 26), transform: 'skewX(-14deg)', zIndex: 1 }} />
        <div className="idb-band-bottom-accent" style={{ position: 'absolute', bottom: num(B.bandBottomH, 26) + 2, right: '10%', background: cardLight, zIndex: 2 }} />

        {logoLeftSrc && <img src={asset(logoLeftSrc)} alt="" style={{ position: 'absolute', left: num(B.logoLeftX, 10), top: num(B.logoLeftY, 5), width: num(B.logoLeftSize, 30), height: num(B.logoLeftSize, 30), objectFit: 'contain', zIndex: 3 }} />}
        {logoRightSrc && <img src={asset(logoRightSrc)} alt="" style={{ position: 'absolute', right: num(B.logoRightX, 10), top: num(B.logoRightY, 5), width: num(B.logoRightSize, 30), height: num(B.logoRightSize, 30), objectFit: 'contain', zIndex: 3 }} />}
        {wmSrc && <img src={asset(wmSrc)} alt="" style={{ position: 'absolute', right: num(B.wmX, 44), top: num(B.wmY, 62), width: num(B.wmSize, 110), height: num(B.wmSize, 110), opacity: num(B.wmOpacity, 0.1), zIndex: 0, objectFit: 'contain' }} />}

        <div style={{ position: 'absolute', left: num(B.titleX, 70), top: num(B.titleY, 8), zIndex: 3, maxWidth: 220 }}>
          <p style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.15, margin: 0, color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,.25)' }}>
            {bTitle.map((l: string, i: number) => <Fragment key={i}>{l}{i < bTitle.length - 1 && <br />}</Fragment>)}
          </p>
        </div>
        <div style={{ position: 'absolute', left: num(B.subX, 70), top: num(B.subY, 48), zIndex: 3, maxWidth: 220 }}>
          <div style={{ height: 2, width: '100%', margin: '0 0 3px', borderRadius: 2, background: cardColor }} />
          <p style={{ fontSize: 6.5, margin: 0, lineHeight: 1.35, color: '#0f172a', fontWeight: 700 }}>
            {bSub.map((l: string, i: number) => <Fragment key={i}>{l}{i < bSub.length - 1 && <br />}</Fragment>)}
          </p>
        </div>

        <div style={{ position: 'absolute', left: num(B.qrX, 14), top: num(B.qrY, 52), width: num(B.qrSize, 84), zIndex: 3, textAlign: 'center' }}>
          {qr && (
            <div className="idb-qr-box" style={{ borderColor: cardColor, width: num(B.qrSize, 84), height: num(B.qrSize, 84) }}>
              <img src={qr} alt="QR" />
            </div>
          )}
          <p className="idb-qr-label" style={{ color: cardDark }}>Scan Verifikasi</p>
        </div>

        <div style={{ position: 'absolute', right: num(B.bcX, 14), top: num(B.bcY, 148), zIndex: 3 }}>
          {barcode && (
            <div className="idb-barcode-box" style={{ borderColor: cardColor }}>
              <img src={barcode} alt="Barcode" style={{ width: num(B.bcW, 118) }} />
              <p>{serial}</p>
            </div>
          )}
        </div>

        <p style={{ position: 'absolute', left: 0, right: 0, bottom: num(B.footY, 8), zIndex: 3, textAlign: 'center', fontSize: 5.5, color: 'rgba(255,255,255,.95)', fontStyle: 'italic', margin: 0, letterSpacing: 0.4 }}>{bFooter}</p>
      </div>
    );
  };

  const downloadPdf = async () => {
    const area = captureRef.current;
    if (!area || !ready || busy) return;
    setBusy(true);
    const prev = area.getAttribute('style') || '';
    area.setAttribute('style', 'position:absolute; left:0; top:0; z-index:60; background:#ffffff; padding:8px;');
    try {
      await new Promise((r) => setTimeout(r, 80));
      const front = area.querySelector<HTMLElement>('[data-card-unit="pdf-front"]');
      const back = area.querySelector<HTMLElement>('[data-card-unit="pdf-back"]');
      if (!front || !back) throw new Error('Kartu belum siap');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = 210;
      const x = (pageW - cfg.mm.w) / 2;
      const gap = 14;
      const y1 = 40;
      const y2 = y1 + cfg.mm.h + gap;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.text('KARTU PELAJAR', pageW / 2, 20, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(100);
      pdf.text(toTitleCase(student.full_name), pageW / 2, 26, { align: 'center' });
      pdf.text('Cetak pada kertas ukuran asli, lalu gunting mengikuti garis tepi kartu.', pageW / 2, 31, { align: 'center' });

      for (const [el, y, label] of [[front, y1, 'Tampak depan'], [back, y2, 'Tampak belakang']] as const) {
        const canvas = await html2canvas(el, { scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false });
        pdf.setFontSize(7);
        pdf.setTextColor(140);
        pdf.text(label, x, y - 2);
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, cfg.mm.w, cfg.mm.h);
        pdf.setDrawColor(190);
        pdf.setLineDashPattern([1.2, 1.2], 0);
        pdf.roundedRect(x, y, cfg.mm.w, cfg.mm.h, 3, 3);
        pdf.setLineDashPattern([], 0);
      }
      pdf.save(`kartu-pelajar-${String(student.nis || 'siswa')}.pdf`);
      toast.success('PDF kartu pelajar berhasil dibuat');
    } catch (e: any) {
      console.error(e);
      toast.error('Gagal membuat PDF: ' + (e?.message || 'terjadi kesalahan'));
    } finally {
      area.setAttribute('style', prev);
      setBusy(false);
    }
  };

  const cardCss = `
    .sic-card { position: relative; width: ${cfg.px.w}px; height: ${cfg.px.h}px; border-radius: 12px; background: #fff; overflow: hidden; box-sizing: border-box; font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #0f172a; border: 1px solid #e2e8f0; }
    .idc-bg { position: absolute; top: 0; right: 0; width: 62%; height: 100%; object-fit: cover; opacity: .16; }
    .idc-bg-fade { position: absolute; inset: 0; background: linear-gradient(90deg, #fff 32%, rgba(255,255,255,.6) 62%, rgba(255,255,255,.05) 100%); }
    .idc-dots { width: 52px; height: 30px; background-image: radial-gradient(${cardColor} 0.8px, transparent 1.4px); background-size: 5px 5px; z-index: 1; }
    .idc-ring { width: 56px; height: 56px; border: 1.5px solid; border-radius: 50%; opacity: .22; z-index: 1; }
    .idc-ring-sm { width: 34px; height: 34px; opacity: .18; }
    .idc-header-panel { position: absolute; left: -16px; top: 0; bottom: 0; width: 60%; transform: skewX(-14deg); border-bottom-right-radius: 12px; box-shadow: 0 2px 6px rgba(15,23,42,.18); }
    .idc-header-sheen { position: absolute; left: -16px; top: 0; bottom: 0; width: 26%; transform: skewX(-14deg); background: linear-gradient(90deg, rgba(255,255,255,.16), transparent); }
    .idc-header-accent { position: absolute; left: 34%; bottom: -3px; width: 64px; height: 3px; transform: skewX(-14deg); border-radius: 2px; opacity: .95; }
    .idc-header-content { position: absolute; left: 8px; top: 0; bottom: 0; display: flex; align-items: center; gap: 6px; }
    .idc-logo-wrap { width: 32px; height: 32px; border-radius: 50%; background: #fff; padding: 3px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
    .idc-logo-wrap img { width: 100%; height: 100%; object-fit: contain; }
    .idc-logo-fallback { width: 18px; height: 18px; }
    .idc-motto { font-size: 5.5px; color: rgba(255,255,255,.85); margin: 0; letter-spacing: .5px; }
    .idc-school { font-size: 9.5px; font-weight: 800; color: #fff; margin: 0; letter-spacing: .4px; }
    .idc-addrline { font-size: 5px; color: rgba(255,255,255,.8); margin: 0; }
    .idc-title-wrap { position: absolute; right: 10px; top: 7px; text-align: right; }
    .idc-title { font-size: 13px; font-weight: 800; margin: 0; letter-spacing: .8px; }
    .idc-subtitle { font-size: 5px; letter-spacing: 2.4px; margin: 1px 0 0; font-weight: 700; }
    .idc-title-line { height: 2px; margin: 3px 0 0 auto; border-radius: 2px; width: 84%; }
    .idc-footer-panel { position: absolute; right: -16px; top: 0; bottom: 0; width: 52%; transform: skewX(-14deg); border-top-left-radius: 10px; box-shadow: 0 -2px 6px rgba(15,23,42,.15); }
    .idc-footer-sheen { position: absolute; right: -16px; top: 0; bottom: 0; width: 20%; transform: skewX(-14deg); background: linear-gradient(270deg, rgba(255,255,255,.14), transparent); }
    .idc-footer-accent { position: absolute; right: 30%; top: -3px; width: 64px; height: 3px; transform: skewX(-14deg); border-radius: 2px; opacity: .95; }
    .idc-photo { border-radius: 8px; border: 3px solid; background: #fff; padding: 2px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(15,23,42,.18); }
    .idc-photo img { width: 100%; height: 100%; object-fit: cover; border-radius: 4px; }
    .idc-photo-fallback { width: 30px; height: 30px; color: #94a3b8; }
    .idc-info { min-width: 0; }
    .idc-row { display: flex; align-items: center; gap: 4px; margin-bottom: 3px; }
    .idc-chip { width: 12px; height: 12px; border-radius: 3px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .idc-ic { width: 8px; height: 8px; color: #fff; }
    .idc-label { width: 56px; font-size: 6.5px; color: #64748b; flex-shrink: 0; }
    .idc-val { font-size: 7.5px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .idc-val-multi { white-space: normal; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.25; }
    .idc-name { font-size: 8px; font-weight: 800; text-transform: uppercase; }
    .idc-printdate p { margin: 0; font-size: 5px; color: #64748b; }
    .idc-sign-area { width: 120px; text-align: center; }
    .idc-sign-area p { margin: 0; }
    .idc-sign-jab { font-size: 6px; color: #334155; }
    .idc-sign-space { position: relative; height: 24px; margin: 1px 0; }
    .idc-signature { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); max-height: 20px; max-width: 56px; object-fit: contain; }
    .idc-sign-name { font-weight: 700; font-size: 6px; text-decoration: underline; color: #0f172a; }
    .idc-nip { font-size: 5.5px; color: #475569; }
    .idc-stamp { max-height: 36px; max-width: 40px; object-fit: contain; opacity: .92; }
    .idb-band-top-sheen { background: linear-gradient(90deg, rgba(255,255,255,.16), transparent); }
    .idb-band-top-accent { width: 64px; height: 3px; transform: skewX(-14deg); border-radius: 2px; opacity: .95; }
    .idb-band-bottom-sheen { background: linear-gradient(270deg, rgba(255,255,255,.14), transparent); }
    .idb-band-bottom-accent { width: 64px; height: 3px; transform: skewX(-14deg); border-radius: 2px; opacity: .95; }
    .idb-qr-box { background: #fff; border: 2px solid; border-radius: 10px; padding: 4px; box-sizing: border-box; box-shadow: 0 3px 8px rgba(15,23,42,.15); }
    .idb-qr-box img { width: 100%; height: 100%; display: block; }
    .idb-qr-label { font-size: 4.5px; margin: 3px 0 0; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; }
    .idb-barcode-box { background: #fff; border: 2px solid; border-radius: 8px; padding: 3px 8px 2px; text-align: center; box-shadow: 0 3px 8px rgba(15,23,42,.15); }
    .idb-barcode-box img { height: 20px; object-fit: contain; display: block; margin: 0 auto; }
    .idb-barcode-box p { margin: 1px 0 0; font-size: 4.5px; letter-spacing: 1.4px; color: #334155; font-weight: 700; }
    .sic-flip { position: relative; transform-style: preserve-3d; transition: transform .7s cubic-bezier(.2,.7,.2,1); }
    .sic-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
    .sic-face.sic-back { transform: rotateY(180deg); }
    @media (prefers-reduced-motion: reduce) { .sic-flip { transition: none; } }
  `;

  const w = cfg.px.w * scale;
  const h = cfg.px.h * scale;

  return (
    <div className="p-4 space-y-5">
      <style>{cardCss}</style>

      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Kartu Pelajar (OSIS)</h2>
        <p className="text-sm text-slate-500">Kartu identitas digital milikmu. Ketuk kartu untuk membalik.</p>
      </div>

      <div ref={boxRef} className="w-full">
        {!ready ? (
          <div className="flex items-center justify-center rounded-3xl bg-slate-100 dark:bg-slate-900" style={{ height: h || 214 }}>
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="relative mx-auto" style={{ width: w, height: h, perspective: 1400 }}>
            <button
              type="button"
              aria-label={side === 'front' ? 'Lihat sisi belakang kartu' : 'Lihat sisi depan kartu'}
              onClick={() => setSide((v) => (v === 'front' ? 'back' : 'front'))}
              className="block w-full h-full rounded-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E6FE0] focus-visible:ring-offset-2"
              style={{ boxShadow: '0 18px 40px -12px rgba(15,23,42,.45), 0 6px 14px -6px rgba(15,23,42,.25)' }}
            >
              <div className="sic-flip w-full h-full" style={{ transform: side === 'back' ? 'rotateY(180deg)' : 'none' }}>
                <div className="sic-face" style={{ width: w, height: h }}>
                  <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: cfg.px.w, height: cfg.px.h }}>{renderFront('view-front')}</div>
                </div>
                <div className="sic-face sic-back" style={{ width: w, height: h }}>
                  <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: cfg.px.w, height: cfg.px.h }}>{renderBack('view-back')}</div>
                </div>
              </div>
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-2">
        <div className="inline-flex rounded-full bg-slate-100 dark:bg-slate-800 p-1">
          {(['front', 'back'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setSide(k)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${side === k ? 'bg-white dark:bg-slate-700 shadow-sm text-[#1E6FE0]' : 'text-slate-500'}`}
            >
              {k === 'front' ? 'Depan' : 'Belakang'}
            </button>
          ))}
        </div>
        <Button variant="outline" size="icon" aria-label="Balik kartu" onClick={() => setSide((v) => (v === 'front' ? 'back' : 'front'))}>
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      <Button className="w-full rounded-2xl h-12 bg-[#1E6FE0] hover:bg-[#1a5fc0] text-white font-semibold" onClick={downloadPdf} disabled={!ready || busy}>
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
        Cetak / Unduh PDF
      </Button>
      <p className="text-xs text-center text-slate-400">PDF berukuran asli kartu (ukuran ID-1) pada kertas A4, siap dicetak dan digunting.</p>

      {/* Salinan ukuran asli di luar layar, dipakai untuk membuat PDF */}
      <div ref={captureRef} aria-hidden style={{ position: 'fixed', left: -10000, top: 0 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          {ready && renderFront('pdf-front')}
          {ready && renderBack('pdf-back')}
        </div>
      </div>
    </div>
  );
}
