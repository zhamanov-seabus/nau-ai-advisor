'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { getStudents, createStudent, deleteStudent, setUserRole, type Student } from '@/lib/api';

const PAGE_SIZE = 20;

export default function StudentTable() {
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [loading, setLoading] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', email: '', department: '' });
  const [addError, setAddError] = useState('');

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [roleChangeId, setRoleChangeId] = useState<string | null>(null);
  const [roleChangeTarget, setRoleChangeTarget] = useState<'advisor' | 'student'>('advisor');
  const [roleLoading, setRoleLoading] = useState(false);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getStudents({ page, limit: PAGE_SIZE, search: search || undefined, department: department || undefined });
      setStudents(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, department]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);
    try {
      await createStudent(addForm);
      setAddOpen(false);
      setAddForm({ name: '', email: '', department: '' });
      fetchStudents();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setAddError(msg || 'Failed to create student.');
    } finally {
      setAddLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      await deleteStudent(deleteId);
      setDeleteId(null);
      fetchStudents();
    } catch {
      // ignore
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleRoleChange() {
    if (!roleChangeId) return;
    setRoleLoading(true);
    try {
      await setUserRole(roleChangeId, roleChangeTarget);
      setRoleChangeId(null);
      fetchStudents();
    } catch {
      // ignore
    } finally {
      setRoleLoading(false);
    }
  }

  function handleCsvImport() {
    alert('CSV Import — Coming soon');
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-64"
          />
          <Input
            placeholder="Department filter..."
            value={department}
            onChange={(e) => { setDepartment(e.target.value); setPage(1); }}
            className="w-48"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCsvImport}>CSV Import</Button>
          <Button size="sm" className="bg-[#003087] hover:bg-[#002266] text-white" onClick={() => setAddOpen(true)}>
            + Add Student
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-400 py-8">Loading...</TableCell>
              </TableRow>
            ) : students.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-400 py-8">No users found.</TableCell>
              </TableRow>
            ) : (
              students.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-gray-500">{s.email}</TableCell>
                  <TableCell>{s.department}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        s.role === 'advisor'
                          ? 'bg-purple-100 text-purple-700 hover:bg-purple-100'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-100'
                      }
                    >
                      {s.role ?? 'student'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        s.status === 'active'
                          ? 'bg-green-100 text-green-700 hover:bg-green-100'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-100'
                      }
                    >
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-400 text-sm">
                    {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {s.role === 'advisor' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 text-xs h-7"
                          onClick={() => { setRoleChangeId(s.id); setRoleChangeTarget('student'); }}
                        >
                          Make Student
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-purple-600 hover:text-purple-800 hover:bg-purple-50 text-xs h-7"
                          onClick={() => { setRoleChangeId(s.id); setRoleChangeTarget('advisor'); }}
                        >
                          Make Advisor
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs h-7"
                        onClick={() => setDeleteId(s.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="p-4 border-t border-gray-200 flex items-center justify-between text-sm text-gray-500">
          <span>{total} user{total !== 1 ? 's' : ''}</span>
          <div className="flex gap-2 items-center">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <span className="px-2">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
          </div>
        </div>
      </div>

      {/* Add Student Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Student</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-name">Name</Label>
              <Input id="add-name" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-email">Email</Label>
              <Input id="add-email" type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-dept">Department</Label>
              <Input id="add-dept" value={addForm.department} onChange={(e) => setAddForm((f) => ({ ...f, department: e.target.value }))} required />
            </div>
            {addError && <p className="text-sm text-red-500">{addError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-[#003087] hover:bg-[#002266] text-white" disabled={addLoading}>
                {addLoading ? 'Adding...' : 'Add Student'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">Are you sure you want to delete this user? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Change Dialog */}
      <Dialog open={!!roleChangeId} onOpenChange={(open) => { if (!open) setRoleChangeId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            {roleChangeTarget === 'advisor'
              ? 'Make this user an Advisor? They will get access to the advisor panel and student transcripts.'
              : 'Make this user a Student? They will lose access to the advisor panel.'}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleChangeId(null)}>Cancel</Button>
            <Button
              className="bg-[#003087] hover:bg-[#002266] text-white"
              onClick={handleRoleChange}
              disabled={roleLoading}
            >
              {roleLoading ? 'Saving...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
