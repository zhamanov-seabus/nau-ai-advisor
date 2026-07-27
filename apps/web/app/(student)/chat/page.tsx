'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import ChatWindow from '@/components/chat/ChatWindow';
import InputBar from '@/components/chat/InputBar';
import { getHistory, getTranscriptStatus, newSession } from '@/lib/api';
import { getToken } from '@/lib/auth';

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
      <header className="bg-[#003087] text-white px-4 py-3 flex items-center gap-3 shadow shrink-0">
        <div className="h-8 w-8 rounded bg-[#FFB81C] flex items-center justify-center font-bold text-[#003087] text-sm">
          N
        </div>
        <h1 className="font-semibold text-lg flex-1">NAU Academic Advisor</h1>
      </header>

      {transcriptReady !== null && (
        <div
          className={`px-4 py-2 text-sm text-center shrink-0 ${
            transcriptReady
              ? 'bg-green-50 text-green-700 border-b border-green-200'
              : 'bg-yellow-50 text-yellow-700 border-b border-yellow-200'
          }`}
        >
          {transcriptReady
            ? 'Transcript uploaded — personalized academic advice is enabled.'
            : 'Transcript not uploaded. Upload your transcript for personalized advice.'}
        </div>
      )}

      <div className="flex flex-col flex-1 max-w-3xl w-full mx-auto overflow-hidden">
        <ChatWindow messages={messages} loading={loading} />
        <InputBar onSend={sendMessage} onNewChat={startNewChat} disabled={loading} />
      </div>
    </div>
  );
}
