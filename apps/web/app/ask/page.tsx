'use client';

import { useState, useRef, useEffect, useCallback, ClipboardEvent, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Step = 'email' | 'otp' | 'chat';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;
const OTP_EXPIRE = 10 * 60;
const MAX_MESSAGES = 30;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function AskPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(OTP_EXPIRE);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessionToken, setSessionToken] = useState('');
  const [messageCount, setMessageCount] = useState(0);
  const [hasTranscript, setHasTranscript] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore session from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem('public_advisor_token');
    if (stored) {
      setSessionToken(stored);
      setStep('chat');
      fetchSessionInfo(stored);
    }
  }, []);

  // OTP countdown timer
  useEffect(() => {
    if (step !== 'otp') return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  // Resend cooldown timer
  useEffect(() => {
    if (step !== 'otp' || resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step, resendCooldown]);

  // Auto-scroll chat
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function fetchSessionInfo(token: string) {
    try {
      const res = await fetch(`${API_BASE}/public/advisor/session-info`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessageCount(data.messageCount ?? 0);
        setHasTranscript(data.hasTranscript ?? false);
      }
    } catch { /* ignore */ }
  }

  function validateEmail(value: string): boolean {
    const lower = value.toLowerCase();
    if (lower === 'redacted@na.edu') return true;
    const domain = lower.split('@')[1];
    return domain === 'na.edu' || (domain?.endsWith('.na.edu') ?? false);
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!validateEmail(email)) {
      setError('Only NAU students (@na.edu) can use this service');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/public/advisor/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to send code');
      setStep('otp');
      setCountdown(OTP_EXPIRE);
      setResendCooldown(RESEND_COOLDOWN);
      setDigits(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch (err) {
      setError((err as Error).message || 'Failed to send code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/public/advisor/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to resend code');
      setCountdown(OTP_EXPIRE);
      setResendCooldown(RESEND_COOLDOWN);
      setDigits(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch (err) {
      setError((err as Error).message || 'Failed to resend code.');
    } finally {
      setLoading(false);
    }
  }

  const handleDigitChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleKeyDown = useCallback((index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }, [digits]);

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = Array(OTP_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[focusIdx]?.focus();
  }, []);

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = digits.join('');
    if (code.length < OTP_LENGTH) {
      setError('Please enter the 6-digit code.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/public/advisor/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Invalid code');
      setSessionToken(data.sessionToken);
      sessionStorage.setItem('public_advisor_token', data.sessionToken);
      setStep('chat');
      setMessages([]);
      setMessageCount(0);
    } catch (err) {
      setError((err as Error).message || 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setStreaming(true);
    setMessageCount((prev) => prev + 1);

    let assistantContent = '';
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch(`${API_BASE}/public/advisor/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ message: userMsg }),
      });

      if (res.status === 401) {
        sessionStorage.removeItem('public_advisor_token');
        setStep('email');
        setError('Session expired. Please verify your email again.');
        return;
      }

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
            } else if (ev.type === 'error') {
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: 'assistant', content: ev.message };
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
      setStreaming(false);
    }
  }

  async function handleNewSession() {
    try {
      await fetch(`${API_BASE}/public/advisor/new-session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      setMessages([]);
      setMessageCount(0);
      setHasTranscript(false);
      setUploadMsg('');
    } catch { /* ignore */ }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/public/advisor/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Upload failed');
      setHasTranscript(true);
      setUploadMsg('Transcript loaded successfully.');
    } catch (err) {
      setUploadMsg((err as Error).message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // --- Render ---

  if (step === 'chat') {
    return (
      <div className="flex flex-col h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-8 w-8 rounded-[5px] bg-[#003087] flex items-center justify-center flex-shrink-0">
                  <Bot className="text-white" size={18} strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] sm:text-[15px] font-bold text-[#003087] leading-tight truncate">NAU AI Advisor</div>
                  <div className="text-[10px] sm:text-[11px] text-[#6B7280] truncate">{email}</div>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                {hasTranscript && (
                  <span className="hidden sm:inline text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    Transcript loaded
                  </span>
                )}
                <span className="text-[10px] sm:text-[11px] text-[#6B7280] font-mono">
                  {messageCount}/{MAX_MESSAGES}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] sm:text-xs h-6 sm:h-7 px-1.5 sm:px-3"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? '...' : 'Upload'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] sm:text-xs h-6 sm:h-7 px-1.5 sm:px-3"
                  onClick={handleNewSession}
                >
                  New
                </Button>
              </div>
            </div>
            {hasTranscript && (
              <div className="sm:hidden mt-1">
                <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  Transcript loaded
                </span>
              </div>
            )}
          </div>
        </div>

        {uploadMsg && (
          <div className="max-w-3xl mx-auto w-full px-4 pt-2">
            <p className="text-sm text-blue-600">{uploadMsg}</p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
            {messages.length === 0 && !streaming && (
              <div className="text-center py-16">
                <div className="h-14 w-14 rounded-xl bg-[#003087]/10 flex items-center justify-center mx-auto mb-4">
                  <Bot className="text-[#003087]" size={28} strokeWidth={1.5} />
                </div>
                <h2 className="text-lg font-semibold text-gray-800 mb-2">How can I help you today?</h2>
                <p className="text-sm text-[#6B7280] max-w-md mx-auto">
                  Ask me anything about NAU programs, degree requirements, course selection, or registration deadlines. Upload your transcript for personalized advice.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
                  {[
                    'What programs does NAU offer?',
                    'How do I register for classes?',
                    'What are the graduation requirements?',
                    'Tell me about financial aid',
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); }}
                      className="text-xs px-3 py-2 bg-white border border-gray-200 rounded-full text-[#003087] hover:bg-[#003087]/5 hover:border-[#003087]/30 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] sm:max-w-[80%] min-w-0">
                  <div
                    className={`rounded-lg px-4 py-2 text-sm break-words overflow-hidden ${
                      m.role === 'user'
                        ? 'bg-[#003087] text-white whitespace-pre-wrap'
                        : 'bg-white border border-gray-200 text-gray-900 shadow-sm'
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
                      ) : streaming ? (
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
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Disclaimer + Input */}
        <div className="bg-white border-t border-gray-200 px-4 py-3">
          <div className="max-w-3xl mx-auto">
            {messageCount >= MAX_MESSAGES ? (
              <div className="text-center py-2">
                <p className="text-sm text-red-600 mb-2">Message limit reached. Please start a new conversation.</p>
                <Button size="sm" onClick={handleNewSession}>New Conversation</Button>
              </div>
            ) : (
              <form onSubmit={handleSend} className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about your degree, courses, requirements..."
                  className="flex-1 min-h-[44px] max-h-32 resize-none"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e as unknown as React.FormEvent);
                    }
                  }}
                  disabled={streaming}
                />
                <Button
                  type="submit"
                  className="bg-[#003087] hover:bg-[#002266] text-white self-end"
                  disabled={streaming || !input.trim()}
                >
                  Send
                </Button>
              </form>
            )}
            <p className="text-[10px] text-center text-[#9CA3AF] mt-2">
              This is an AI assistant. For official advising, schedule an appointment with your academic advisor.
            </p>
          </div>
        </div>

        <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleUpload} />
      </div>
    );
  }

  // --- Email / OTP steps ---
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="text-center pb-6">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-[6px] bg-[#003087] flex items-center justify-center flex-shrink-0">
              <Bot className="text-white" size={22} strokeWidth={1.8} />
            </div>
            <div className="text-left">
              <div className="text-[18px] font-bold text-[#003087] leading-tight">NAU</div>
              <div className="text-[12px] font-normal text-[#6B7280] leading-tight">AI Academic Advisor</div>
            </div>
          </div>

          {step === 'email' && (
            <>
              <h1 className="text-[28px] font-bold text-[#003087] tracking-tight leading-tight">
                AI Academic Advisor
              </h1>
              <div className="w-12 h-[3px] bg-[#FFB81C] mx-auto mt-2 mb-3" />
              <p className="text-[15px] text-[#6B7280] mt-1">
                Get instant answers about your degree, courses, and registration deadlines.
              </p>
            </>
          )}
          {step === 'otp' && (
            <p className="text-[15px] text-[#6B7280]">
              Enter the 6-digit code sent to {email}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[14px] font-medium text-[#374151]">University Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@na.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="h-11 text-base border-[#D1D5DB] rounded-lg focus:border-[#003087] focus:ring-2 focus:ring-[#003087]/15"
                  style={{ fontSize: '16px' }}
                />
                <p className="text-xs text-[#6B7280]">Use your NAU email (@na.edu)</p>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button
                type="submit"
                className="w-full h-11 bg-[#003087] hover:bg-[#002470] text-white text-[15px] font-semibold tracking-wide rounded-lg"
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Get Started'}
              </Button>
              <p className="text-xs text-center text-[#6B7280]">We&apos;ll send a 6-digit verification code to your email</p>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="space-y-5">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="text-[14px] font-medium text-[#374151]">Verification Code</Label>
                  <span className={`text-xs font-mono ${countdown < 60 ? 'text-red-500' : 'text-[#6B7280]'}`}>
                    {countdown > 0 ? formatTime(countdown) : 'Expired'}
                  </span>
                </div>
                <div className="flex gap-2 justify-center">
                  {digits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      onPaste={handlePaste}
                      className="w-11 h-12 text-center text-lg font-semibold border border-[#D1D5DB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFB81C] focus:border-[#003087]"
                      style={{ fontSize: '16px' }}
                      disabled={loading || countdown === 0}
                    />
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-red-500 text-center">{error}</p>}

              <Button
                type="submit"
                className="w-full h-11 bg-[#003087] hover:bg-[#002470] text-white text-[15px] font-semibold tracking-wide rounded-lg"
                disabled={loading || digits.join('').length < OTP_LENGTH || countdown === 0}
              >
                {loading ? 'Verifying...' : 'Verify & Start'}
              </Button>

              <div className="flex justify-between items-center text-sm">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-[#6B7280]"
                  onClick={() => { setStep('email'); setError(''); }}
                >
                  Back
                </Button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || loading}
                  className={`text-sm ${resendCooldown > 0 ? 'text-[#D1D5DB] cursor-not-allowed' : 'text-[#003087] hover:underline cursor-pointer'}`}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
