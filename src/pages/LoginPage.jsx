import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginWithEmail } from '../services/authService';
import { useAuth } from '../hooks/useAuth';
import { getHomeUrl } from '../utils/homeUrl';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const homeUrl = getHomeUrl();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginWithEmail(form.email, form.password);
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-hero">
        <div className="brand">
          <div className="brand-mark" />
          <div>Job Fair Queuing system</div>
        </div>
        <div className="auth-copy">
          <p className="muted">Paperless recruiting for modern job fairs</p>
          <h1>One link for applicants. One dashboard for HR.</h1>
          <p>Publish a QR code, collect resumes securely, and manage queueing, screening, notes, and exports from a single place.</p>
        </div>
        <a className="btn btn-secondary" href={homeUrl}>Back to home</a>
        <p className="muted">Built for HR teams who need speed without losing control over applicant data.</p>
      </section>
      <section className="auth-panel">
        <form className="card card-pad auth-form" onSubmit={handleSubmit}>
          <div className="stack">
            <div>
              <h2 className="form-title">Sign in</h2>
              <p className="muted">Use your recruiter or admin account.</p>
            </div>
            {error ? <div className="message message-error">{error}</div> : null}
            <div className="field-grid">
              <label className="field">
                <span>Email</span>
                <input className="input" type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} required />
              </label>
              <label className="field">
                <span>Password</span>
                <input className="input" type="password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} required />
              </label>
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
            <p className="muted">
              Need an account? <Link to="/register">Register recruiter</Link>
            </p>
          </div>
        </form>
      </section>
    </div>
  );
}
