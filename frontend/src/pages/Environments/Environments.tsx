import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RefreshCcw, Edit, Trash2 } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { ApiResponse, Environment } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

export function Environments() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  const canEdit = user?.role === 'ADMIN' || user?.role === 'EDITOR';
  const canDelete = user?.role === 'ADMIN';

  const { projectId } = useParams<{ projectId: string }>();

  const fetchEnvs = async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get<ApiResponse<Environment[]>>(`/environments?projectId=${projectId}`);
      if (res.success && res.data) {
        setEnvironments(res.data);
      } else {
        setError(res.error || 'Failed to fetch environments');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Error fetching environments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) fetchEnvs();
  }, [projectId]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this environment?')) return;
    try {
      const res = await apiClient.delete<ApiResponse<unknown>>(`/environments/${id}`);
      if (res.success) {
        fetchEnvs();
      } else {
        setError(res.error || 'Failed to delete environment');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Error deleting environment');
    }
  };

  const handleEdit = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigate(`/projects/${projectId}/environments/${id}?edit=true`);
  };

  return (
    <div className="page-container">
      <div className="toolbar">
        <div className="toolbar-left">
          <h2>Environments</h2>
          <button onClick={fetchEnvs} className="logoutBtn" title="Refresh">
            <RefreshCcw size={16} />
          </button>
        </div>
      </div>

      {error && <div style={{ padding: '1rem', color: 'red' }}>{error}</div>}

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Base URL</th>
              <th>Created</th>
              <th style={{ width: '80px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>Loading...</td>
              </tr>
            ) : environments.length === 0 ? (
              <tr>
                <td colSpan={5}>No environments found.</td>
              </tr>
            ) : (
              environments.map((env) => (
                <tr
                  key={env.id}
                  onClick={() => navigate(`/projects/${projectId}/environments/${env.id}`)}
                  style={{ cursor: 'pointer' }}
                  className="hover-row"
                >
                  <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {env.id.split('-')[0]}
                  </td>
                  <td style={{ fontWeight: 500 }}>{env.name}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                    {env.baseUrl}
                  </td>
                  <td>{new Date(env.createdAt).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      {canEdit && (
                        <button
                          onClick={(e) => handleEdit(e, env.id)}
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
                          onClick={(e) => handleDelete(e, env.id)}
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
