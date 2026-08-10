'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { getAdvisorStudents, advisorUploadTranscript, advisorDeleteTranscript, advisorCreateStudent, type AdvisorStudent } from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  ready: 'bg-green-100 text-green-700',
  processing: 'bg-yellow-100 text-yellow-700',
  missing: 'bg-gray-100 text-gray-500',
  error: 'bg-red-100 text-red-700',
};

export default function AdvisorStudentsPage() {
  const router = useRouter();
  const [students, setStudents] = useState<AdvisorStudent[]>([]);
  const [filtered, setFiltered] = useState<AdvisorStudent[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [uploadStudentId, setUploadStudentId] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteStudentId, setDeleteStudentId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [addForm, setAddForm] = useState({ firstName: '', lastName: '', email: '', department: '' });

  async function fetchStudents() {
    setLoading(true);
    try {
      const { data } = await getAdvisorStudents();
      setStudents(data);
      setFiltered(data);
    } catch {
      // keep existing list on error — don't clear on transient failures
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchStudents(); }, []);

  useEffect(() => {
    if (!search) {
      setFiltered(students);
    } else {
      const q = search.toLowerCase();
      setFiltered(students.filter((s) =>
        s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
      ));
    }
  }, [search, students]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadStudentId) return;
    setUploadError('');
    setUploadLoading(true);
    try {
      await advisorUploadTranscript(uploadStudentId, file);
      setUploadStudentId(null);
      fetchStudents();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setUploadError(msg || 'Upload failed.');
    } finally {
      setUploadLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDelete() {
    if (!deleteStudentId) return;
    setDeleteLoading(true);
    try {
      await advisorDeleteTranscript(deleteStudentId);
      setDeleteStudentId(null);
      fetchStudents();
    } catch {
      // ignore
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);
    try {
      const { data } = await advisorCreateStudent({
        firstName: addForm.firstName,
        lastName: addForm.lastName,
        email: addForm.email,
        department: addForm.department || undefined,
      });
      setAddOpen(false);
      setAddForm({ firstName: '', lastName: '', email: '', department: '' });
      // Redirect straight to chat for this new student
      router.push(`/advisor/chat/${data.id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setAddError(msg || 'Failed to create student.');
    } finally {
      setAddLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Students</h1>
        <Button
          size="sm"
          className="bg-[#003087] hover:bg-[#002266] text-white"
          onClick={() => { setAddOpen(true); setAddError(''); }}
        >
          + New Student
        </Button>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Transcript</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-400 py-8">Loading...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-400 py-8">No students found.</TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-gray-500">{s.email}</TableCell>
                  <TableCell>{s.department || '—'}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[s.transcriptStatus] ?? 'bg-gray-100 text-gray-500'}>
                      {s.transcriptStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-[#003087] hover:bg-[#002266] text-white text-xs h-7"
                        onClick={() => router.push(`/advisor/chat/${s.id}`)}
                      >
                        Chat
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => { setUploadStudentId(s.id); setUploadError(''); setTimeout(() => fileInputRef.current?.click(), 50); }}
                        disabled={uploadLoading && uploadStudentId === s.id}
                      >
                        {uploadLoading && uploadStudentId === s.id ? 'Uploading...' : 'Upload'}
                      </Button>
                      {s.transcriptStatus === 'ready' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs h-7"
                          onClick={() => setDeleteStudentId(s.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="p-4 border-t border-gray-200 text-sm text-gray-500">
          {filtered.length} student{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handleUpload}
      />

      {uploadError && (
        <p className="mt-2 text-sm text-red-500">{uploadError}</p>
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteStudentId} onOpenChange={(open) => { if (!open) setDeleteStudentId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Transcript</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">Remove this student&apos;s transcript? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteStudentId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Student Dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) setAddOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Student</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={addForm.firstName}
                  onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={addForm.lastName}
                  onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="department">Department (optional)</Label>
              <Input
                id="department"
                value={addForm.department}
                onChange={(e) => setAddForm((f) => ({ ...f, department: e.target.value }))}
              />
            </div>
            {addError && <p className="text-sm text-red-500">{addError}</p>}
            <p className="text-xs text-gray-400">After creating the student, you&apos;ll go directly to the chat where you can upload their transcript.</p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-[#003087] hover:bg-[#002266] text-white" disabled={addLoading}>
                {addLoading ? 'Creating...' : 'Create & Go to Chat'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
