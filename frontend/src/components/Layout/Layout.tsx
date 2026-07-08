import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LayoutDashboard, FileCheck2, Server, LogOut, TestTube2 } from 'lucide-react';
import styles from './Layout.module.css';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <TestTube2 className={styles.logoIcon} />
          <span className={styles.logoText}>Signa AI Test</span>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navSection}>
            <div className={styles.navSectionTitle}>TEST MANAGEMENT</div>
            <NavLink
              to="/test-cases"
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <FileCheck2 size={18} />
              <span>Test Cases</span>
            </NavLink>
            <NavLink
              to="/requirements"
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
              to="/environments"
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
          <div className={styles.headerLeft}>{/* Breadcrumbs or page title could go here */}</div>
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
