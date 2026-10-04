import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Button } from '@/components/ui/button';
import { Bold, Italic, Underline as UIcon, List, ListOrdered, Image as ImgIcon, Link as LinkIcon, Undo, Redo, Heading2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
}

export function RichTextEditor({ value, onChange, placeholder, minHeight = '120px', className }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.configure({ inline: true, allowBase64: true }),
      Link.configure({ openOnClick: false }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2',
          'min-h-[' + minHeight + ']'
        ),
        style: `min-height:${minHeight}`,
      },
    },
  });

  if (!editor) return null;

  const addImage = () => {
    const url = window.prompt('URL gambar atau base64:');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  const addLink = () => {
    const url = window.prompt('URL link:');
    if (url) editor.chain().focus().setLink({ href: url }).run();
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      editor.chain().focus().setImage({ src: result }).run();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className={cn('border rounded-md bg-background', className)}>
      <div className="flex flex-wrap gap-1 border-b p-1 bg-muted/30">
        <Button type="button" size="sm" variant={editor.isActive('bold') ? 'default' : 'ghost'} className="h-7 w-7 p-0" onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="sm" variant={editor.isActive('italic') ? 'default' : 'ghost'} className="h-7 w-7 p-0" onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="sm" variant={editor.isActive('underline') ? 'default' : 'ghost'} className="h-7 w-7 p-0" onClick={() => editor.chain().focus().toggleUnderline().run()}><UIcon className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="sm" variant={editor.isActive('heading', { level: 2 }) ? 'default' : 'ghost'} className="h-7 w-7 p-0" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="sm" variant={editor.isActive('bulletList') ? 'default' : 'ghost'} className="h-7 w-7 p-0" onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="sm" variant={editor.isActive('orderedList') ? 'default' : 'ghost'} className="h-7 w-7 p-0" onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={addLink}><LinkIcon className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={addImage}><ImgIcon className="h-3.5 w-3.5" /></Button>
        <label className="inline-flex items-center justify-center h-7 px-2 text-xs rounded hover:bg-accent cursor-pointer">
          Upload
          <input type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
        </label>
        <div className="ml-auto flex gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => editor.chain().focus().undo().run()}><Undo className="h-3.5 w-3.5" /></Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => editor.chain().focus().redo().run()}><Redo className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  );
}

export function RichTextDisplay({ html, className }: { html: string; className?: string }) {
  return <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)} dangerouslySetInnerHTML={{ __html: html || '' }} />;
}
