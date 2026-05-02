import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function LandingPage() {
  const { user } = useAuth();

  return (
    <main className="landing-shell">
      <section className="landing-hero card card-dark card-pad">
        <div className="landing-badge">Job fair recruitment system</div>
        <h1 className="page-title">Simple recruiting for job fairs.</h1>
        <p className="muted landing-copy">
          Create an event, share one link, and manage applicants from one place.
        </p>

        <div className="row-actions landing-actions">
          <Link className="btn btn-primary" to={user ? '/dashboard' : '/login'}>
            {user ? 'Go to dashboard' : 'Sign in'}
          </Link>
          {!user ? <Link className="btn btn-secondary" to="/register">Register recruiter</Link> : null}
        </div>

      </section>

    </main>
  );
}
