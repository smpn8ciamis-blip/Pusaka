import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Button } from '@/components/ui/button';
import { Bold, Italic, Underline as UIcon, List, ListOrdered, Image as ImgIcon, Link as LinkIcon, Undo, Redo, Heading2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { SymbolPalette } from '@/components/cbt/SymbolPalette';
import { compressAndUploadQuestionImage } from '@/lib/driveImage';
import { driveFileId, driveFallbackUrl, driveImageUrl } from '@/lib/driveLinks';

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
  /** Mode ringkas (pilihan jawaban): hanya tebal/miring/garis bawah dan Upload gambar. */
  compact?: boolean;
}

/** Gambar tertanam (data:/file:/blob:) pada HTML tempelan dibuang: harus lewat unggah agar terkompres dan tersimpan di Drive. */
const EMBEDDED_IMG_RE = /<img\b[^>]*\bsrc\s*=\s*(["'])(?:data:|file:|blob:)[^"']*\1[^>]*>/gi;

export function RichTextEditor({ value, onChange, placeholder, minHeight = '120px', className, compact }: Props) {
  const [uploading, setUploading] = useState(0);
  const filesRef = useRef<((files: File[], pos?: number) => void) | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      // allowBase64 tetap true agar gambar lama (base64) di soal yang sudah ada tidak hilang saat soal dibuka untuk diedit
      Image.configure({ inline: true, allowBase64: true, HTMLAttributes: { referrerpolicy: 'no-referrer' } }),
      Link.configure({ openOnClick: false }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2 bidi-auto',
          'min-h-[' + minHeight + ']'
        ),
        style: `min-height:${minHeight}`,
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        filesRef.current?.(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from((event as DragEvent).dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })?.pos;
        filesRef.current?.(files, pos);
        return true;
      },
      transformPastedHTML: (html) => {
        if (!EMBEDDED_IMG_RE.test(html)) return html;
        EMBEDDED_IMG_RE.lastIndex = 0;
        toast.warning('Gambar tertanam pada teks tempelan dilewati. Tempel gambarnya langsung (Ctrl+V) atau pakai tombol Upload agar terkompres dan tersimpan di Drive.');
        return html.replace(EMBEDDED_IMG_RE, '');
      },
    },
  });

  // Kompres → unggah ke Drive → sisipkan tautan Drive (bukan base64). Berkas diproses satu per satu.
  filesRef.current = async (files, pos) => {
    if (!editor) return;
    let at = pos;
    setUploading((n) => n + files.length);
    for (const f of files) {
      try {
        const r = await compressAndUploadQuestionImage(f);
        const insertAt = at ?? editor.state.selection.to;
        editor.chain().focus().insertContentAt(insertAt, { type: 'image', attrs: { src: r.url } }).run();
        at = undefined; // berkas berikutnya mengikuti kursor
        toast.success(`Gambar tersimpan di Drive (${Math.max(1, Math.round(r.bytes / 1024))} KB)`);
      } catch (e: any) {
        toast.error(e?.message || 'Gambar gagal diunggah');
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
    }
  };

  if (!editor) return null;

  const addImage = async () => {
    const url = window.prompt('URL gambar (https://...). Untuk gambar dari komputer/HP gunakan tombol Upload atau tempel langsung.');
    if (!url) return;
    const u = url.trim();
    if (/^data:image\//i.test(u)) {
      try { filesRef.current?.([new File([await (await fetch(u)).blob()], 'gambar', { type: u.slice(5, u.indexOf(';')) })]); }
      catch { toast.error('Gambar base64 tidak dapat dibaca.'); }
      return;
    }
    if (!/^https:\/\//i.test(u)) { toast.error('URL harus diawali https://'); return; }
    editor.chain().focus().setImage({ src: u }).run();
  };

  const addLink = () => {
    const url = window.prompt('URL link:');
    if (url) editor.chain().focus().setLink({ href: url }).run();
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) filesRef.current?.(files);
  };

  return (
    <div className={cn('border rounded-md bg-background', className)}>
      <div className="flex flex-wrap gap-1 border-b p-1 bg-muted/30">
        <Button type="button" size="sm" variant={editor.isActive('bold') ? 'default' : 'ghost'} className="h-7 w-7 p-0" onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="sm" variant={editor.isActive('italic') ? 'default' : 'ghost'} className="h-7 w-7 p-0" onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="sm" variant={editor.isActive('underline') ? 'default' : 'ghost'} className="h-7 w-7 p-0" onClick={() => editor.chain().focus().toggleUnderline().run()}><UIcon className="h-3.5 w-3.5" /></Button>
        {!compact && (<>
        <Button type="button" size="sm" variant={editor.isActive('heading', { level: 2 }) ? 'default' : 'ghost'} className="h-7 w-7 p-0" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="sm" variant={editor.isActive('bulletList') ? 'default' : 'ghost'} className="h-7 w-7 p-0" onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="sm" variant={editor.isActive('orderedList') ? 'default' : 'ghost'} className="h-7 w-7 p-0" onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={addLink}><LinkIcon className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={addImage}><ImgIcon className="h-3.5 w-3.5" /></Button>
        </>)}
        <label className={cn('inline-flex items-center justify-center h-7 px-2 text-xs rounded hover:bg-accent cursor-pointer', uploading > 0 && 'opacity-60 pointer-events-none')}>
          {uploading > 0 ? `Mengunggah… (${uploading})` : 'Upload'}
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageFile} />
        </label>
        {!compact && (
        <div className="ml-auto flex gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => editor.chain().focus().undo().run()}><Undo className="h-3.5 w-3.5" /></Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => editor.chain().focus().redo().run()}><Redo className="h-3.5 w-3.5" /></Button>
        </div>
        )}
      </div>
      <SymbolPalette className="border-b p-1" onInsert={(t) => editor.chain().focus().insertContent(t).run()} />
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  );
}

/** Tambahkan referrerpolicy="no-referrer" pada setiap <img> (Google Drive kadang menolak hotlink ber-referrer). */
const withNoReferrer = (html: string) => html.replace(/<img\b(?![^>]*\breferrerpolicy\s*=)/gi, '<img referrerpolicy="no-referrer"');

export function RichTextDisplay({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Gambar Drive yang gagal dimuat: coba tautan cadangan, lalu satu kali ulang setelah jeda (error <img> tidak bubbling → fase capture).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onErr = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLImageElement)) return;
      const id = driveFileId(t.currentSrc || t.src);
      if (!id) return;
      const step = Number(t.dataset.fb || '0');
      if (step === 0) { t.dataset.fb = '1'; t.src = driveFallbackUrl(id); }
      else if (step === 1) { t.dataset.fb = '2'; window.setTimeout(() => { t.src = driveImageUrl(id) + '=w1280'; }, 2500); }
    };
    el.addEventListener('error', onErr, true);
    return () => el.removeEventListener('error', onErr, true);
  }, []);
  return <div ref={ref} className={cn('prose prose-sm dark:prose-invert max-w-none bidi-auto', className)} dangerouslySetInnerHTML={{ __html: withNoReferrer(html || '') }} />;
}
