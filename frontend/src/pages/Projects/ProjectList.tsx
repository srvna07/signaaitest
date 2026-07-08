import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../lib/apiClient';
import { ApiResponse, Role } from '../../types';
import { FolderGit2, Plus, LogOut, ArrowRight, Edit } from 'lucide-react';
import styles from '../../components/Layout/Layout.module.css';

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

const COLORS = [
  { bg: '#eff6ff', border: '#bfdbfe', text: '#1e3a8a', iconBg: '#3b82f6', iconText: '#ffffff' }, // blue
  { bg: '#f5f3ff', border: '#ddd6fe', text: '#4c1d95', iconBg: '#8b5cf6', iconText: '#ffffff' }, // purple
  { bg: '#fdf2f8', border: '#fbcfe8', text: '#831843', iconBg: '#ec4899', iconText: '#ffffff' }, // pink
  { bg: '#ecfdf5', border: '#a7f3d0', text: '#064e3b', iconBg: '#10b981', iconText: '#ffffff' }, // emerald
  { bg: '#fffbeb', border: '#fde68a', text: '#78350f', iconBg: '#f59e0b', iconText: '#ffffff' }, // amber
  { bg: '#fef2f2', border: '#fecaca', text: '#7f1d1d', iconBg: '#ef4444', iconText: '#ffffff' }, // red
  { bg: '#f0fdfa', border: '#99f6e4', text: '#134e4a', iconBg: '#14b8a6', iconText: '#ffffff' }, // teal
  { bg: '#faf5ff', border: '#e9d5ff', text: '#581c87', iconBg: '#a855f7', iconText: '#ffffff' }, // fuchsia
];

function getColorForId(id: string) {
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}

