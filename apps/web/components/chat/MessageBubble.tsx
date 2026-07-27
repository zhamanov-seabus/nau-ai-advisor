import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '@/app/(student)/chat/page';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex items-end gap-2 mb-4', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
          isUser ? 'bg-[#FFB81C] text-[#003087]' : 'bg-[#003087] text-white'
        )}
      >
        {isUser ? 'ME' : 'AI'}
      </div>

      <div
        className={cn(
          'max-w-[75%] px-4 py-3 rounded-2xl shadow-sm text-sm',
          isUser
            ? 'bg-[#003087] text-white rounded-br-sm'
            : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )}
        <p
          className={cn(
            'text-[10px] mt-1 select-none',
            isUser ? 'text-blue-200 text-right' : 'text-gray-400'
          )}
        >
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
        {!isUser && (
          <p className="text-[10px] text-gray-400 mt-1 select-none italic">
            AI-generated. Always verify with your academic advisor.
          </p>
        )}
      </div>
    </div>
  );
}
