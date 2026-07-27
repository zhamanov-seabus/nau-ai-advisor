'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getRole } from '@/lib/auth';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    const role = getRole();
    if (!token || role !== 'student') {
      router.replace('/login');
    }
  }, [router]);

  return <>{children}</>;
}
