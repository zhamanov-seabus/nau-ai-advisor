const TOKEN_KEY = 'nau_access_token';
const ROLE_KEY = 'nau_user_role';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string, role: 'student' | 'admin' | 'advisor'): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ROLE_KEY, role);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
}

export function getRole(): 'student' | 'admin' | 'advisor' | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ROLE_KEY) as 'student' | 'admin' | 'advisor' | null;
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}
