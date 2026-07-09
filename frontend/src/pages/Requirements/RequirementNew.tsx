import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { ApiResponse, Requirement } from '../../types';

export function RequirementNew() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    
    setIsSubmitting(true);
    setError('');

    try {
      const res = await apiClient.post<ApiResponse<Requirement>>('/requirements', {
        projectId,
        title: title.trim(),
        description: description.trim(),
      });

      if (res.success && res.data) {
        navigate(`/projects/${projectId}/requirements/${res.data.id}`);
      } else {
        setError(res.error || 'Failed to create requirement');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Error creating requirement');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <div className="toolbar">
        <div className="toolbar-left">
          <Link to={`/projects/${projectId}/requirements`} style={{ color: 'var(--color-text-muted)', display: 'flex' }}>
            <ChevronLeft size={20} />
          </Link>
          <h2>New Requirement</h2>
        </div>
      </div>

      <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
        {error && (
          <div style={{ padding: '1rem', color: 'red', marginBottom: '1rem', backgroundColor: '#fee2e2', borderRadius: '4px' }}>
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            maxWidth: '800px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. User Authentication"
              style={{
                padding: '0.5rem',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Description *</label>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description of the requirement..."
              rows={8}
              style={{
                padding: '0.5rem',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Requirement'}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/projects/${projectId}/requirements`)}
              disabled={isSubmitting}
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
      </div>
    </div>
  );
}
