import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, RefreshCcw, Edit, Trash2 } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { ApiResponse, TestCase } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

export function TestCases() {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { user } = useAuth();
  const navigate = useNavigate();

  const canEdit = user?.role === 'ADMIN' || user?.role === 'EDITOR';
  const canDelete = user?.role === 'ADMIN';

  const { projectId } = useParams<{ projectId: string }>();

  const fetchTestCases = async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    setSelectedIds(new Set());
    try {
      const res = await apiClient.get<ApiResponse<TestCase[]>>(`/test-cases?projectId=${projectId}`);
      if (res.success && res.data) {
        setTestCases(res.data);
      } else {
        setError(res.error || 'Failed to fetch test cases');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Error fetching test cases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchTestCases();
    }
  }, [projectId]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this test case?')) return;
    try {
      const res = await apiClient.delete<ApiResponse<unknown>>(`/test-cases/${id}`);
      if (res.success) {
        fetchTestCases();
      } else {
        setError(res.error || 'Failed to delete test case');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Error deleting test case');
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} test cases?`)) return;
    try {
      const res = await apiClient.post<ApiResponse<unknown>>('/test-cases/bulk-delete', {
        ids: Array.from(selectedIds),
      });
      if (res.success) {
        fetchTestCases();
      } else {
        setError(res.error || 'Failed to delete test cases');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Error deleting test cases');
    }
  };

  const handleEdit = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigate(`/test-cases/${id}?edit=true`);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === testCases.length && testCases.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(testCases.map((tc) => tc.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  return (
    <div className="page-container">
      <div className="toolbar">
        <div className="toolbar-left">
          <h2>Test Cases</h2>
          <button onClick={fetchTestCases} className="logoutBtn" title="Refresh">
            <RefreshCcw size={16} />
          </button>
        </div>
        <div
          className="toolbar-right"
          style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}
        >
          {canDelete && selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: '#dc2626',
                borderColor: '#fca5a5',
              }}
            >
              <Trash2 size={16} /> Delete Selected ({selectedIds.size})
            </button>
          )}
          {canEdit && (
            <Link to="/test-cases/new" className="btn-primary">
              <Plus size={16} /> New Test Case
            </Link>
          )}
        </div>
      </div>

      {error && <div style={{ padding: '1rem', color: 'red' }}>{error}</div>}

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={selectedIds.size === testCases.length && testCases.length > 0}
                  onChange={toggleSelectAll}
                  style={{ cursor: 'pointer' }}
                  title="Select All"
                />
              </th>
              <th>ID</th>
              <th>Title</th>
              <th>Type</th>
              <th>Requirement</th>
              <th>Created</th>
              <th style={{ width: '80px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>Loading...</td>
              </tr>
            ) : testCases.length === 0 ? (
              <tr>
                <td colSpan={7}>No test cases found.</td>
              </tr>
            ) : (
              testCases.map((tc) => (
                <tr key={tc.id}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(tc.id)}
                      onChange={() => toggleSelect(tc.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    <Link to={`/test-cases/${tc.id}`}>{tc.id.split('-')[0]}</Link>
                  </td>
                  <td>
                    <Link to={`/test-cases/${tc.id}`}>{tc.title}</Link>
                  </td>
                  <td>
                    <span className={`badge badge-${tc.type.toLowerCase()}`}>{tc.type}</span>
                  </td>
                  <td>{tc.requirement?.title || '-'}</td>
                  <td>{new Date(tc.createdAt).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      {canEdit && (
                        <button
                          onClick={(e) => handleEdit(e, tc.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--color-text-muted)',
                          }}
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={(e) => handleDelete(e, tc.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#dc2626',
                          }}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
