'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Bot } from 'lucide-react';
import ChatWindow from '@/components/chat/ChatWindow';
import InputBar from '@/components/chat/InputBar';
import { getHistory, getTranscriptStatus, newSession } from '@/lib/api';
import { getToken, clearToken, getRole } from '@/lib/auth';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [transcriptReady, setTranscriptReady] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load history and transcript status on mount
  useEffect(() => {
    async function init() {
      try {
        const [histRes, transcriptRes] = await Promise.allSettled([
          getHistory(),
          getTranscriptStatus(),
        ]);

        if (histRes.status === 'fulfilled' && histRes.value.data.messages) {
          const msgs: Message[] = histRes.value.data.messages.map((m) => ({
            id: crypto.randomUUID(),
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: new Date(m.createdAt),
          }));
          setMessages(msgs);
        }

        if (transcriptRes.status === 'fulfilled') {
          setTranscriptReady(transcriptRes.value.data.status === 'ready');
        }
      } catch {
        // silently ignore
      }
    }
    init();
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', timestamp: new Date() },
    ]);

    abortRef.current = new AbortController();

    try {
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error('Stream error');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.type === 'delta' && parsed.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + parsed.content }
                    : m
                )
              );
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: 'Sorry, something went wrong. Please try again.' }
              : m
          )
        );
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, []);

  const handleLogout = useCallback(() => {
    clearToken();
    window.location.href = '/login';
  }, []);

  const startNewChat = useCallback(async () => {
    try {
      await newSession();
    } catch {
      // ignore
    }
    setMessages([]);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-[#003087] text-white px-4 h-16 flex items-center gap-3 shadow-sm shrink-0">
        <div className="flex items-center gap-2 flex-1">
          <div className="h-9 w-9 rounded-[6px] bg-[#FFB81C] flex items-center justify-center flex-shrink-0">
            <Bot className="text-[#003087]" size={20} strokeWidth={1.8} />
          </div>
          <div className="text-left">
            <div className="text-[16px] font-bold text-white leading-tight">NAU</div>
            <div className="text-[11px] font-normal text-white/70 leading-tight">AI Academic Advisor</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-white/70 hover:text-white border border-white/30 rounded px-2 py-1 transition-colors"
        >
          Sign Out
        </button>
      </header>
      <div className="h-[2px] bg-[#FFB81C] shrink-0" />

      {transcriptReady !== null && (
        <div
          className={`px-4 py-2 text-[13px] text-center shrink-0 border-b ${
            transcriptReady
              ? 'bg-[#f0f7f0] text-[#2d6a2d] border-[#b8d9b8]'
              : 'bg-[#fffbf0] text-[#7a5c00] border-[#e8d89a]'
          }`}
        >
          {transcriptReady
            ? '✓ Transcript uploaded — personalized academic advice is enabled.'
            : 'No transcript on file. Upload your transcript in your profile for personalized advice.'}
        </div>
      )}

      <div className="flex flex-col flex-1 max-w-3xl w-full mx-auto overflow-hidden">
        <ChatWindow messages={messages} loading={loading} />
        <InputBar onSend={sendMessage} onNewChat={startNewChat} disabled={loading} />
      </div>
    </div>
  );
}
