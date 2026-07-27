'use client';

import { useState, useRef, useEffect, useCallback, ClipboardEvent, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requestOtp, verifyOtp } from '@/lib/api';
import { setToken } from '@/lib/auth';

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
    return /@(na\.edu|nau\.edu)(\.|$)/i.test(value) || value.endsWith('@na.edu') || value.endsWith('@nau.edu');
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!validateEmail(email)) {
      setError('Email must be a university address ending with @na.edu or @nau.edu');
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
      setToken(data.access_token, data.role);
      sessionStorage.setItem('role', data.role);
      if (data.role === 'admin') {
        router.push('/dashboard');
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
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-lg bg-[#003087] flex items-center justify-center">
            <span className="text-white font-bold text-lg">N</span>
          </div>
          <CardTitle className="text-2xl font-bold text-[#003087]">NAU AI Academic Advisor</CardTitle>
          <CardDescription>
            {step === 'email'
              ? 'Enter your university email to sign in'
              : `Enter the 6-digit code sent to ${email}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">University Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@nau.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
                <p className="text-xs text-gray-400">Must end with @na.edu or @nau.edu</p>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button
                type="submit"
                className="w-full bg-[#003087] hover:bg-[#002266] text-white"
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Send Code'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="space-y-5">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label>Verification Code</Label>
                  <span className={`text-xs font-mono ${countdown < 60 ? 'text-red-500' : 'text-gray-400'}`}>
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
                      className="w-11 h-12 text-center text-lg font-semibold border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003087] focus:border-transparent"
                      disabled={loading || countdown === 0}
                    />
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-red-500 text-center">{error}</p>}

              <Button
                type="submit"
                className="w-full bg-[#003087] hover:bg-[#002266] text-white"
                disabled={loading || digits.join('').length < OTP_LENGTH || countdown === 0}
              >
                {loading ? 'Verifying...' : 'Sign In'}
              </Button>

              <div className="flex justify-between items-center text-sm">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-gray-500"
                  onClick={() => { setStep('email'); setError(''); }}
                >
                  Back
                </Button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || loading}
                  className={`text-sm ${resendCooldown > 0 ? 'text-gray-300 cursor-not-allowed' : 'text-[#003087] hover:underline cursor-pointer'}`}
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
