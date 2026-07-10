import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LayoutDashboard, FileCheck2, Server, LogOut, FolderGit2 } from 'lucide-react';
import styles from './Layout.module.css';
import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/apiClient';
import { ApiResponse } from '../../types';

interface Project {
  id: string;
  name: string;
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    if (projectId) {
      apiClient.get<ApiResponse<Project>>(`/projects/${projectId}`).then((res) => {
        if (res.success && res.data) {
          setProject(res.data);
        }
      });
    }
  }, [projectId]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!projectId) return null;

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div
          className={styles.sidebarHeader}
          onClick={() => navigate('/')}
          style={{ cursor: 'pointer' }}
          title="Back to All Projects"
        >
          <FolderGit2 className={styles.logoIcon} />
          <span className={styles.logoText}>AI Testing</span>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navSection}>
            <div className={styles.navSectionTitle}>TEST MANAGEMENT</div>
            <NavLink
              to={`/projects/${projectId}/test-cases`}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <FileCheck2 size={18} />
              <span>Test Cases</span>
            </NavLink>
            <NavLink
              to={`/projects/${projectId}/requirements`}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <LayoutDashboard size={18} />
              <span>Requirements</span>
            </NavLink>
          </div>

          <div className={styles.navSection}>
            <div className={styles.navSectionTitle}>INFRASTRUCTURE</div>
            <NavLink
              to={`/projects/${projectId}/environments`}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <Server size={18} />
              <span>Environments</span>
            </NavLink>
          </div>
        </nav>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            {project && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                }}
              >
                <span style={{ color: 'var(--color-text-muted)' }}>Project /</span>
                <span style={{ color: 'var(--color-text)' }}>{project.name}</span>
              </div>
            )}
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
          <Outlet />
        </div>
      </main>
    </div>
  );
}
