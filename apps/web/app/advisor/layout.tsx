'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getToken, getRole, clearToken } from '@/lib/auth';
import { Button } from '@/components/ui/button';

const navLinks = [
  { href: '/advisor/students', label: 'Students' },
];

export default function AdvisorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = getToken();
    const role = getRole();
    if (!token || role !== 'advisor') {
      router.replace('/login');
    }
  }, [router]);

  function handleLogout() {
    clearToken();
    router.replace('/login');
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="hidden sm:flex w-56 bg-[#003087] text-white flex-col">
        <div className="px-4 py-5 border-b border-blue-800">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded bg-[#FFB81C] flex items-center justify-center font-bold text-[#003087] text-sm">
              N
            </div>
            <span className="font-bold text-sm">NAU Advisor</span>
          </div>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                pathname.startsWith(link.href)
                  ? 'bg-blue-800 text-white'
                  : 'text-blue-100 hover:bg-blue-800 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-blue-800">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-blue-100 hover:text-white hover:bg-blue-800"
            onClick={handleLogout}
          >
            Log out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-3 sm:p-6">{children}</main>
    </div>
  );
}