export function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // New Project Form State
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit Project State
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [updating, setUpdating] = useState(false);

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const canCreate = user?.role === Role.ADMIN || user?.role === Role.EDITOR;

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await apiClient.get<ApiResponse<Project[]>>('/projects');
      if (res.success && res.data) {
        setProjects(res.data);
      } else {
        setError(res.error || 'Failed to load projects');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    
    setCreating(true);
    try {
      const res = await apiClient.post<ApiResponse<Project>>('/projects', {
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      });
      if (res.success && res.data) {
        setProjects([res.data, ...projects]);
        setShowNewForm(false);
        setNewName('');
        setNewDesc('');
      } else {
        setError(res.error || 'Failed to create project');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleEditStart = (e: React.MouseEvent, p: Project) => {
    e.stopPropagation();
    setEditingProjectId(p.id);
    setEditName(p.name);
    setEditDesc(p.description || '');
  };

  const handleUpdate = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (!editName.trim()) return;
    
    setUpdating(true);
    try {
      const res = await apiClient.put<ApiResponse<Project>>(`/projects/${id}`, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
      });
      if (res.success && res.data) {
        setProjects(projects.map(p => p.id === id ? res.data! : p));
        setEditingProjectId(null);
      } else {
        setError(res.error || 'Failed to update project');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to update project');
    } finally {
      setUpdating(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f3f4f6' }}>
        Loading Projects...
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <main className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FolderGit2 className={styles.logoIcon} size={20} />
              <span className={styles.logoText}>Signa AI Test</span>
            </div>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user?.name || user?.email}</span>
              <span className={styles.userRole}>{user?.role}</span>
            </div>
            <button onClick={handleLogout} className={styles.logoutBtn} title="Log out">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <div className={styles.content}>
          <div className="page-container" style={{ height: 'auto', minHeight: '100%' }}>
            <div className="toolbar">
              <div className="toolbar-left">
                <h2>Projects</h2>
              </div>
              <div className="toolbar-right">
                {canCreate && !showNewForm && (
                  <button
                    onClick={() => setShowNewForm(true)}
                    className="btn-primary"
                  >
                    <Plus size={16} /> Create Project
                  </button>
                )}
              </div>
            </div>

            <div style={{ padding: '1.5rem' }}>
              {error && (
                <div style={{ padding: '1rem', color: 'red', marginBottom: '1rem', backgroundColor: '#fee2e2', borderRadius: '4px' }}>
                  {error}
                </div>
              )}

              {/* Create Form */}
              {showNewForm && (
                <div style={{ marginBottom: '2rem', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '1.5rem', backgroundColor: '#f8fafc' }}>
                  <h3 style={{ marginTop: 0, fontSize: '1rem', marginBottom: '1rem' }}>Create New Project</h3>
                  <form onSubmit={handleCreate}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 500 }}>Project Name *</label>
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="e.g., E-commerce Platform Redesign"
                          required
                          autoFocus
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 500 }}>Description (Optional)</label>
                        <textarea
                          value={newDesc}
                          onChange={(e) => setNewDesc(e.target.value)}
                          placeholder="Briefly describe the purpose of this project..."
                          rows={3}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '0.9rem', resize: 'vertical' }}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => setShowNewForm(false)}
                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'white', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={creating}
                        className="btn-primary"
                      >
                        {creating ? 'Creating...' : 'Create Project'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Projects Grid */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                gap: '1.5rem' 
              }}>
                {projects.map((p) => {
                  const colors = getColorForId(p.id);
                  const isEditing = editingProjectId === p.id;
                  
                  if (isEditing) {
                    return (
                      <div
                        key={p.id}
                        style={{
                          backgroundColor: '#f8fafc',
                          border: `1px solid var(--color-border)`,
                          borderRadius: '6px',
                          padding: '1.25rem',
                          display: 'flex',
                          flexDirection: 'column',
                          height: '160px'
                        }}
                      >
                        <form onSubmit={(e) => handleUpdate(e, p.id)} style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.5rem' }}>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Project Name"
                            required
                            autoFocus
                            style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                          />
                          <textarea
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            placeholder="Description"
                            rows={2}
                            style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '0.8rem', resize: 'none', flex: 1 }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', marginTop: 'auto' }}>
                            <button
                              type="button"
                              onClick={() => setEditingProjectId(null)}
                              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'white', cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={updating}
                              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', border: 'none', borderRadius: '4px', background: 'var(--color-primary)', color: 'white', cursor: 'pointer' }}
                            >
                              {updating ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </form>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}/test-cases`)}
                      style={{
                        backgroundColor: colors.bg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '6px',
                        padding: '1.25rem',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        height: '160px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.name}
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {canCreate && (
                            <button
                              onClick={(e) => handleEditStart(e, p)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: colors.iconBg,
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '4px',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                              title="Edit Project"
                            >
                              <Edit size={16} />
                            </button>
                          )}
                          <div style={{ 
                            width: '28px', 
                            height: '28px', 
                            borderRadius: '50%', 
                            backgroundColor: colors.iconBg,
                            color: colors.iconText,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            flexShrink: 0,
                            fontSize: '0.85rem'
                          }}>
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                        </div>
                      </div>
                      
                      <p style={{ margin: 0, fontSize: '0.85rem', color: colors.text, opacity: 0.8, flex: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {p.description || 'No description provided'}
                      </p>
                      
                      <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: colors.text, opacity: 0.7 }}>
                          Created {new Date(p.createdAt).toLocaleDateString()}
                        </span>
                        <ArrowRight size={16} color={colors.iconBg} />
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Empty State */}
              {projects.length === 0 && !showNewForm && !loading && (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', border: '2px dashed var(--color-border)', borderRadius: '6px' }}>
                  <FolderGit2 size={32} style={{ margin: '0 auto 1rem', color: 'var(--color-text-muted)' }} />
                  <h3 style={{ margin: '0 0 0.5rem 0' }}>No projects yet</h3>
                  <p style={{ margin: '0 0 1.5rem 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                    Get started by creating your first project workspace.
                  </p>
                  {canCreate && (
                    <button
                      onClick={() => setShowNewForm(true)}
                      className="btn-primary"
                    >
                      <Plus size={16} /> Create First Project
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
