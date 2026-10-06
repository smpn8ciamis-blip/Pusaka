export type PdfPaper = 'a4' | 'f4';
export type PdfOrientation = 'portrait' | 'landscape';

export const PAPER_LABEL: Record<PdfPaper, string> = {
  a4: 'A4 (210 × 297 mm)',
  f4: 'F4 / Folio (215 × 330 mm)',
};

/** Format untuk jsPDF (mm). F4 = 215 × 330 mm. */
export const paperFormat = (paper: PdfPaper): 'a4' | [number, number] => (paper === 'f4' ? [215, 330] : 'a4');
