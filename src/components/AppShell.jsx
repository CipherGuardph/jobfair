import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import { useAuth } from '../hooks/useAuth';
import { getHomeUrl } from '../utils/homeUrl';

export function AppShell({ children }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const homeUrl = getHomeUrl();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <div>Job Fair Queuing system</div>
            <small className="muted">Recruitment workspace</small>
          </div>
        </div>

        <div className="muted-box">
          <strong>{profile?.displayName || 'Recruiter'}</strong>
          <div className="muted">{profile?.companyName || profile?.email || ''}</div>
        </div>

        <nav className="nav-group">
          <NavLink className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} to="/dashboard">Dashboard</NavLink>
          <NavLink className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} to="/jobfairs/new">Create Job Fair</NavLink>
          <NavLink className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} to="/account">Account</NavLink>
        </nav>

        <a className="btn btn-secondary" href={homeUrl}>Back to home</a>
        <button className="btn btn-ghost" onClick={handleLogout}>Sign out</button>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
