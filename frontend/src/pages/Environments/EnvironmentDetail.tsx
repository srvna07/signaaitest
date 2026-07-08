import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { ApiResponse, Environment } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

export function EnvironmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'EDITOR';
  const canDelete = user?.role === 'ADMIN';

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (searchParams.get('edit') === 'true' && canEdit && environment) {
      setIsEditing(true);
      setEditName(environment.name);
      setEditUrl(environment.baseUrl);
    }
  }, [searchParams, canEdit, environment]);

  useEffect(() => {
    const fetchEnvironment = async () => {
      try {
        const res = await apiClient.get<ApiResponse<Environment>>(`/environments/${id}`);
        if (res.success && res.data) {
          setEnvironment(res.data);
        } else {
          setError(res.error || 'Failed to fetch environment');
        }
      } catch (err: unknown) {
        setError((err as Error).message || 'Error fetching environment');
      } finally {
        setLoading(false);
      }
    };
    fetchEnvironment();
  }, [id]);

  const startEdit = () => {
    if (!environment) return;
    setEditName(environment.name);
    setEditUrl(environment.baseUrl);
    setIsEditing(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editUrl.trim()) return;
    setIsUpdating(true);
    setError('');
    try {
      const res = await apiClient.put<ApiResponse<Environment>>(`/environments/${id}`, {
        name: editName.trim(),
        baseUrl: editUrl.trim(),
        variables: environment?.variables || {},
      });
      if (res.success && res.data) {
        setEnvironment(res.data);
        setIsEditing(false);
        if (searchParams.has('edit')) {
          const newParams = new URLSearchParams(searchParams);
          newParams.delete('edit');
          setSearchParams(newParams, { replace: true });
        }
      } else {
        setError(res.error || 'Failed to update environment');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Error updating environment');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        'Are you sure you want to delete this environment? This action cannot be undone.',
      )
    )
      return;
    try {
      const res = await apiClient.delete<ApiResponse<unknown>>(`/environments/${id}`);
      if (res.success) {
        navigate('/environments');
      } else {
        setError(res.error || 'Failed to delete environment');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Error deleting environment');
    }
  };

  if (loading) return <div style={{ padding: '1.5rem' }}>Loading...</div>;
  if (error || !environment)
    return <div style={{ padding: '1.5rem', color: 'red' }}>{error || 'Not found'}</div>;

  return (
    <div className="page-container">
      <div className="toolbar">
        <div className="toolbar-left">
          <Link to="/environments" style={{ color: 'var(--color-text-muted)', display: 'flex' }}>
            <ChevronLeft size={20} />
          </Link>
          <h2>{environment.name}</h2>
          <span style={{ fontFamily: 'monospace', color: 'var(--color-primary)' }}>
            {environment.baseUrl}
          </span>
        </div>
        <div className="toolbar-right">
          {canEdit && !isEditing && (
            <button className="btn-primary" onClick={startEdit}>
              Edit
            </button>
          )}
          {canDelete && !isEditing && (
            <button
              className="btn-secondary"
              onClick={handleDelete}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: '#dc2626',
                borderColor: '#fca5a5',
              }}
              title="Delete Environment"
            >
              <Trash2 size={16} />
              Delete
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
        {isEditing ? (
          <form
            onSubmit={handleUpdate}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              maxWidth: '800px',
              marginBottom: '2rem',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Name *</label>
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{
                  padding: '0.5rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Base URL *</label>
              <input
                type="text"
                required
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                style={{
                  padding: '0.5rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button type="submit" className="btn-primary" disabled={isUpdating}>
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  if (searchParams.has('edit')) {
                    const newParams = new URLSearchParams(searchParams);
                    newParams.delete('edit');
                    setSearchParams(newParams, { replace: true });
                  }
                }}
                disabled={isUpdating}
                style={{
                  padding: '0.4rem 0.75rem',
                  backgroundColor: 'white',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h3
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--color-text-muted)',
                  marginBottom: '0.25rem',
                }}
              >
                BASE URL
              </h3>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', fontFamily: 'monospace' }}>
                {environment.baseUrl}
              </div>
            </div>
            <div>
              <h3
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--color-text-muted)',
                  marginBottom: '0.25rem',
                }}
              >
                VARIABLES
              </h3>
              {Object.keys(environment.variables || {}).length > 0 ? (
                <pre
                  style={{
                    padding: '1rem',
                    backgroundColor: '#f8fafc',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                  }}
                >
                  {JSON.stringify(environment.variables, null, 2)}
                </pre>
              ) : (
                <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                  No variables defined.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
