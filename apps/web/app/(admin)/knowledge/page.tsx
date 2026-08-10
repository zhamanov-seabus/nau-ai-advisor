'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { getKnowledge, uploadKnowledge, deleteKnowledge, seedKnowledge, getNAUKBContent, updateNAUKBContent, type KnowledgeDoc } from '@/lib/api';

export default function KnowledgePage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [kbEditorOpen, setKbEditorOpen] = useState(false);
  const [kbContent, setKbContent] = useState('');
  const [kbLoading, setKbLoading] = useState(false);
  const [kbSaving, setKbSaving] = useState(false);
  const [kbSaveResult, setKbSaveResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function fetchDocs() {
    setLoading(true);
    try {
      const { data } = await getKnowledge();
      setDocs(Array.isArray(data) ? data : []);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchDocs(); }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      await uploadKnowledge(file);
      await fetchDocs();
    } catch {
      // ignore
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      await deleteKnowledge(deleteId);
      setDocs((prev) => prev.filter((d) => d.id !== deleteId));
      setDeleteId(null);
    } catch {
      // ignore
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedKnowledge();
      await fetchDocs();
    } catch {
      // ignore
    } finally {
      setSeeding(false);
    }
  }

  async function openKbEditor() {
    setKbEditorOpen(true);
    setKbSaveResult(null);
    if (!kbContent) {
      setKbLoading(true);
      try {
        const { data } = await getNAUKBContent();
        setKbContent(data.content);
      } catch {
        setKbContent('');
      } finally {
        setKbLoading(false);
      }
    }
  }

  async function handleKbSave() {
    setKbSaving(true);
    setKbSaveResult(null);
    try {
      const { data } = await updateNAUKBContent(kbContent);
      setKbSaveResult(`Saved & re-indexed: ${data.chunksCreated} chunks from ${data.sectionsProcessed} sections.`);
      await fetchDocs();
    } catch {
      setKbSaveResult('Error saving. Please try again.');
    } finally {
      setKbSaving(false);
    }
  }

  function formatSize(bytes?: number): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openKbEditor}>
            Edit Knowledge Base
          </Button>
          <Button variant="outline" onClick={handleSeed} disabled={seeding}>
            {seeding ? 'Re-indexing...' : 'Re-index NAU KB'}
          </Button>
          <Button
            className="bg-[#003087] hover:bg-[#002266] text-white"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : '+ Upload Document'}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Filename</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Chunks</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-400 py-8">Loading...</TableCell>
              </TableRow>
            ) : docs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-400 py-8">
                  No documents yet. Upload a PDF or TXT, or seed the NAU knowledge base.
                </TableCell>
              </TableRow>
            ) : (
              docs.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {doc.filename}
                      {doc.filename.endsWith('.pdf') ? (
                        <Badge className="bg-red-100 text-red-600 text-[10px] hover:bg-red-100">PDF</Badge>
                      ) : doc.filename.endsWith('.md') ? (
                        <Badge className="bg-purple-100 text-purple-600 text-[10px] hover:bg-purple-100">MD</Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-600 text-[10px] hover:bg-blue-100">TXT</Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] hover:bg-inherit ${
                      doc.status === 'ready' ? 'bg-green-100 text-green-700' :
                      doc.status === 'processing' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {doc.status ?? 'unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">{doc.chunkCount ?? '—'}</TableCell>
                  <TableCell className="text-gray-400 text-sm">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {doc.filename.endsWith('.md') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[#003087] hover:text-[#003087] hover:bg-blue-50 text-xs h-7"
                          onClick={openKbEditor}
                        >
                          Edit
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs h-7"
                        onClick={() => setDeleteId(doc.id)}
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

        <div className="p-4 border-t border-gray-200 text-sm text-gray-500">
          {docs.length} document{docs.length !== 1 ? 's' : ''}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt"
        className="hidden"
        onChange={handleFileChange}
      />

      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Are you sure? This document will be removed from the knowledge base.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={kbEditorOpen} onOpenChange={(open) => { if (!open) { setKbEditorOpen(false); setKbSaveResult(null); } }}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit NAU Knowledge Base</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-500 -mt-2">
            Markdown format. Sections start with <code className="bg-gray-100 px-1 rounded">## Heading</code>. Save to re-index automatically.
          </p>
          {kbLoading ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading...</div>
          ) : (
            <textarea
              className="flex-1 w-full border border-gray-200 rounded-md p-3 text-[13px] font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[#003087]"
              value={kbContent}
              onChange={(e) => setKbContent(e.target.value)}
              spellCheck={false}
            />
          )}
          {kbSaveResult && (
            <p className={`text-xs px-1 ${kbSaveResult.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
              {kbSaveResult}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setKbEditorOpen(false); setKbSaveResult(null); }}>
              Cancel
            </Button>
            <Button
              className="bg-[#003087] hover:bg-[#002266] text-white"
              onClick={handleKbSave}
              disabled={kbSaving || kbLoading}
            >
              {kbSaving ? 'Saving & Re-indexing...' : 'Save & Re-index'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
