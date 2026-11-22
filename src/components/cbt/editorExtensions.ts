// Tambahan editor soal: pangkat/indeks dan tabel sederhana. Tanpa ini, soal hasil tempel Word yang berisi
// tabel atau H₂O/x² akan kehilangan bentuknya begitu dibuka dan disimpan ulang di editor.
import { Mark, Node, mergeAttributes } from '@tiptap/core';

export const Superscript = Mark.create({
  name: 'superscript',
  excludes: 'subscript',
  parseHTML() { return [{ tag: 'sup' }]; },
  renderHTML({ HTMLAttributes }) { return ['sup', mergeAttributes(HTMLAttributes), 0]; },
});

export const Subscript = Mark.create({
  name: 'subscript',
  excludes: 'superscript',
  parseHTML() { return [{ tag: 'sub' }]; },
  renderHTML({ HTMLAttributes }) { return ['sub', mergeAttributes(HTMLAttributes), 0]; },
});

const spanAttr = (name: 'colspan' | 'rowspan') => ({
  default: 1,
  parseHTML: (el: HTMLElement) => { const n = parseInt(el.getAttribute(name) || '1', 10); return n > 1 ? n : 1; },
  renderHTML: (attrs: Record<string, unknown>) => (Number(attrs[name]) > 1 ? { [name]: attrs[name] } : {}),
});

/** Tabel: pengeditan teks di dalam sel; baris/kolom tidak dapat ditambah dari editor (tabel datang dari tempelan Word). */
export const CbtTable = Node.create({
  name: 'table',
  group: 'block',
  content: 'tableRow+',
  isolating: true,
  parseHTML() { return [{ tag: 'table' }]; },
  renderHTML({ HTMLAttributes }) { return ['table', mergeAttributes(HTMLAttributes), ['tbody', 0]]; },
});

export const CbtTableRow = Node.create({
  name: 'tableRow',
  content: 'tableCell+',
  parseHTML() { return [{ tag: 'tr' }]; },
  renderHTML({ HTMLAttributes }) { return ['tr', mergeAttributes(HTMLAttributes), 0]; },
});

export const CbtTableCell = Node.create({
  name: 'tableCell',
  content: 'block+',
  isolating: true,
  addAttributes() { return { colspan: spanAttr('colspan'), rowspan: spanAttr('rowspan') }; },
  parseHTML() { return [{ tag: 'td' }, { tag: 'th' }]; },
  renderHTML({ HTMLAttributes }) { return ['td', mergeAttributes(HTMLAttributes), 0]; },
});
