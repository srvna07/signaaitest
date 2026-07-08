import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { ApiResponse, TestCase } from '../../types';

export function TestCaseDetail() {
  const { id } = useParams<{ id: string }>();
  const [testCase, setTestCase] = useState<TestCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  if (loading) return <div style={{ padding: '1.5rem' }}>Loading...</div>;
  if (error || !testCase)
    return <div style={{ padding: '1.5rem', color: 'red' }}>{error || 'Not found'}</div>;

  return (
    <div className="page-container">
      <div className="toolbar">
        <div className="toolbar-left">
          <Link to="/test-cases" style={{ color: 'var(--color-text-muted)', display: 'flex' }}>
            <ChevronLeft size={20} />
          </Link>
          <h2>{testCase.title}</h2>
          <span className={`badge badge-${testCase.type.toLowerCase()}`}>{testCase.type}</span>
        </div>
      </div>

      <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
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
      </div>
    </div>
  );
}
