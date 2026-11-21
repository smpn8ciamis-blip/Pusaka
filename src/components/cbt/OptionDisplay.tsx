import { RichTextDisplay } from '@/components/cbt/RichTextEditor';
import { isRichOption } from '@/lib/cbtOption';
import { rewriteImages } from '@/lib/cbtLocal';

/** Isi satu pilihan jawaban: teks biasa (data lama) atau HTML dengan gambar. */
export function OptionDisplay({ value, imageMap, className }: { value: string; imageMap?: Record<string, string>; className?: string }) {
  if (!isRichOption(value)) return <span className={className ? className + ' whitespace-pre-line' : 'whitespace-pre-line'}>{value}</span>;
  const html = imageMap ? rewriteImages(value, imageMap) : value;
  return (
    <RichTextDisplay
      html={html}
      className={'inline-block align-top max-w-full [&_p]:my-0 [&_img]:my-1 [&_img]:max-h-64 [&_img]:max-w-full [&_img]:rounded ' + (className || '')}
    />
  );
}
