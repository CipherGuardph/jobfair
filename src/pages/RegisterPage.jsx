import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerRecruiter } from '../services/authService';
import { getHomeUrl } from '../utils/homeUrl';

export function RegisterPage() {
  const navigate = useNavigate();
  const homeUrl = getHomeUrl();
  const [form, setForm] = useState({
    displayName: '',
    companyName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await registerRecruiter(form);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Unable to create account.');
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
          <p className="muted">Recruiter onboarding</p>
          <h1>Create a secure HR workspace.</h1>
          <p>Start with a recruiter account. Admin accounts can be seeded separately for production.</p>
        </div>
        <a className="btn btn-secondary" href={homeUrl}>Back to home</a>
      </section>
      <section className="auth-panel">
        <form className="card card-pad auth-form" onSubmit={handleSubmit}>
          <div className="stack">
            <div>
              <h2 className="form-title">Register recruiter</h2>
              <p className="muted">New accounts default to the HR role.</p>
            </div>
            {error ? <div className="message message-error">{error}</div> : null}
            <div className="field-grid">
              <label className="field">
                <span>Display name</span>
                <input className="input" value={form.displayName} onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))} required />
              </label>
              <label className="field">
                <span>Company name</span>
                <input className="input" value={form.companyName} onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))} required />
              </label>
              <label className="field">
                <span>Email</span>
                <input className="input" type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} required />
              </label>
              <label className="field">
                <span>Password</span>
                <input className="input" type="password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} required />
              </label>
              <label className="field">
                <span>Confirm password</span>
                <input className="input" type="password" value={form.confirmPassword} onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} required />
              </label>
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </button>
            <p className="muted">
              Already have one? <Link to="/login">Sign in</Link>
            </p>
          </div>
        </form>
      </section>
    </div>
  );
}
