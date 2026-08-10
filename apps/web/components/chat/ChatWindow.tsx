'use client';

import { useEffect, useRef } from 'react';
import { Bot } from 'lucide-react';
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
        <div className="flex flex-col items-center justify-center h-full text-center px-4">
          <div className="h-16 w-16 rounded-[10px] bg-[#003087] flex items-center justify-center mb-4 shadow-sm">
            <Bot className="text-[#FFB81C]" size={32} strokeWidth={1.5} />
          </div>
          <p className="text-[18px] font-semibold text-[#003087]">NAU Academic Advisor</p>
          <div className="w-10 h-[2px] bg-[#FFB81C] mx-auto my-2" />
          <p className="text-[14px] text-[#6B7280] max-w-xs">
            Ask me about degree requirements, course selection, registration deadlines, and more.
          </p>
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
