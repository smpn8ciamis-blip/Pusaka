import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "chatbot_messages_v1";
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant`;

function loadMessages(): UIMessage[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

type Props = { botName: string; welcome: string };

export default function ChatbotWidget({ botName, welcome }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [initial] = useState<UIMessage[]>(() => loadMessages());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const transport = useRef(new DefaultChatTransport({
    api: CHAT_URL,
    headers: { Authorization: `Bearer ${(supabase as any).supabaseKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
  })).current;

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: "public-chat",
    messages: initial,
    transport,
  });

  useEffect(() => {
    if (messages.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 100); }, [open]);

  const busy = status === "submitted" || status === "streaming";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = input.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
    setInput("");
  };

  const clear = () => { setMessages([]); localStorage.removeItem(STORAGE_KEY); };

  const partsText = (m: UIMessage) => m.parts.map(p => (p.type === "text" ? p.text : "")).join("");

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed z-40 bottom-5 right-5 md:bottom-8 md:right-8 group"
          aria-label="Buka chatbot"
        >
          <span className="absolute inset-0 rounded-full bg-blue-500/40 animate-ping" />
          <span className="relative flex items-center gap-2 rounded-full bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] text-white pl-4 pr-5 py-3 shadow-2xl shadow-blue-500/40 border border-white/20 hover:scale-105 transition">
            <MessageCircle className="h-5 w-5" />
            <span className="hidden sm:inline font-semibold text-sm">Tanya {botName}</span>
          </span>
        </button>
      )}

      {open && (
        <div className="fixed z-50 inset-x-3 bottom-3 md:inset-auto md:bottom-6 md:right-6 md:w-[380px] md:h-[560px] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-gradient-to-r from-[#1E40AF] to-[#3B82F6] text-white">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center shrink-0"><Sparkles className="h-4 w-4" /></div>
              <div className="min-w-0">
                <div className="font-bold text-sm truncate">{botName}</div>
                <div className="text-[11px] text-blue-100 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Online</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={clear} className="text-[11px] px-2 py-1 rounded hover:bg-white/10">Bersihkan</button>
              )}
              <button onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-white/10" aria-label="Tutup"><X className="h-4 w-4" /></button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
            {messages.length === 0 && (
              <div className="text-sm text-slate-600 bg-white rounded-2xl rounded-tl-sm p-3 shadow-sm border border-slate-100">
                {welcome}
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] text-sm leading-relaxed rounded-2xl px-3.5 py-2.5 shadow-sm ${
                  m.role === "user"
                    ? "bg-[#1E40AF] text-white rounded-tr-sm"
                    : "bg-white text-slate-800 border border-slate-100 rounded-tl-sm"
                }`}>
                  {m.role === "user"
                    ? <span className="whitespace-pre-wrap">{partsText(m)}</span>
                    : <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-a:text-[#1E40AF]"><ReactMarkdown>{partsText(m)}</ReactMarkdown></div>}
                </div>
              </div>
            ))}
            {status === "submitted" && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                Terjadi kesalahan. Coba lagi.
              </div>
            )}
          </div>

          <form onSubmit={submit} className="flex items-center gap-2 p-3 border-t bg-white">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tulis pertanyaan…"
              className="flex-1 px-3 py-2 text-sm rounded-full border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1E40AF]/30 focus:border-[#1E40AF]"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="h-10 w-10 shrink-0 rounded-full bg-[#1E40AF] text-white flex items-center justify-center disabled:opacity-50 hover:bg-[#1E3A8A] transition"
              aria-label="Kirim"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
