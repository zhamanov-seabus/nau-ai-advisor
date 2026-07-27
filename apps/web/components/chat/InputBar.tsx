'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface InputBarProps {
  onSend: (text: string) => void;
  onNewChat: () => void;
  disabled: boolean;
}

export default function InputBar({ onSend, onNewChat, disabled }: InputBarProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      <div className="flex gap-2 items-end">
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question... (Enter to send, Shift+Enter for new line)"
          className="flex-1 resize-none min-h-[44px] max-h-32 text-sm"
          rows={1}
          disabled={disabled}
        />
        <div className="flex flex-col gap-1">
          <Button
            onClick={handleSend}
            disabled={disabled || !text.trim()}
            className="bg-[#003087] hover:bg-[#002266] text-white h-10 px-4"
          >
            Send
          </Button>
          <Button
            onClick={onNewChat}
            variant="outline"
            className="h-8 text-xs px-3 text-gray-500"
            disabled={disabled}
          >
            New Chat
          </Button>
        </div>
      </div>
    </div>
  );
}
