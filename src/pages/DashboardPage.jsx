import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getAccessibleJobFairs, getApplicants } from '../services/jobFairService';
import { formatDateTime } from '../utils/validators';
import { StatusBadge } from '../components/StatusBadge';

function countStatus(applicants, status) {
  return applicants.filter((applicant) => applicant.status === status).length;
}

export function DashboardPage() {
  const { user, profile } = useAuth();
  const [jobFairs, setJobFairs] = useState([]);
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user) return;
      try {
        const data = await getAccessibleJobFairs(user.uid, profile?.role || 'hr');
        if (active) setJobFairs(data);
      } catch (err) {
        if (active) setError(err.message || 'Unable to load job fairs.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [user, profile?.role]);

  useEffect(() => {
    let active = true;
    const loadApplicantCounts = async () => {
      if (!jobFairs.length) {
        if (active) setApplicants([]);
        return;
      }
      const rows = await Promise.all(jobFairs.map((jobFair) => getApplicants(jobFair.id).then((items) => items.map((item) => ({ ...item, jobFairId: jobFair.id })))));
      if (active) {
        setApplicants(rows.flat());
      }
    };
    loadApplicantCounts();
    return () => {
      active = false;
    };
  }, [jobFairs]);

  const stats = {
    totalJobFairs: jobFairs.length,
    activeJobFairs: jobFairs.filter((jobFair) => jobFair.isSubmissionOpen).length,
    closedJobFairs: jobFairs.filter((jobFair) => !jobFair.isSubmissionOpen).length,
    totalApplicants: jobFairs.reduce((sum, jobFair) => sum + Number(jobFair.totalApplicants || 0), 0),
    passed: jobFairs.reduce((sum, jobFair) => sum + Number(jobFair.totalPassed || 0), 0),
    pending: jobFairs.reduce((sum, jobFair) => {
      const total = Number(jobFair.totalApplicants || 0);
      const closedOut = Number(jobFair.totalPassed || 0) + Number(jobFair.totalFailed || 0) + Number(jobFair.totalCompleted || 0);
      return sum + Math.max(0, total - closedOut);
    }, 0)
  };

  const today = new Date().toISOString().slice(0, 10);
  const dashboardCards = {
    interviewsToday: applicants.filter((applicant) => String(applicant.interviewDate || '') === today).length,
    pendingRequirements: applicants.filter((applicant) => applicant.status === 'Pending Requirements').length,
    highMatch: applicants.filter((applicant) => Number(applicant.matchScore || 0) >= 80).length,
    completed: applicants.filter((applicant) => applicant.status === 'Completed').length,
    needingReview: applicants.filter((applicant) => (applicant.parsedResume?.parserStatus || applicant.parserStatus) === 'failed' || applicant.matchScore === null || applicant.matchScore === undefined || applicant.matchScore === '').length
  };

  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="muted">Manage job fairs, queueing, and applicant status updates.</p>
        </div>
        <div className="toolbar">
          <Link className="btn btn-primary" to="/jobfairs/new">Create job fair</Link>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat"><div className="muted">Job fairs</div><div className="value">{stats.totalJobFairs}</div></div>
        <div className="stat"><div className="muted">Active</div><div className="value">{stats.activeJobFairs}</div></div>
        <div className="stat"><div className="muted">Applicants</div><div className="value">{stats.totalApplicants}</div></div>
        <div className="stat"><div className="muted">Passed</div><div className="value">{stats.passed}</div></div>
      </div>

      <div className="grid-3">
        <div className="stat"><div className="muted">Interviews today</div><div className="value">{dashboardCards.interviewsToday}</div></div>
        <div className="stat"><div className="muted">Pending requirements</div><div className="value">{dashboardCards.pendingRequirements}</div></div>
        <div className="stat"><div className="muted">High match candidates</div><div className="value">{dashboardCards.highMatch}</div></div>
        <div className="stat"><div className="muted">Completed applicants</div><div className="value">{dashboardCards.completed}</div></div>
        <div className="stat"><div className="muted">Applicants needing review</div><div className="value">{dashboardCards.needingReview}</div></div>
      </div>

      <div className="hero-panel">
        <strong>Pending review</strong>
        <div className="muted">Applicants needing screening or interview follow-up: {stats.pending}</div>
      </div>

      {error ? <div className="message message-error">{error}</div> : null}
      {loading ? (
        <div className="card card-dark card-pad">Loading your job fairs...</div>
      ) : jobFairs.length === 0 ? (
        <div className="empty-state">
          <h3>No job fairs yet</h3>
          <p className="muted">Create your first event to generate a public apply link and QR code.</p>
          <Link className="btn btn-primary" to="/jobfairs/new">Create job fair</Link>
        </div>
      ) : (
        <div className="grid-2">
          {jobFairs.map((jobFair) => (
            <article className="card card-dark jobfair-card" key={jobFair.id}>
              <div className="toolbar" style={{ justifyContent: 'space-between' }}>
                <StatusBadge value={jobFair.isSubmissionOpen ? 'open' : 'closed'} />
                <span className="badge badge-neutral">{jobFair.totalApplicants || 0} applicants</span>
              </div>
              <h3>{jobFair.companyName}</h3>
              <h2>{jobFair.title}</h2>
              <p className="muted">{jobFair.venue}</p>
              <p className="muted">
                {formatDateTime(jobFair.startAt)} - {formatDateTime(jobFair.endAt)}
              </p>
              <div className="row-actions">
                <Link className="btn btn-secondary btn-small" to={`/jobfairs/${jobFair.id}`}>View details</Link>
                <Link className="btn btn-ghost btn-small" to={`/jobfairs/${jobFair.id}/applicants`}>Manage applicants</Link>
              </div>
              <small className="muted">Public link: /apply/{jobFair.publicSlug}</small>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
