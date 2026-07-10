import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { ApiResponse, TestCase, Environment } from '../../types';
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
  const canRun = canEdit || user?.role === 'RUNNER';

  const [isEditing, setIsEditing] = useState(false);
  const [globalError, setGlobalError] = useState('');

  const [generatingScript, setGeneratingScript] = useState(false);
  const [savingScript, setSavingScript] = useState(false);
  const [isDeletingScript, setIsDeletingScript] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [scriptError, setScriptError] = useState('');
  const [editingScriptText, setEditingScriptText] = useState<string | null>(null);
  const [editingScriptFormat, setEditingScriptFormat] = useState<string | null>(null);

  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedRunEnvId, setSelectedRunEnvId] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [runFrame, setRunFrame] = useState('');
  const [runUrl, setRunUrl] = useState('');
  const [runResult, setRunResult] = useState<{ passed: boolean; output: string; message: string } | null>(null);
  const [runError, setRunError] = useState('');

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
    setSaveSuccess(false);
    try {
      const res = await apiClient.put<ApiResponse<TestCase>>(`/test-cases/${id}/script`, {
        format: editingScriptFormat,
        content: editingScriptText,
      });
      if (res.success && res.data) {
        setTestCase(res.data);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setScriptError(res.error || 'Failed to save script');
      }
    } catch (err: unknown) {
      setScriptError((err as Error).message || 'Error saving script');
    } finally {
      setSavingScript(false);
    }
  };

  const handleDeleteScript = async () => {
    if (!window.confirm('Are you sure you want to delete the configured action script?')) return;
    setIsDeletingScript(true);
    setScriptError('');
    try {
      const res = await apiClient.delete<ApiResponse<TestCase>>(`/test-cases/${id}/script`);
      if (res.success && res.data) {
        setTestCase(res.data);
        setEditingScriptText(null);
        setEditingScriptFormat(null);
      } else {
        setScriptError(res.error || 'Failed to delete script');
      }
    } catch (err: unknown) {
      setScriptError((err as Error).message || 'Error deleting script');
    } finally {
      setIsDeletingScript(false);
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
    const fetchEnvironments = async () => {
      try {
        const res = await apiClient.get<ApiResponse<Environment[]>>(`/environments?projectId=${projectId}`);
        if (res.success && res.data) {
          setEnvironments(res.data);
          if (res.data.length > 0) setSelectedRunEnvId(res.data[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch environments', err);
      }
    };
    fetchTestCase();
    fetchEnvironments();
  }, [id, projectId]);

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

  const handleRun = async () => {
    if (!selectedRunEnvId) {
      setRunError('Please select an environment');
      return;
    }
    setIsRunning(true);
    setRunError('');
    setRunResult(null);
    setRunFrame('');
    setRunUrl('');
    
    const token = localStorage.getItem('token');
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/browser-stream?token=${token ?? ''}`;
    
    const streamId = crypto.randomUUID();
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'listen_run', streamId }));
      
      apiClient.post<ApiResponse<{ passed: boolean; output: string }>>(`/test-cases/${id}/run`, {
        environmentId: selectedRunEnvId,
        streamId,
      }).then(res => {
        if (res.success && res.data) {
          setRunResult({ passed: res.data.passed, output: res.data.output, message: res.data.passed ? 'Execution Passed' : 'Execution Failed' });
        } else {
          setRunError(res.error || 'Execution failed');
        }
      }).catch(err => {
        setRunError((err as Error).message || 'Error running test case');
      }).finally(() => {
        setIsRunning(false);
        ws.close();
      });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'frame' && msg.frame) {
          setRunFrame(`data:image/jpeg;base64,${msg.frame}`);
        } else if (msg.type === 'url' && msg.url) {
          setRunUrl(msg.url);
        } else if (msg.type === 'result') {
          // handled by the POST response, but could also set here
        } else if (msg.type === 'error') {
          setRunError(msg.message || 'Error in stream');
        }
      } catch (e) {}
    };

    ws.onerror = () => {
      setRunError('WebSocket stream connection error');
    };
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
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
                          <button
                            className="btn-primary"
                            onClick={handleSaveScript}
                            disabled={savingScript}
                            style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                          >
                            {savingScript ? 'Saving...' : 'Save Script'}
                          </button>
                          {testCase.scriptContent && (
                            <button
                              className="btn-secondary"
                              onClick={handleDeleteScript}
                              disabled={isDeletingScript}
                              style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem', color: '#dc2626', borderColor: '#fca5a5' }}
                            >
                              {isDeletingScript ? 'Deleting...' : 'Delete Script'}
                            </button>
                          )}
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
                          {saveSuccess && (
                            <span style={{ fontSize: '0.85rem', color: '#16a34a', marginLeft: '0.5rem' }}>✓ Saved successfully!</span>
                          )}
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

            {testCase.type === 'UI' && testCase.scriptContent && canRun && (
              <div
                style={{
                  marginTop: '2.5rem',
                  paddingTop: '2.5rem',
                  borderTop: '1px solid var(--color-border)',
                }}
              >
                <h3 style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                  RUN TEST EXECUTION
                </h3>
                
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                  <select
                    value={selectedRunEnvId}
                    onChange={(e) => setSelectedRunEnvId(e.target.value)}
                    className="form-input"
                    style={{ width: '250px' }}
                    disabled={isRunning}
                  >
                    <option value="" disabled>Select Environment...</option>
                    {environments.map((env) => (
                      <option key={env.id} value={env.id}>{env.name} ({env.type})</option>
                    ))}
                  </select>
                  <button
                    className="btn-primary"
                    onClick={handleRun}
                    disabled={isRunning || !selectedRunEnvId}
                    style={{ backgroundColor: '#10b981', borderColor: '#059669', minWidth: '100px' }}
                  >
                    {isRunning ? 'Running...' : 'Run Test'}
                  </button>
                </div>

                {runError && (
                  <div style={{ padding: '1rem', color: '#b91c1c', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '4px', marginBottom: '1rem' }}>
                    {runError}
                  </div>
                )}

                {isRunning && runFrame && (
                  <div style={{ position: 'relative', marginBottom: '1rem' }}>
                    {runUrl && (
                      <div style={{ backgroundColor: '#f1f5f9', padding: '0.5rem 1rem', border: '1px solid #e2e8f0', borderBottom: 'none', borderTopLeftRadius: '4px', borderTopRightRadius: '4px', fontSize: '0.875rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.5rem', wordBreak: 'break-all' }}>
                        <span style={{ color: '#94a3b8' }}>🔗</span> {runUrl}
                      </div>
                    )}
                    <img src={runFrame} alt="Live Run Stream" style={{ width: '100%', border: '1px solid #e2e8f0', borderTopLeftRadius: runUrl ? '0' : '4px', borderTopRightRadius: runUrl ? '0' : '4px', borderBottomLeftRadius: '4px', borderBottomRightRadius: '4px', display: 'block' }} />
                    <div style={{ position: 'absolute', top: runUrl ? '48px' : '10px', right: '10px', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%', display: 'inline-block' }}></span>
                      LIVE EXECUTION
                    </div>
                  </div>
                )}

                {runResult && (
                  <div style={{ padding: '1.5rem', backgroundColor: runResult.passed ? '#f0fdf4' : '#fef2f2', border: `1px solid ${runResult.passed ? '#bbf7d0' : '#fca5a5'}`, borderRadius: '4px' }}>
                    <h4 style={{ color: runResult.passed ? '#166534' : '#991b1b', marginBottom: '0.5rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {runResult.passed ? '✅ ' : '❌ '} {runResult.message}
                    </h4>
                    <pre style={{ backgroundColor: '#1e293b', color: '#f8fafc', padding: '1rem', borderRadius: '4px', fontSize: '0.8rem', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                      {runResult.output}
                    </pre>
                  </div>
                )}
              </div>
            )}
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
