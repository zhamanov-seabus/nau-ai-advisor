import StudentTable from '@/components/admin/StudentTable';

export default function StudentsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Students</h1>
      <StudentTable />
    </div>
  );
}
