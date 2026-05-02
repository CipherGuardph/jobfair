import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { buildPublicLink, buildQueueLink, generateQr, getApplicants, getJobFairById, getRecentAuditLogs, updateJobFairSubmissionState } from '../services/jobFairService';
import { useAuth } from '../hooks/useAuth';
import { formatDateTime } from '../utils/validators';
import { QRCodeCard } from '../components/QRCodeCard';
import { StatusBadge } from '../components/StatusBadge';

export function JobFairDetailPage() {
  const { jobFairId } = useParams();
  const location = useLocation();
  const { user, profile } = useAuth();
  const [jobFair, setJobFair] = useState(location.state?.jobFair || null);
  const [applicants, setApplicants] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const data = await getJobFairById(jobFairId);
      if (!data) {
        setJobFair(null);
        setError('Job fair not found.');
        return;
      }

      setJobFair(data);
      if (data?.publicSlug) {
        setQrDataUrl(await generateQr(data.publicSlug));
      }
      setApplicants(await getApplicants(jobFairId));
      setAuditLogs(await getRecentAuditLogs(jobFairId, 8));
    } catch (loadError) {
      setApplicants([]);
      setAuditLogs([]);
      setQrDataUrl('');
      if (!jobFair) {
        setJobFair(null);
        setError(loadError?.message || 'Unable to load job fair.');
      } else {
        setError(loadError?.message || 'Unable to refresh job fair from Firestore.');
      }
    }
  };

  useEffect(() => {
    load();
  }, [jobFairId]);

  const stats = useMemo(() => {
    const nowServingCount = applicants.filter((applicant) => applicant.calledAt && !applicant.interviewedAt && !applicant.completedAt).length;
    const forInterviewCount = applicants.filter((applicant) => applicant.status === 'For Interview' && !applicant.calledAt).length;
    const interviewedCount = applicants.filter((applicant) => applicant.status === 'Interviewed' || applicant.interviewedAt).length;
    const waitingCount = applicants.filter((applicant) =>
      !applicant.calledAt &&
      !applicant.interviewedAt &&
      !applicant.completedAt &&
      !['Interviewed', 'Passed', 'Failed', 'Completed'].includes(applicant.status)
    ).length;
    return {
      totalApplicants: applicants.length,
      waiting: waitingCount,
      forScreening: applicants.filter((applicant) => applicant.status === 'For Screening').length,
      forInterview: forInterviewCount,
      nowServing: nowServingCount,
      interviewed: interviewedCount,
      pendingRequirements: applicants.filter((applicant) => applicant.status === 'Pending Requirements').length,
      passed: applicants.filter((applicant) => applicant.status === 'Passed').length,
      failed: applicants.filter((applicant) => applicant.status === 'Failed').length,
      completed: applicants.filter((applicant) => applicant.status === 'Completed').length
    };
  }, [applicants]);

  if (!jobFair) {
    return <div className="card card-dark card-pad">{error ? `Unable to load job fair: ${error}` : 'Loading job fair...'}</div>;
  }

  const publicLink = buildPublicLink(jobFair.publicSlug);
  const queueLink = buildQueueLink(jobFair.publicSlug);

  const handleToggle = async () => {
    await updateJobFairSubmissionState(jobFairId, !jobFair.isSubmissionOpen, profile?.displayName || user.email, user.uid);
    setMessage(`Submissions ${jobFair.isSubmissionOpen ? 'closed' : 'opened'}.`);
    setMessageType('info');
    await load();
  };

  const handleCopy = async (value) => {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const temp = document.createElement('textarea');
        temp.value = value;
        temp.setAttribute('readonly', 'true');
        temp.style.position = 'fixed';
        temp.style.left = '-9999px';
        temp.style.top = '0';
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(temp);
        if (!copied) {
          throw new Error('Copy failed');
        }
      }
      setMessage('Copied to clipboard.');
      setMessageType('info');
    } catch (copyError) {
      console.error('Clipboard copy failed', copyError);
      setMessage('Copy failed. Please copy the link manually.');
      setMessageType('error');
    }
  };

  const handleDownloadQr = () => {
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `${jobFair.publicSlug}-qr.png`;
    link.click();
  };

  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1 className="page-title">{jobFair.title}</h1>
          <p className="muted">{jobFair.companyName} · {jobFair.venue}</p>
        </div>
        <div className="toolbar">
          <Link className="btn btn-secondary" to={`/jobfairs/${jobFairId}/applicants`}>Manage applicants</Link>
          <button className="btn btn-primary" onClick={handleToggle}>
            {jobFair.isSubmissionOpen ? 'Close submissions' : 'Open submissions'}
          </button>
        </div>
      </div>

      {message ? <div className={`message message-${messageType}`}>{message}</div> : null}

      <div className="grid-2">
        <div className="card card-dark card-pad stack">
          <h3 className="section-title">Event details</h3>
          <div className="muted">{jobFair.description}</div>
          <div className="compact-list">
            <li><span>Start</span><span>{formatDateTime(jobFair.startAt)}</span></li>
            <li><span>End</span><span>{formatDateTime(jobFair.endAt)}</span></li>
            <li><span>Submission status</span><StatusBadge value={jobFair.isSubmissionOpen ? 'open' : 'closed'} /></li>
            <li><span>Contact</span><span>{jobFair.contactPerson} · {jobFair.contactEmail}</span></li>
          </div>
          <div className="stack">
            <div className="toolbar">
              <button className="btn btn-secondary btn-small" onClick={() => handleCopy(publicLink)}>Copy application link</button>
              <button className="btn btn-ghost btn-small" onClick={() => handleCopy(queueLink)}>Copy queue link</button>
              <button className="btn btn-ghost btn-small" onClick={handleDownloadQr} disabled={!qrDataUrl}>Download QR</button>
            </div>
            <div className="muted-box">
              <strong>Public link</strong>
              <div className="muted" style={{ wordBreak: 'break-all' }}>{publicLink}</div>
            </div>
          </div>
        </div>
        <div className="card card-dark card-pad stack">
          <h3 className="section-title">QR code</h3>
          <QRCodeCard dataUrl={qrDataUrl} link={publicLink} />
        </div>
      </div>

      <div className="grid-3">
        {[
          ['Total applicants', stats.totalApplicants],
          ['Waiting', stats.waiting],
          ['For screening', stats.forScreening],
          ['For interview', stats.forInterview],
          ['Now serving', stats.nowServing],
          ['Interviewed', stats.interviewed],
          ['Pending requirements', stats.pendingRequirements],
          ['Passed', stats.passed],
          ['Failed', stats.failed],
          ['Completed', stats.completed]
        ].map(([label, value]) => (
          <div className="stat" key={label}>
            <div className="muted">{label}</div>
            <div className="value">{value}</div>
          </div>
        ))}
      </div>

      <div className="card card-dark card-pad stack">
        <h3 className="section-title">Positions</h3>
        <div className="grid-2">
          {jobFair.positions?.map((position) => (
            <div key={position.id || position.title} className="muted-box">
              <strong>{position.title}</strong>
              <div className="muted">{position.description}</div>
              <div className="muted">Skills: {position.requiredSkills}</div>
              <div className="muted">Slots: {position.slotsAvailable}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-dark card-pad stack">
        <h3 className="section-title">Latest audit logs</h3>
        <div className="stack">
          {auditLogs.length === 0 ? (
            <div className="muted">No audit logs yet.</div>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="muted-box">
                <strong>{log.action}</strong>
                <div className="muted">{log.actorName} · {formatDateTime(log.createdAt)}</div>
                <div className="muted">Target: {log.targetType} / {log.targetId}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
