import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Wand2, Trash2, Globe } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { ApiResponse, Requirement, Environment } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

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
  const [environments, setEnvironments] = useState<Environment[]>([]);
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
  const [generatedScreenshot, setGeneratedScreenshot] = useState<string>('');
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // New Generation Options State
  const [showGenerationOptions, setShowGenerationOptions] = useState(false);
  const [generationScope, setGenerationScope] = useState<'UI' | 'API' | 'BOTH'>('BOTH');
  const [generationMode, setGenerationMode] = useState<'text' | 'browser' | null>(null);
  const [selectedEnvId, setSelectedEnvId] = useState('');
  const [explorePath, setExplorePath] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [reqRes, envRes] = await Promise.all([
          apiClient.get<ApiResponse<Requirement>>(`/requirements/${id}`),
          apiClient.get<ApiResponse<Environment[]>>('/environments'),
        ]);

        if (reqRes.success && reqRes.data) {
          setRequirement(reqRes.data);
        } else {
          setError(reqRes.error || 'Failed to fetch requirement');
        }

        if (envRes.success && envRes.data) {
          setEnvironments(envRes.data);
          if (envRes.data.length > 0) {
            setSelectedEnvId(envRes.data[0].id);
          }
        }
      } catch (err: unknown) {
        setError((err as Error).message || 'Error fetching data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
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

  const handleGenerate = async (mode: 'text' | 'browser') => {
    setIsGenerating(true);
    setGenerateError('');
    setSaveSuccess(false);
    setGeneratedCases([]);
    setGeneratedScreenshot('');
    setShowGenerationOptions(false);

    try {
      if (mode === 'text') {
        const res = await apiClient.post<ApiResponse<GeneratedTestCase[]>>(
          `/requirements/${id}/generate-test-cases`,
          {},
        );
        if (res.success && res.data) {
          // Filter locally based on scope if needed, or pass scope to backend.
          // For simplicity we just use what's returned.
          const filteredData = res.data.filter(
            (tc) => generationScope === 'BOTH' || tc.type === generationScope,
          );
          setGeneratedCases(filteredData);
          setSelectedIndices(new Set(filteredData.map((_, i) => i)));
        } else {
          setGenerateError(res.error || 'AI generation failed');
        }
      } else {
        if (!selectedEnvId) {
          throw new Error('Please select an environment');
        }
        const res = await apiClient.post<
          ApiResponse<GeneratedTestCase[]> & { screenshot?: string }
        >(`/requirements/${id}/generate-from-browser`, {
          environmentId: selectedEnvId,
          path: explorePath,
          scope: generationScope,
        });
        if (res.success && res.data) {
          setGeneratedCases(res.data);
          if (res.screenshot) {
            setGeneratedScreenshot(res.screenshot);
          }
          setSelectedIndices(new Set(res.data.map((_, i) => i)));
        } else {
          setGenerateError(res.error || 'Browser AI generation failed');
        }
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
        setGeneratedScreenshot('');
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
              onClick={() => setShowGenerationOptions(!showGenerationOptions)}
              disabled={isGenerating || isSaving}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Wand2 size={16} />
              {isGenerating ? 'Generating...' : 'AI Generate Options'}
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

      {showGenerationOptions && (
        <div
          style={{
            backgroundColor: '#f8fafc',
            padding: '1.5rem',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '2rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '300px' }}>
              <h4 style={{ margin: '0 0 1rem 0' }}>AI Test Case Generation Mode</h4>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <button
                  className={generationMode === 'text' ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setGenerationMode('text')}
                >
                  <Wand2 size={16} style={{ marginRight: '0.5rem', display: 'inline' }} />
                  Generate from requirement text
                </button>
                <button
                  className={generationMode === 'browser' ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setGenerationMode('browser')}
                >
                  <Globe size={16} style={{ marginRight: '0.5rem', display: 'inline' }} />
                  Generate by exploring a live URL
                </button>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 500,
                    marginBottom: '0.5rem',
                    fontSize: '0.85rem',
                  }}
                >
                  Target Scope:
                </label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontSize: '0.85rem',
                    }}
                  >
                    <input
                      type="radio"
                      checked={generationScope === 'UI'}
                      onChange={() => setGenerationScope('UI')}
                    />{' '}
                    UI Only
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontSize: '0.85rem',
                    }}
                  >
                    <input
                      type="radio"
                      checked={generationScope === 'API'}
                      onChange={() => setGenerationScope('API')}
                    />{' '}
                    API Only
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontSize: '0.85rem',
                    }}
                  >
                    <input
                      type="radio"
                      checked={generationScope === 'BOTH'}
                      onChange={() => setGenerationScope('BOTH')}
                    />{' '}
                    Both UI & API
                  </label>
                </div>
              </div>

              {generationMode === 'text' && (
                <button className="btn-primary" onClick={() => handleGenerate('text')}>
                  Start Generation
                </button>
              )}

              {generationMode === 'browser' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    padding: '1rem',
                    backgroundColor: 'white',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                      Select Environment *
                    </label>
                    <select
                      value={selectedEnvId}
                      onChange={(e) => setSelectedEnvId(e.target.value)}
                      style={{
                        padding: '0.5rem',
                        border: '1px solid var(--color-border)',
                        borderRadius: '4px',
                      }}
                    >
                      {environments.map((env) => (
                        <option key={env.id} value={env.id}>
                          {env.name} ({env.baseUrl})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                      Optional Path/Route
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. /login"
                      value={explorePath}
                      onChange={(e) => setExplorePath(e.target.value)}
                      style={{
                        padding: '0.5rem',
                        border: '1px solid var(--color-border)',
                        borderRadius: '4px',
                      }}
                    />
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => handleGenerate('browser')}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    Start exploration
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

        {isGenerating && (
          <div
            style={{
              padding: '2rem',
              textAlign: 'center',
              backgroundColor: '#f1f5f9',
              borderRadius: '8px',
              marginBottom: '2rem',
            }}
          >
            <div style={{ fontSize: '1.2rem', fontWeight: 500, marginBottom: '0.5rem' }}>
              {generationMode === 'browser'
                ? 'Navigating to live URL and analyzing...'
                : 'Generating test cases...'}
            </div>
            <div style={{ color: 'var(--color-text-muted)' }}>This may take up to 45 seconds.</div>
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

        {generatedScreenshot && (
          <div style={{ marginBottom: '2rem' }}>
            <h3>Browser Capture</h3>
            <div
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                overflow: 'hidden',
                padding: '0.5rem',
                backgroundColor: '#e2e8f0',
              }}
            >
              <img
                src={generatedScreenshot}
                alt="Live browser capture"
                style={{ width: '100%', display: 'block', borderRadius: '4px' }}
              />
            </div>
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
