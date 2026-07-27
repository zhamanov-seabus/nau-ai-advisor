// In-memory token storage (never persisted to localStorage)
let accessToken: string | null = null;
let userRole: 'student' | 'admin' | null = null;

export function getToken(): string | null {
  return accessToken;
}

export function setToken(token: string, role: 'student' | 'admin'): void {
  accessToken = token;
  userRole = role;
}

export function clearToken(): void {
  accessToken = null;
  userRole = null;
}

export function getRole(): 'student' | 'admin' | null {
  return userRole;
}

export function isAuthenticated(): boolean {
  return accessToken !== null;
}
