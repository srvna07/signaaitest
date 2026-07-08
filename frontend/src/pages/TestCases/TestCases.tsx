import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, RefreshCcw, Edit, Trash2 } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { ApiResponse, TestCase } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

export function TestCases() {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();

  const canEdit = user?.role === 'ADMIN' || user?.role === 'EDITOR';
  const canDelete = user?.role === 'ADMIN';

  const fetchTestCases = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get<ApiResponse<TestCase[]>>('/test-cases');
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
    fetchTestCases();
  }, []);

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

  const handleEdit = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigate(`/test-cases/${id}?edit=true`);
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
        <div className="toolbar-right">
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
                <td colSpan={6}>Loading...</td>
              </tr>
            ) : testCases.length === 0 ? (
              <tr>
                <td colSpan={6}>No test cases found.</td>
              </tr>
            ) : (
              testCases.map((tc) => (
                <tr key={tc.id}>
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
