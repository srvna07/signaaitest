import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { ApiResponse, TestCase } from '../../types';
import { TestCaseForm, TestCaseFormData } from '../../components/TestCaseForm';

export function TestCaseNew() {
  const navigate = useNavigate();
  const [globalError, setGlobalError] = useState('');

  const handleSubmit = async (data: TestCaseFormData) => {
    setGlobalError('');
    const formattedSteps = data.steps.map((s, i) => ({
      order: i + 1,
      action: s.action,
      expected: s.expected || undefined,
    }));

    const res = await apiClient.post<ApiResponse<TestCase>>('/test-cases', {
      title: data.title,
      type: data.type,
      requirementId: data.requirementId || undefined,
      preconditions: data.preconditions || undefined,
      expectedResult: data.expectedResult,
      steps: formattedSteps,
    });

    if (res.success && res.data) {
      navigate(`/test-cases/${res.data.id}`);
    } else {
      throw new Error(res.error || 'Failed to create test case');
    }
  };

  return (
    <div className="page-container">
      <div className="toolbar">
        <div className="toolbar-left">
          <Link to="/test-cases" style={{ color: 'var(--color-text-muted)', display: 'flex' }}>
            <ChevronLeft size={20} />
          </Link>
          <h2>New Test Case</h2>
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
        <TestCaseForm
          onSubmit={async (data) => {
            try {
              await handleSubmit(data);
            } catch (err: unknown) {
              setGlobalError((err as Error).message);
            }
          }}
          submitLabel="Create Test Case"
        />
      </div>
    </div>
  );
}
