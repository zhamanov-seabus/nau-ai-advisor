'use client';

import { useEffect, useRef } from 'react';
import type { Message } from '@/app/(student)/chat/page';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';

interface ChatWindowProps {
  messages: Message[];
  loading: boolean;
}

export default function ChatWindow({ messages, loading }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
          <div className="h-16 w-16 rounded-full bg-[#003087] flex items-center justify-center mb-4">
            <span className="text-white font-bold text-2xl">N</span>
          </div>
          <p className="text-lg font-medium text-gray-600">Welcome to NAU Academic Advisor</p>
          <p className="text-sm mt-1">Ask me anything about your studies, enrollment, or campus life.</p>
        </div>
      )}

      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {loading && <TypingIndicator />}

      <div ref={bottomRef} />
    </div>
  );
}
