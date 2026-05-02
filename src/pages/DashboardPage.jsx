import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getAccessibleJobFairs, getApplicants } from '../services/jobFairService';
import { formatDateTime } from '../utils/validators';
import { StatusBadge } from '../components/StatusBadge';

export function DashboardPage() {
  const { user, profile } = useAuth();
  const [jobFairs, setJobFairs] = useState([]);
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user) {
        if (active) setLoading(false);
        return;
      }
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
      try {
        const rows = await Promise.all(
          jobFairs.map(async (jobFair) => {
            try {
              const items = await getApplicants(jobFair.id);
              return items.map((item) => ({ ...item, jobFairId: jobFair.id }));
            } catch (applicantError) {
              if ((applicantError?.code || '') !== 'permission-denied') {
                throw applicantError;
              }
              return [];
            }
          })
        );
        if (active) {
          setApplicants(rows.flat());
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Unable to load applicant counts.');
        }
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
    completed: applicants.filter((applicant) => applicant.status === 'Completed').length
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
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Title</th>
                <th>Venue</th>
                <th>Date</th>
                <th>Status</th>
                <th>Applicants</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobFairs.map((jobFair) => (
                <tr key={jobFair.id}>
                  <td>
                    <strong>{jobFair.companyName}</strong>
                    <div className="muted" style={{ fontSize: '0.9rem' }}>/{jobFair.publicSlug}</div>
                  </td>
                  <td>{jobFair.title}</td>
                  <td>{jobFair.venue}</td>
                  <td>{formatDateTime(jobFair.startAt)} - {formatDateTime(jobFair.endAt)}</td>
                  <td><StatusBadge value={jobFair.isSubmissionOpen ? 'open' : 'closed'} /></td>
                  <td>{jobFair.totalApplicants || 0}</td>
                  <td>
                    <div className="row-actions">
                      <Link className="btn btn-secondary btn-small" to={`/jobfairs/${jobFair.id}`}>Open</Link>
                      <Link className="btn btn-ghost btn-small" to={`/jobfairs/${jobFair.id}/applicants`}>Applicants</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
