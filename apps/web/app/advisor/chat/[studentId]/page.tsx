'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getAdvisorChatHistory, advisorNewSession, advisorUploadTranscript } from '@/lib/api';
import { getToken } from '@/lib/auth';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function AdvisorChatPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const { data } = await getAdvisorChatHistory(studentId);
      setMessages(data.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })));
    } catch {
      setMessages([]);
    }
  }, [studentId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    let assistantContent = '';
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/advisor/chat/${studentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: userMsg }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No stream');

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const ev = JSON.parse(raw);
            if (ev.type === 'delta') {
              assistantContent = ev.content;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: 'assistant', content: assistantContent };
                return next;
              });
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: 'Error: could not get response.' };
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleNewSession() {
    try {
      await advisorNewSession(studentId);
      setMessages([]);
    } catch { /* ignore */ }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg('');
    try {
      await advisorUploadTranscript(studentId, file);
      setUploadMsg('Transcript uploaded. Processing...');
    } catch {
      setUploadMsg('Upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/advisor/students')}>
            ← Back
          </Button>
          <h1 className="text-lg font-semibold text-gray-900">AI Advisor Chat</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Upload Transcript'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleNewSession}>
            New Session
          </Button>
        </div>
      </div>

      {uploadMsg && (
        <p className="mb-2 text-sm text-blue-600">{uploadMsg}</p>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-4 mb-4">
        {messages.length === 0 && !loading && (
          <p className="text-center text-gray-400 text-sm py-8">
            Ask about this student&apos;s degree progress, next courses, or academic situation.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                m.role === 'user'
                  ? 'bg-[#003087] text-white whitespace-pre-wrap'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              {m.role === 'assistant' ? (
                m.content ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#003087] underline hover:text-[#002266]">
                          {children}
                        </a>
                      ),
                      ul: ({ children }) => <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>,
                      h2: ({ children }) => <h2 className="text-base font-semibold mt-3 mb-1">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
                      p: ({ children }) => <p className="my-1">{children}</p>,
                      table: ({ children }) => <table className="border-collapse my-2 text-xs w-full">{children}</table>,
                      th: ({ children }) => <th className="border border-gray-300 px-2 py-1 bg-gray-50 text-left font-medium">{children}</th>,
                      td: ({ children }) => <td className="border border-gray-300 px-2 py-1">{children}</td>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      hr: () => <hr className="my-2 border-gray-200" />,
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                ) : loading ? (
                  <div className="flex items-center gap-1 py-1">
                    <span className="h-2 w-2 rounded-full bg-[#003087]/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 rounded-full bg-[#003087]/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 rounded-full bg-[#003087]/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="ml-2 text-xs text-gray-400">Thinking...</span>
                  </div>
                ) : ''
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this student..."
          className="flex-1 min-h-[44px] max-h-32 resize-none"
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend(e as unknown as React.FormEvent);
            }
          }}
          disabled={loading}
        />
        <Button
          type="submit"
          className="bg-[#003087] hover:bg-[#002266] text-white self-end"
          disabled={loading || !input.trim()}
        >
          Send
        </Button>
      </form>

      <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleUpload} />
    </div>
  );
}
