import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { firebaseReady } from '../services/firebase';

const highlights = [
  'Paperless job fair intake',
  'Public QR apply links',
  'Queue monitoring',
  'Resume parsing and matching',
  'Interview scheduling',
  'Audit logs and exports'
];

export function LandingPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [loading, user, navigate]);

  if (!loading && user) {
    return null;
  }

  return (
    <main className="landing-shell">
      <section className="landing-hero card card-dark card-pad">
        <div className="landing-badge">Job fair recruitment system</div>
        <h1 className="page-title">One clean workspace for recruiting at job fairs.</h1>
        <p className="muted" style={{ maxWidth: '64ch' }}>
          Create events, share a public application link or QR code, collect resumes securely, and manage queueing,
          interviews, comments, and exports from one dashboard.
        </p>

        {!firebaseReady ? (
          <div className="message message-info" style={{ marginTop: 16 }}>
            Firebase env values are not configured yet, so sign-in and database features are disabled until you add
            your <code>VITE_FIREBASE_*</code> values.
          </div>
        ) : null}

        <div className="row-actions" style={{ marginTop: 20 }}>
          <Link className="btn btn-primary" to="/login">Sign in</Link>
          <Link className="btn btn-secondary" to="/register">Register recruiter</Link>
          <Link className="btn btn-ghost" to="/queue/demo">View queue screen</Link>
        </div>

        <div className="feature-list">
          {highlights.map((item) => (
            <span key={item} className="badge badge-neutral">{item}</span>
          ))}
        </div>
      </section>

      <section className="landing-grid">
        <article className="card card-dark card-pad">
          <h2 className="section-title">For HR teams</h2>
          <p className="muted">
            Create job fairs, manage applicants, schedule interviews, leave internal notes, and export results without
            exposing applicant data publicly.
          </p>
        </article>

        <article className="card card-dark card-pad">
          <h2 className="section-title">For applicants</h2>
          <p className="muted">
            Submit applications from a mobile-friendly public form, upload a resume, and receive a queue number
            instantly.
          </p>
        </article>

        <article className="card card-dark card-pad">
          <h2 className="section-title">For operations</h2>
          <p className="muted">
            Track status changes, audit activity, notifications, and queue progress with a production-safe Firebase
            setup.
          </p>
        </article>
      </section>
    </main>
  );
}
