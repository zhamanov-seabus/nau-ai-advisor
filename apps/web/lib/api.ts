import axios from 'axios';
import { getToken, clearToken } from './auth';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — clear token and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearToken();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// --- Typed API helpers ---

export function requestOtp(email: string) {
  return api.post('/auth/request-otp', { email });
}

export function verifyOtp(email: string, code: string) {
  return api.post<{ access_token: string; refresh_token: string; user: { id: string; email: string; role: 'student' | 'admin' | 'advisor'; first_name: string } }>('/auth/verify-otp', { email, code });
}

export function getHistory() {
  return api.get<{ messages: Array<{ role: string; content: string; createdAt: string }> }>('/chat/history');
}

export function newSession() {
  return api.post<{ sessionId: string }>('/chat/new-session');
}

export function getTranscriptStatus() {
  return api.get<{ status: 'ready' | 'not_uploaded' | 'processing' | 'error' }>('/transcript/me');
}

export interface StudentParams {
  page?: number;
  limit?: number;
  search?: string;
  department?: string;
}

export interface StudentDto {
  name: string;
  email: string;
  department: string;
}

export function getStudents(params?: StudentParams) {
  return api.get<{ data: Student[]; total: number; page: number; limit: number }>('/admin/students', { params });
}

export function createStudent(dto: StudentDto) {
  return api.post<Student>('/admin/students', dto);
}

export function deleteStudent(id: string) {
  return api.delete(`/admin/students/${id}`);
}

export function uploadTranscript(studentId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/admin/transcripts/${studentId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function deleteTranscript(studentId: string) {
  return api.delete(`/admin/transcripts/${studentId}`);
}

export function getTranscriptStatuses(params?: { page?: number; limit?: number; search?: string }) {
  return api.get<{ data: TranscriptRecord[]; total: number }>('/admin/transcripts', { params });
}

export function getKnowledge() {
  return api.get<KnowledgeDoc[]>('/admin/knowledge');
}

export function uploadKnowledge(file: File) {
  const form = new FormData();
  form.append('file', file);
  return api.post('/admin/knowledge/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function deleteKnowledge(id: string) {
  return api.delete(`/admin/knowledge/${id}`);
}

export function seedKnowledge() {
  return api.post('/admin/knowledge/seed');
}

export function getNAUKBContent() {
  return api.get<{ content: string }>('/admin/knowledge/nau-kb/content');
}

export function updateNAUKBContent(content: string) {
  return api.put<{ chunksCreated: number; sectionsProcessed: number }>(
    '/admin/knowledge/nau-kb/content',
    { content },
  );
}

// Shared types
export interface Student {
  id: string;
  name: string;
  email: string;
  department: string;
  status: string;
  role?: string;
  createdAt: string;
}

export function setUserRole(userId: string, role: string) {
  return api.patch(`/admin/users/${userId}/role`, { role });
}

export type TranscriptStatusValue = 'ready' | 'processing' | 'missing' | 'error';

export interface TranscriptRecord {
  studentId: string;
  studentName: string;
  email: string;
  status: TranscriptStatusValue;
  updatedAt?: string;
}

export interface KnowledgeDoc {
  id: string;
  filename: string;
  size?: number;
  status: string;
  chunkCount: number;
  description?: string;
  createdAt: string;
}

// --- Advisor API ---

export interface AdvisorStudent {
  id: string;
  name: string;
  email: string;
  department: string;
  transcriptStatus: string;
}

export function getAdvisorStudents() {
  return api.get<AdvisorStudent[]>('/advisor/students');
}

export function advisorCreateStudent(dto: { firstName: string; lastName: string; email: string; department?: string }) {
  return api.post<{ id: string; email: string }>('/advisor/students', dto);
}

export function advisorUploadTranscript(studentId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/advisor/upload/${studentId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function advisorDeleteTranscript(studentId: string) {
  return api.delete(`/advisor/upload/${studentId}`);
}

export function getAdvisorChatHistory(studentId: string) {
  return api.get<Array<{ role: string; content: string; createdAt: string }>>(`/advisor/chat/history/${studentId}`);
}

export function advisorNewSession(studentId: string) {
  return api.post(`/advisor/chat/new-session/${studentId}`);
}

export default api;
