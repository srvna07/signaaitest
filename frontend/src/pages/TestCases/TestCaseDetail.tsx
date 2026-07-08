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
          <Link to={`/projects/${projectId}/test-cases`} style={{ color: 'var(--color-text-muted)', display: 'flex' }}>
            <ChevronLeft size={20} />
          </Link>
          <h2>{testCase.title}</h2>
          <span className={`badge badge-${testCase.type.toLowerCase()}`}>{testCase.type}</span>
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
          </>
        )}
      </div>
    </div>
  );
}
