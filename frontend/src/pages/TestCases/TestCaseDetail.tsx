import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { ApiResponse, TestCase } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { TestCaseForm, TestCaseFormData } from '../../components/TestCaseForm';

export function TestCaseDetail() {
  const { id, projectId } = useParams<{ id: string; projectId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [testCase, setTestCase] = useState<TestCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'EDITOR';
  const canDelete = user?.role === 'ADMIN';

  const [isEditing, setIsEditing] = useState(false);
  const [globalError, setGlobalError] = useState('');

  const [generatingScript, setGeneratingScript] = useState(false);
  const [savingScript, setSavingScript] = useState(false);
  const [scriptError, setScriptError] = useState('');
  const [editingScriptText, setEditingScriptText] = useState<string | null>(null);
  const [editingScriptFormat, setEditingScriptFormat] = useState<string | null>(null);

  useEffect(() => {
    if (testCase) {
      setEditingScriptText(testCase.scriptContent || null);
      setEditingScriptFormat(testCase.scriptFormat || null);
    }
  }, [testCase]);

  const handleGenerateScript = async () => {
    setGeneratingScript(true);
    setScriptError('');
    try {
      const res = await apiClient.post<ApiResponse<{ format: string; content: string }>>(
        `/test-cases/${id}/generate-script`,
      );
      if (res.success && res.data) {
        setEditingScriptText(res.data.content);
        setEditingScriptFormat(res.data.format);
      } else {
        setScriptError(res.error || 'Failed to generate script');
      }
    } catch (err: unknown) {
      setScriptError((err as Error).message || 'Error generating script');
    } finally {
      setGeneratingScript(false);
    }
  };

  const handleSaveScript = async () => {
    if (!editingScriptText || !editingScriptFormat) return;
    setSavingScript(true);
    setScriptError('');
    try {
      const res = await apiClient.put<ApiResponse<TestCase>>(`/test-cases/${id}/script`, {
        format: editingScriptFormat,
        content: editingScriptText,
      });
      if (res.success && res.data) {
        setTestCase(res.data);
      } else {
        setScriptError(res.error || 'Failed to save script');
      }
    } catch (err: unknown) {
      setScriptError((err as Error).message || 'Error saving script');
    } finally {
      setSavingScript(false);
    }
  };

  useEffect(() => {
    if (searchParams.get('edit') === 'true' && canEdit) {
      setIsEditing(true);
    }
  }, [searchParams, canEdit]);

  useEffect(() => {
    const fetchTestCase = async () => {
      try {
        const res = await apiClient.get<ApiResponse<TestCase>>(`/test-cases/${id}`);
        if (res.success && res.data) {
          setTestCase(res.data);
        } else {
          setError(res.error || 'Failed to fetch test case');
        }
      } catch (err: unknown) {
        setError((err as Error).message || 'Error fetching test case');
      } finally {
        setLoading(false);
      }
    };
    fetchTestCase();
  }, [id]);

  const handleDelete = async () => {
    if (
      !window.confirm(
        'Are you sure you want to delete this test case? This action cannot be undone.',
      )
    )
      return;
    try {
      const res = await apiClient.delete<ApiResponse<unknown>>(`/test-cases/${id}`);
      if (res.success) {
        navigate(`/projects/${projectId}/test-cases`);
      } else {
        setGlobalError(res.error || 'Failed to delete test case');
      }
    } catch (err: unknown) {
      setGlobalError((err as Error).message || 'Error deleting test case');
    }
  };

  const handleUpdate = async (data: TestCaseFormData) => {
    setGlobalError('');
    const formattedSteps = data.steps.map((s, i) => ({
      order: i + 1,
      action: s.action,
      expected: s.expected || undefined,
    }));

    const res = await apiClient.put<ApiResponse<TestCase>>(`/test-cases/${id}`, {
      title: data.title,
      type: data.type,
      requirementId: data.requirementId || undefined,
      preconditions: data.preconditions || undefined,
      expectedResult: data.expectedResult,
      steps: formattedSteps,
    });

    if (res.success && res.data) {
      setTestCase(res.data);
      setIsEditing(false);
      if (searchParams.has('edit')) {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('edit');
        setSearchParams(newParams, { replace: true });
      }
    } else {
      throw new Error(res.error || 'Failed to update test case');
    }
  };

  if (loading) return <div style={{ padding: '1.5rem' }}>Loading...</div>;
  if (error || !testCase)
    return <div style={{ padding: '1.5rem', color: 'red' }}>{error || 'Not found'}</div>;

  return (
    <div className="page-container">
      <div className="toolbar">
        <div className="toolbar-left">
          <Link
            to={`/projects/${projectId}/test-cases`}
            style={{ color: 'var(--color-text-muted)', display: 'flex' }}
          >
            <ChevronLeft size={20} />
          </Link>
          <h2>{testCase.title}</h2>
          <span className={`badge badge-${testCase.type.toLowerCase()}`}>{testCase.type}</span>
          {testCase.actionScript && (
            <span
              className="badge"
              style={{ backgroundColor: '#e0f2fe', color: '#0369a1', fontSize: '0.75rem' }}
            >
              ⚡ Script
            </span>
          )}
        </div>
        <div className="toolbar-right">
          {canEdit && !isEditing && (
            <button className="btn-primary" onClick={() => setIsEditing(true)}>
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
              title="Delete Test Case"
            >
              <Trash2 size={16} />
              Delete
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
        {globalError && (
          <div
            style={{
              padding: '1rem',
              color: 'red',
              backgroundColor: '#fee2e2',
              marginBottom: '1rem',
            }}
          >
            {globalError}
          </div>
        )}

        {isEditing ? (
          <TestCaseForm
            initialData={{
              title: testCase.title,
              type: testCase.type,
              requirementId: testCase.requirementId || '',
              preconditions: testCase.preconditions || '',
              expectedResult: testCase.expectedResult,
              steps: testCase.steps.map((s) => ({ action: s.action, expected: s.expected || '' })),
            }}
            onSubmit={async (data) => {
              try {
                await handleUpdate(data);
              } catch (err: unknown) {
                setGlobalError((err as Error).message);
              }
            }}
            onCancel={() => {
              setIsEditing(false);
              if (searchParams.has('edit')) {
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('edit');
                setSearchParams(newParams, { replace: true });
              }
            }}
            submitLabel="Save Changes"
          />
        ) : (
          <>
            <div style={{ marginBottom: '1.5rem' }}>
              <h3
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--color-text-muted)',
                  marginBottom: '0.25rem',
                }}
              >
                LINKED REQUIREMENT
              </h3>
              <div>{testCase.requirement ? testCase.requirement.title : 'None'}</div>
            </div>

            {testCase.preconditions && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--color-text-muted)',
                    marginBottom: '0.25rem',
                  }}
                >
                  PRECONDITIONS
                </h3>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
                  {testCase.preconditions}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1.5rem' }}>
              <h3
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--color-text-muted)',
                  marginBottom: '0.5rem',
                }}
              >
                STEPS
              </h3>
              <table className="data-table" style={{ border: '1px solid var(--color-border)' }}>
                <thead>
                  <tr>
                    <th style={{ width: '50px' }}>#</th>
                    <th>Action</th>
                    <th>Expected Result (Optional)</th>
                  </tr>
                </thead>
                <tbody>
                  {testCase.steps.map((step) => (
                    <tr key={step.order}>
                      <td>{step.order}</td>
                      <td>{step.action}</td>
                      <td>{step.expected || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--color-text-muted)',
                  marginBottom: '0.25rem',
                }}
              >
                EXPECTED RESULT
              </h3>
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  fontSize: '0.9rem',
                  padding: '1rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                }}
              >
                {testCase.expectedResult}
              </div>
            </div>

            <div
              style={{
                marginTop: '2.5rem',
                paddingTop: '2.5rem',
                borderTop: '1px solid var(--color-border)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.75rem',
                }}
              >
                <h3
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--color-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  EXECUTABLE ACTION SCRIPT{' '}
                  {testCase.scriptContent && (
                    <span
                      className="badge"
                      style={{ backgroundColor: '#e0f2fe', color: '#0369a1', fontSize: '0.7rem' }}
                    >
                      ⚡ Configured ({testCase.scriptFormat})
                    </span>
                  )}
                </h3>
                {canEdit && (
                  <button
                    className="btn-secondary"
                    onClick={handleGenerateScript}
                    disabled={generatingScript}
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                  >
                    {generatingScript
                      ? 'Generating...'
                      : testCase.scriptContent
                        ? 'Regenerate Script'
                        : 'Generate Script'}
                  </button>
                )}
              </div>

              {generatingScript && (
                <div
                  style={{
                    padding: '1.5rem',
                    backgroundColor: '#f8fafc',
                    border: '1px dashed var(--color-border)',
                    borderRadius: '4px',
                    textAlign: 'center',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  AI is analyzing the steps and generating the action script...
                </div>
              )}

              {scriptError && (
                <div
                  style={{
                    padding: '1rem',
                    color: '#b91c1c',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fca5a5',
                    borderRadius: '4px',
                    marginBottom: '1rem',
                    fontSize: '0.9rem',
                  }}
                >
                  {scriptError}
                </div>
              )}

              {!generatingScript && (
                <>
                  {editingScriptText !== null && editingScriptFormat !== null ? (
                    <div>
                      <ScriptDisplay
                        format={editingScriptFormat}
                        content={editingScriptText}
                        onChange={setEditingScriptText}
                        disabled={!canEdit}
                      />
                      {canEdit && (
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                          <button
                            className="btn-primary"
                            onClick={handleSaveScript}
                            disabled={savingScript}
                            style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                          >
                            {savingScript ? 'Saving...' : 'Save Script'}
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={() => {
                              setEditingScriptText(testCase.scriptContent || null);
                              setEditingScriptFormat(testCase.scriptFormat || null);
                            }}
                            style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                          >
                            Reset
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '1.5rem',
                        backgroundColor: '#f8fafc',
                        border: '1px solid var(--color-border)',
                        borderRadius: '4px',
                        color: 'var(--color-text-muted)',
                        fontSize: '0.9rem',
                        textAlign: 'center',
                      }}
                    >
                      No executable script generated yet. Click &quot;Generate Script&quot; to
                      create one automatically using AI.
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface ScriptDisplayProps {
  format: string;
  content: string;
  onChange?: (val: string) => void;
  disabled?: boolean;
}

function ScriptDisplay({ format, content, onChange, disabled }: ScriptDisplayProps) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#0f172a',
          padding: '0.5rem 0.75rem',
          borderTopLeftRadius: '4px',
          borderTopRightRadius: '4px',
          borderBottom: '1px solid #334155',
        }}
      >
        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>
          Format: {format}
        </span>
      </div>
      <textarea
        value={content}
        onChange={(e) => onChange?.(e.target.value)}
        rows={16}
        disabled={disabled}
        placeholder={`Executable ${format} source code`}
        style={{
          width: '100%',
          fontFamily: 'monospace',
          fontSize: '0.85rem',
          padding: '0.75rem',
          border: '1px solid var(--color-border)',
          borderTop: 'none',
          borderBottomLeftRadius: '4px',
          borderBottomRightRadius: '4px',
          backgroundColor: '#1e293b',
          color: '#f8fafc',
          resize: 'vertical',
        }}
      />
    </div>
  );
}
