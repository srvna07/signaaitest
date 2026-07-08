import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Wand2, Trash2 } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { ApiResponse, Requirement } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

// We need a local interface for the generated test case payload
interface GeneratedTestCaseStep {
  order: number;
  action: string;
  expected?: string;
}

interface GeneratedTestCase {
  title: string;
  type: 'UI' | 'API';
  preconditions?: string;
  steps: GeneratedTestCaseStep[];
  expectedResult: string;
}

export function RequirementDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requirement, setRequirement] = useState<Requirement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'EDITOR';
  const canGenerate = user?.role === 'ADMIN' || user?.role === 'EDITOR';
  const canDelete = user?.role === 'ADMIN';

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (searchParams.get('edit') === 'true' && canEdit && requirement) {
      setIsEditing(true);
      setEditTitle(requirement.title);
      setEditDesc(requirement.description);
    }
  }, [searchParams, canEdit, requirement]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generatedCases, setGeneratedCases] = useState<GeneratedTestCase[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const fetchRequirement = async () => {
      try {
        const res = await apiClient.get<ApiResponse<Requirement>>(`/requirements/${id}`);
        if (res.success && res.data) {
          setRequirement(res.data);
        } else {
          setError(res.error || 'Failed to fetch requirement');
        }
      } catch (err: unknown) {
        setError((err as Error).message || 'Error fetching requirement');
      } finally {
        setLoading(false);
      }
    };
    fetchRequirement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const startEdit = () => {
    if (!requirement) return;
    setEditTitle(requirement.title);
    setEditDesc(requirement.description);
    setIsEditing(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim() || !editDesc.trim()) return;
    setIsUpdating(true);
    setError('');
    try {
      const res = await apiClient.put<ApiResponse<Requirement>>(`/requirements/${id}`, {
        title: editTitle.trim(),
        description: editDesc.trim(),
      });
      if (res.success && res.data) {
        setRequirement(res.data);
        setIsEditing(false);
        if (searchParams.has('edit')) {
          const newParams = new URLSearchParams(searchParams);
          newParams.delete('edit');
          setSearchParams(newParams, { replace: true });
        }
      } else {
        setError(res.error || 'Failed to update requirement');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Error updating requirement');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        'Are you sure you want to delete this requirement? This action cannot be undone.',
      )
    )
      return;
    try {
      const res = await apiClient.delete<ApiResponse<unknown>>(`/requirements/${id}`);
      if (res.success) {
        navigate('/requirements');
      } else {
        setError(res.error || 'Failed to delete requirement');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Error deleting requirement');
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateError('');
    setSaveSuccess(false);
    setGeneratedCases([]);
    try {
      const res = await apiClient.post<ApiResponse<GeneratedTestCase[]>>(
        `/requirements/${id}/generate-test-cases`,
        {},
      );
      if (res.success && res.data) {
        setGeneratedCases(res.data);
        // Select all by default
        setSelectedIndices(new Set(res.data.map((_, i) => i)));
      } else {
        setGenerateError(res.error || 'AI generation failed');
      }
    } catch (err: unknown) {
      setGenerateError((err as Error).message || 'AI generation failed (Timeout or server error)');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveSelected = async () => {
    if (selectedIndices.size === 0) return;
    setIsSaving(true);
    setGenerateError('');

    const casesToSave = generatedCases
      .filter((_, i) => selectedIndices.has(i))
      .map((tc) => ({
        ...tc,
        requirementId: id,
      }));

    try {
      const res = await apiClient.post<ApiResponse<unknown>>(`/test-cases/bulk`, casesToSave);
      if (res.success) {
        setSaveSuccess(true);
        setGeneratedCases([]);
        if (requirement) {
          setRequirement({
            ...requirement,
            coverage: requirement.coverage + casesToSave.length,
          });
        }
      } else {
        setGenerateError(res.error || 'Failed to bulk save test cases');
      }
    } catch (err: unknown) {
      setGenerateError((err as Error).message || 'Error saving test cases');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSelection = (idx: number) => {
    const nextSet = new Set(selectedIndices);
    if (nextSet.has(idx)) nextSet.delete(idx);
    else nextSet.add(idx);
    setSelectedIndices(nextSet);
  };

  if (loading) return <div style={{ padding: '1.5rem' }}>Loading...</div>;
  if (error || !requirement)
    return <div style={{ padding: '1.5rem', color: 'red' }}>{error || 'Not found'}</div>;

  return (
    <div className="page-container">
      <div className="toolbar">
        <div className="toolbar-left">
          <Link to="/requirements" style={{ color: 'var(--color-text-muted)', display: 'flex' }}>
            <ChevronLeft size={20} />
          </Link>
          <h2>{requirement.title}</h2>
          <span className="badge" style={{ backgroundColor: '#e2e8f0', color: '#1e293b' }}>
            Coverage: {requirement.coverage}
          </span>
        </div>
        <div className="toolbar-right">
          {canEdit && !isEditing && (
            <button className="btn-primary" onClick={startEdit}>
              Edit
            </button>
          )}
          {canGenerate && !isEditing && (
            <button
              className="btn-primary"
              onClick={handleGenerate}
              disabled={isGenerating || isSaving}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Wand2 size={16} />
              {isGenerating ? 'Generating...' : 'Generate test cases with AI'}
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
              title="Delete Requirement"
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
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Title *</label>
              <input
                type="text"
                required
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
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
                rows={5}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                style={{
                  padding: '0.5rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  fontFamily: 'inherit',
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
          <div style={{ marginBottom: '2rem' }}>
            <h3
              style={{
                fontSize: '0.85rem',
                color: 'var(--color-text-muted)',
                marginBottom: '0.25rem',
              }}
            >
              DESCRIPTION
            </h3>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
              {requirement.description || 'No description provided.'}
            </div>
          </div>
        )}

        {generateError && (
          <div
            style={{
              padding: '1rem',
              color: 'red',
              backgroundColor: '#fee2e2',
              marginBottom: '1rem',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{generateError}</span>
            {canGenerate && (
              <button
                onClick={handleGenerate}
                style={{ padding: '0.25rem 0.5rem', cursor: 'pointer' }}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {saveSuccess && (
          <div
            style={{
              padding: '1rem',
              color: '#166534',
              backgroundColor: '#dcfce7',
              marginBottom: '1rem',
              borderRadius: '4px',
            }}
          >
            Test cases saved successfully!
          </div>
        )}

        {generatedCases.length > 0 && (
          <div style={{ marginTop: '2rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3>AI Suggestions ({generatedCases.length})</h3>
              <button
                className="btn-primary"
                onClick={handleSaveSelected}
                disabled={selectedIndices.size === 0 || isSaving}
              >
                {isSaving ? 'Saving...' : `Save ${selectedIndices.size} selected`}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {generatedCases.map((tc, idx) => (
                <div
                  key={idx}
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '1rem',
                    backgroundColor: selectedIndices.has(idx) ? '#f8fafc' : 'white',
                    transition: 'background-color 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                    <input
                      type="checkbox"
                      checked={selectedIndices.has(idx)}
                      onChange={() => toggleSelection(idx)}
                      style={{
                        marginTop: '0.25rem',
                        width: '16px',
                        height: '16px',
                        cursor: 'pointer',
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          marginBottom: '0.5rem',
                        }}
                      >
                        <h4 style={{ margin: 0 }}>{tc.title}</h4>
                        <span className={`badge badge-${tc.type.toLowerCase()}`}>{tc.type}</span>
                      </div>

                      {tc.preconditions && (
                        <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: 500 }}>Preconditions:</span> {tc.preconditions}
                        </div>
                      )}

                      <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 500 }}>Steps:</span>
                        <ul style={{ margin: '0.25rem 0 0 1.5rem', padding: 0 }}>
                          {tc.steps.map((step) => (
                            <li key={step.order}>
                              {step.action}{' '}
                              {step.expected && (
                                <span style={{ color: 'var(--color-text-muted)' }}>
                                  → {step.expected}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div style={{ fontSize: '0.85rem' }}>
                        <span style={{ fontWeight: 500 }}>Expected Result:</span>{' '}
                        {tc.expectedResult}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
