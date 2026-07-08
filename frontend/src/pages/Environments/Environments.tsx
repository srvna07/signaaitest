import { useEffect, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { ApiResponse, Environment } from '../../types';

export function Environments() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchEnvs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get<ApiResponse<Environment[]>>('/environments');
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
    fetchEnvs();
  }, []);

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
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4}>Loading...</td>
              </tr>
            ) : environments.length === 0 ? (
              <tr>
                <td colSpan={4}>No environments found.</td>
              </tr>
            ) : (
              environments.map((env) => (
                <tr key={env.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {env.id.split('-')[0]}
                  </td>
                  <td style={{ fontWeight: 500 }}>{env.name}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                    {env.baseUrl}
                  </td>
                  <td>{new Date(env.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
