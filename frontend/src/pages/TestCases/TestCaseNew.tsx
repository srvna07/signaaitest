import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { ApiResponse, Requirement, TestCaseStep } from '../../types';

export function TestCaseNew() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requirements, setRequirements] = useState<Requirement[]>([]);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<'UI' | 'API'>('UI');
  const [requirementId, setRequirementId] = useState('');
  const [preconditions, setPreconditions] = useState('');
  const [expectedResult, setExpectedResult] = useState('');
  const [steps, setSteps] = useState<Omit<TestCaseStep, 'order'>[]>([{ action: '', expected: '' }]);

  useEffect(() => {
    const fetchReqs = async () => {
      try {
        const res = await apiClient.get<ApiResponse<Requirement[]>>('/requirements');
        if (res.success && res.data) setRequirements(res.data);
      } catch (err: unknown) {
        // Ignore error for dropdown population
      }
    };
    fetchReqs();
  }, []);

  const handleAddStep = () => {
    setSteps([...steps, { action: '', expected: '' }]);
  };

  const handleRemoveStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const handleStepChange = (index: number, field: keyof (typeof steps)[0], value: string) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setSteps(newSteps);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formattedSteps = steps.map((s, i) => ({
      order: i + 1,
      action: s.action,
      expected: s.expected || undefined,
    }));

    try {
      const res = await apiClient.post<ApiResponse<any>>('/test-cases', {
        title,
        type,
        requirementId: requirementId || undefined,
        preconditions: preconditions || undefined,
        expectedResult,
        steps: formattedSteps,
      });

      if (res.success && res.data) {
        navigate(`/test-cases/${res.data.id}`);
      } else {
        setError(res.error || 'Failed to create test case');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'An error occurred');
    } finally {
      setLoading(false);
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
        {error && (
          <div
            style={{
              padding: '1rem',
              color: 'red',
              backgroundColor: '#fee2e2',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '800px' }}
        >
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Title *</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{
                  padding: '0.5rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                }}
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Type *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'UI' | 'API')}
                style={{
                  padding: '0.5rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                }}
              >
                <option value="UI">UI</option>
                <option value="API">API</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Linked Requirement</label>
            <select
              value={requirementId}
              onChange={(e) => setRequirementId(e.target.value)}
              style={{
                padding: '0.5rem',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                backgroundColor: 'white',
              }}
            >
              <option value="">-- None --</option>
              {requirements.map((req) => (
                <option key={req.id} value={req.id}>
                  {req.title}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Preconditions</label>
            <textarea
              rows={3}
              value={preconditions}
              onChange={(e) => setPreconditions(e.target.value)}
              style={{
                padding: '0.5rem',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
              }}
            >
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Steps *</label>
              <button
                type="button"
                onClick={handleAddStep}
                className="btn-primary"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
              >
                <Plus size={14} /> Add Step
              </button>
            </div>
            <table className="data-table" style={{ border: '1px solid var(--color-border)' }}>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th>Action *</th>
                  <th>Expected Result</th>
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {steps.map((step, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>
                      <input
                        required
                        value={step.action}
                        onChange={(e) => handleStepChange(idx, 'action', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.3rem',
                          border: '1px solid var(--color-border)',
                          borderRadius: '2px',
                        }}
                      />
                    </td>
                    <td>
                      <input
                        value={step.expected}
                        onChange={(e) => handleStepChange(idx, 'expected', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.3rem',
                          border: '1px solid var(--color-border)',
                          borderRadius: '2px',
                        }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleRemoveStep(idx)}
                        disabled={steps.length === 1}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: steps.length === 1 ? '#ccc' : 'red',
                          cursor: steps.length === 1 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>
              Overall Expected Result *
            </label>
            <textarea
              required
              rows={3}
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
              style={{
                padding: '0.5rem',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Test Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
