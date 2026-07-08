import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCcw, Edit, Trash2 } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { ApiResponse, Requirement } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

export function Requirements() {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  const canEdit = user?.role === 'ADMIN' || user?.role === 'EDITOR';
  const canDelete = user?.role === 'ADMIN';

  const fetchReqs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get<ApiResponse<Requirement[]>>('/requirements');
      if (res.success && res.data) {
        setRequirements(res.data);
      } else {
        setError(res.error || 'Failed to fetch requirements');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Error fetching requirements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReqs();
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this requirement?')) return;
    try {
      const res = await apiClient.delete<ApiResponse<unknown>>(`/requirements/${id}`);
      if (res.success) {
        fetchReqs();
      } else {
        setError(res.error || 'Failed to delete requirement');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Error deleting requirement');
    }
  };

  const handleEdit = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigate(`/requirements/${id}?edit=true`);
  };

  return (
    <div className="page-container">
      <div className="toolbar">
        <div className="toolbar-left">
          <h2>Requirements</h2>
          <button onClick={fetchReqs} className="logoutBtn" title="Refresh">
            <RefreshCcw size={16} />
          </button>
        </div>
        <div className="toolbar-right">
          {/* Create Requirement button could go here, omitting for brevity/focus */}
        </div>
      </div>

      {error && <div style={{ padding: '1rem', color: 'red' }}>{error}</div>}

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Description</th>
              <th>Coverage</th>
              <th>Created</th>
              <th style={{ width: '80px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>Loading...</td>
              </tr>
            ) : requirements.length === 0 ? (
              <tr>
                <td colSpan={6}>No requirements found.</td>
              </tr>
            ) : (
              requirements.map((req) => (
                <tr
                  key={req.id}
                  onClick={() => navigate(`/requirements/${req.id}`)}
                  style={{ cursor: 'pointer' }}
                  className="hover-row"
                >
                  <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {req.id.split('-')[0]}
                  </td>
                  <td style={{ fontWeight: 500 }}>{req.title}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{req.description}</td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        backgroundColor: req.coverage > 0 ? '#dcfce7' : '#fee2e2',
                        color: req.coverage > 0 ? '#166534' : '#991b1b',
                      }}
                    >
                      {req.coverage} test cases
                    </span>
                  </td>
                  <td>{new Date(req.createdAt).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      {canEdit && (
                        <button
                          onClick={(e) => handleEdit(e, req.id)}
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
                          onClick={(e) => handleDelete(e, req.id)}
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
