'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  getTranscriptStatuses,
  uploadTranscript,
  deleteTranscript,
  type TranscriptRecord,
  type TranscriptStatusValue,
} from '@/lib/api';
import { getToken } from '@/lib/auth';
import { io, Socket } from 'socket.io-client';

const statusBadge: Record<TranscriptStatusValue, string> = {
  ready: 'bg-green-100 text-green-700',
  processing: 'bg-yellow-100 text-yellow-700',
  missing: 'bg-gray-100 text-gray-500',
  error: 'bg-red-100 text-red-700',
};

const statusLabel: Record<TranscriptStatusValue, string> = {
  ready: 'Ready',
  processing: 'Processing',
  missing: 'Missing',
  error: 'Error',
};

export default function TranscriptTable() {
  const [records, setRecords] = useState<TranscriptRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<Socket | null>(null);

  async function fetchRecords() {
    setLoading(true);
    try {
      const { data } = await getTranscriptStatuses({ search: search || undefined });
      setRecords(data.data ?? []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRecords();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // WebSocket for real-time status updates
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const token = getToken();
    const socket: Socket = io(apiUrl, {
      auth: token ? { token } : undefined,
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('transcript-status', (update: { studentId: string; status: TranscriptStatusValue }) => {
      setRecords((prev) =>
        prev.map((r) =>
          r.studentId === update.studentId ? { ...r, status: update.status } : r
        )
      );
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  function handleUploadClick(studentId: string) {
    setUploadingId(studentId);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadingId) return;
    e.target.value = '';

    try {
      await uploadTranscript(uploadingId, file);
      // Optimistically set to processing
      setRecords((prev) =>
        prev.map((r) => r.studentId === uploadingId ? { ...r, status: 'processing' } : r)
      );
    } catch {
      // ignore — WS will update when ready
    } finally {
      setUploadingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      await deleteTranscript(deleteId);
      setRecords((prev) =>
        prev.map((r) => r.studentId === deleteId ? { ...r, status: 'missing' } : r)
      );
      setDeleteId(null);
    } catch {
      // ignore
    } finally {
      setDeleteLoading(false);
    }
  }

  const filtered = records.filter((r) =>
    !search ||
    r.studentName.toLowerCase().includes(search.toLowerCase()) ||
    r.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Search by student name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-400 py-8">Loading...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-400 py-8">No records found.</TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.studentId}>
                  <TableCell className="font-medium">{r.studentName}</TableCell>
                  <TableCell className="text-gray-500">{r.email}</TableCell>
                  <TableCell>
                    <Badge className={`${statusBadge[r.status]} hover:${statusBadge[r.status]} capitalize`}>
                      {statusLabel[r.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => handleUploadClick(r.studentId)}
                        disabled={r.status === 'processing'}
                      >
                        Upload PDF
                      </Button>
                      {r.status !== 'missing' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs h-7"
                          onClick={() => setDeleteId(r.studentId)}
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
          {filtered.length} record{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Hidden file input for upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Transcript</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Are you sure you want to delete this transcript? The student will need to re-upload.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
