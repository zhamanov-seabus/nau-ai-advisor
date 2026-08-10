'use client';

import { useState, useRef, useEffect, useCallback, ClipboardEvent, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requestOtp, verifyOtp } from '@/lib/api';
import { setToken } from '@/lib/auth';
import { Bot } from 'lucide-react';

type Step = 'email' | 'otp';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60; // seconds
const OTP_EXPIRE = 10 * 60; // 10 minutes in seconds

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(OTP_EXPIRE);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer when OTP step is active
  useEffect(() => {
    if (step !== 'otp') return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
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
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step, resendCooldown]);

  function validateEmail(value: string): boolean {
    const allowed = ['nau.edu', 'na.edu', 'student.na.edu', 'gmail.com'];
    return allowed.some((d) => value.toLowerCase().endsWith('@' + d));
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!validateEmail(email)) {
      setError('Please use your NAU email (@nau.edu or @na.edu)');
      return;
    }
    setLoading(true);
    try {
      await requestOtp(email);
      setStep('otp');
      setCountdown(OTP_EXPIRE);
      setResendCooldown(RESEND_COOLDOWN);
      setDigits(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setError('');
    setLoading(true);
    try {
      await requestOtp(email);
      setCountdown(OTP_EXPIRE);
      setResendCooldown(RESEND_COOLDOWN);
      setDigits(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to resend OTP.');
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
      const { data } = await verifyOtp(email, code);
      setToken(data.access_token, data.user.role);
      if (data.user.role === 'admin') {
        router.push('/dashboard');
      } else if (data.user.role === 'advisor') {
        router.push('/advisor/students');
      } else {
        router.push('/chat');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="text-center pb-6">
          {/* Combo logo: icon + text */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-[6px] bg-[#003087] flex items-center justify-center flex-shrink-0">
              <Bot className="text-white" size={22} strokeWidth={1.8} />
            </div>
            <div className="text-left">
              <div className="text-[18px] font-bold text-[#003087] leading-tight">NAU</div>
              <div className="text-[12px] font-normal text-[#6B7280] leading-tight">AI Academic Advisor</div>
            </div>
          </div>

          {/* Title with gold accent */}
          {step === 'email' && (
            <>
              <h1 className="text-[28px] font-bold text-[#003087] tracking-tight leading-tight">
                Academic Advisor
              </h1>
              <div className="w-12 h-[3px] bg-[#FFB81C] mx-auto mt-2 mb-3" />
              <p className="text-[15px] text-[#6B7280] mt-1">
                Get instant answers about your degree requirements, course selection, and registration deadlines.
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
                {loading ? 'Sending...' : 'Send Code'}
              </Button>
              <p className="text-xs text-center text-[#6B7280]">We&apos;ll send a 6-digit code to your email</p>
              <div className="mt-6 pt-4 border-t border-gray-200 text-center">
                <p className="text-sm text-[#6B7280] mb-2">Just have a quick question?</p>
                <a href="/ask" className="text-sm font-medium text-[#003087] hover:underline">
                  Ask our AI Academic Advisor →
                </a>
              </div>
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
                {loading ? 'Verifying...' : 'Sign In'}
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
