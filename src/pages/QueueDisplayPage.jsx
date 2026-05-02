import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicJobFairBySlug } from '../services/jobFairService';
import { StatusBadge } from '../components/StatusBadge';

export function QueueDisplayPage() {
  const { publicSlug } = useParams();
  const [jobFair, setJobFair] = useState(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const load = async () => {
      setJobFair(await getPublicJobFairBySlug(publicSlug));
    };

    load();
    const timeTimer = setInterval(() => setNow(new Date()), 1000);
    const refreshTimer = setInterval(load, 15000);

    return () => {
      clearInterval(timeTimer);
      clearInterval(refreshTimer);
    };
  }, [publicSlug]);

  const summary = useMemo(() => ({
    nowServing: jobFair?.nowServingApplicants || [],
    nextApplicants: jobFair?.nextApplicants || [],
    waitingCount: Number(jobFair?.waitingCount || 0),
    completedCount: Number(jobFair?.completedCount || 0)
  }), [jobFair]);

  if (!jobFair) {
    return <div className="card card-dark card-pad">Loading queue monitor...</div>;
  }

  return (
    <div className="content" style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div className="card card-dark card-pad stack" style={{ minHeight: '92vh' }}>
        <div className="topbar">
          <div>
            <h1 className="page-title">{jobFair.title}</h1>
            <p className="muted">{jobFair.companyName} · {jobFair.venue}</p>
          </div>
          <div className="badge badge-info">{now.toLocaleString()}</div>
        </div>

        <div className="grid-3">
          <div className="stat"><div className="muted">Waiting</div><div className="value">{summary.waitingCount}</div></div>
          <div className="stat"><div className="muted">Completed</div><div className="value">{summary.completedCount}</div></div>
          <div className="stat"><div className="muted">Submissions</div><div className="value">{jobFair.isSubmissionOpen ? 'Open' : 'Closed'}</div></div>
        </div>

        <div className="grid-2">
          <div className="card card-pad" style={{ color: 'var(--text-dark)' }}>
            <h3 style={{ marginTop: 0 }}>Now serving</h3>
            <div className="stack">
              {summary.nowServing.length === 0 ? (
                <div className="empty-state">No applicant is currently being served.</div>
              ) : (
                summary.nowServing.map((item) => (
                  <div key={`${item.queueNumber}-${item.calledAt || ''}`} className="muted-box">
                    <div className="value" style={{ margin: 0 }}>{item.queueNumber}</div>
                    <StatusBadge value={item.status} />
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card card-pad" style={{ color: 'var(--text-dark)' }}>
            <h3 style={{ marginTop: 0 }}>Next 5 applicants</h3>
            <div className="stack">
              {summary.nextApplicants.length === 0 ? (
                <div className="empty-state">No queued applicants yet.</div>
              ) : (
                summary.nextApplicants.map((item) => (
                  <div key={`${item.queueNumber}-${item.status}`} className="muted-box">
                    <div className="toolbar" style={{ justifyContent: 'space-between' }}>
                      <strong>{item.queueNumber}</strong>
                      <StatusBadge value={item.status} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
