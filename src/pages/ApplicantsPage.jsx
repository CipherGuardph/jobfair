import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { exportApplicantsCsv, refreshApplicantAnalysis, updateApplicantStatus } from '../services/applicantService';
import { getApplicants, getJobFairById } from '../services/jobFairService';
import { StatusBadge } from '../components/StatusBadge';
import { MatchBadge } from '../components/MatchBadge';
import { downloadCsv } from '../utils/csvExport';
import { formatDateTime } from '../utils/validators';

const STATUS_OPTIONS = [
  '',
  'Submitted',
  'For Screening',
  'For Interview',
  'Interviewed',
  'Pending Requirements',
  'Passed',
  'Failed',
  'Completed'
];

export function ApplicantsPage() {
  const { jobFairId } = useParams();
  const [jobFair, setJobFair] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [recruiterFilter, setRecruiterFilter] = useState('');
  const [parserFilter, setParserFilter] = useState('');
  const [matchFilter, setMatchFilter] = useState('');
  const [sortKey, setSortKey] = useState('queueIndex');
  const [message, setMessage] = useState('');
  const [savedFilters, setSavedFilters] = useState([]);

  useEffect(() => {
    const stored = window.localStorage.getItem(`jobfair-filters-${jobFairId}`);
    if (!stored) return;
    try {
      setSavedFilters(JSON.parse(stored));
    } catch {
      setSavedFilters([]);
    }
  }, [jobFairId]);

  const persistSavedFilters = (next) => {
    setSavedFilters(next);
    window.localStorage.setItem(`jobfair-filters-${jobFairId}`, JSON.stringify(next));
  };

  const load = async () => {
    const [jobFairData, applicantData] = await Promise.all([getJobFairById(jobFairId), getApplicants(jobFairId)]);
    setJobFair(jobFairData);
    setApplicants(applicantData);
  };

  useEffect(() => {
    load();
  }, [jobFairId]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    const rows = applicants.filter((applicant) => {
      const matchesTerm = !term || [applicant.fullName, applicant.phone, applicant.email, applicant.queueNumber]
        .some((field) => String(field || '').toLowerCase().includes(term));
      const matchesStatus = !statusFilter || applicant.status === statusFilter;
      const matchesPosition = !positionFilter || applicant.positionId === positionFilter || applicant.positionApplied === positionFilter;
      const matchesRecruiter = !recruiterFilter || applicant.assignedRecruiterId === recruiterFilter || applicant.assignedRecruiterName === recruiterFilter;
      const parserStatus = applicant.parsedResume?.parserStatus || applicant.parserStatus || '';
      const matchesParser = !parserFilter || parserStatus === parserFilter;
      const score = Number(applicant.matchScore || 0);
      const matchesMatch =
        !matchFilter ||
        (matchFilter === 'high' && score >= 80) ||
        (matchFilter === 'medium' && score >= 50 && score < 80) ||
        (matchFilter === 'low' && score < 50);
      return matchesTerm && matchesStatus && matchesPosition && matchesRecruiter && matchesParser && matchesMatch;
    });

    return [...rows].sort((a, b) => {
      if (sortKey === 'matchScore') {
        return Number(b.matchScore || 0) - Number(a.matchScore || 0);
      }
      if (sortKey === 'interviewDate') {
        return String(a.interviewDate || '').localeCompare(String(b.interviewDate || ''));
      }
      if (sortKey === 'createdAt') {
        return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
      }
      return (a.queueIndex || 0) - (b.queueIndex || 0);
    });
  }, [applicants, search, statusFilter, positionFilter, recruiterFilter, parserFilter, matchFilter, sortKey]);

  const handleQuickStatus = async (applicant, status) => {
    await updateApplicantStatus({
      jobFairId,
      applicantId: applicant.id,
      status,
      interviewedBy: applicant.interviewedBy || ''
    });
    setMessage(`${applicant.fullName} updated to ${status}.`);
    await load();
  };

  const handleQueueAction = async (applicant, queueAction) => {
    const nextStatus =
      queueAction === 'interviewed' ? 'Interviewed'
        : queueAction === 'completed' ? 'Completed'
        : 'For Interview';

    await updateApplicantStatus({
      jobFairId,
      applicantId: applicant.id,
      queueAction,
      status: nextStatus,
      interviewedBy: applicant.interviewedBy || '',
      interviewRoom: applicant.interviewRoom || ''
    });
    setMessage(`${applicant.fullName} marked ${queueAction.replace('_', ' ')}.`);
    await load();
  };

  const handleExport = async () => {
    const csv = await exportApplicantsCsv({ jobFairId, filters: {} });
    downloadCsv(`${jobFair?.publicSlug || 'applicants'}.csv`, csv);
  };

  const applyPreset = (preset) => {
    setSearch(preset.search || '');
    setStatusFilter(preset.status || '');
    setPositionFilter(preset.position || '');
    setRecruiterFilter(preset.recruiter || '');
    setParserFilter(preset.parser || '');
    setMatchFilter(preset.match || '');
    setSortKey(preset.sort || 'queueIndex');
  };

  const saveCurrentPreset = () => {
    const name = window.prompt('Save this filter preset as:');
    if (!name) return;
    const next = [
      ...savedFilters.filter((item) => item.name !== name),
      {
        name,
        search,
        status: statusFilter,
        position: positionFilter,
        recruiter: recruiterFilter,
        parser: parserFilter,
        match: matchFilter,
        sort: sortKey
      }
    ];
    persistSavedFilters(next);
  };

  const runAnalysis = async (applicant, mode) => {
    await refreshApplicantAnalysis({
      jobFairId,
      applicantId: applicant.id,
      mode
    });
    setMessage(`${applicant.fullName} analysis refreshed.`);
    await load();
  };

  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1 className="page-title">Applicants</h1>
          <p className="muted">{jobFair?.title || 'Job fair'} · searchable applicant table</p>
        </div>
        <div className="toolbar">
          <button className="btn btn-secondary" onClick={handleExport}>Export CSV</button>
          <Link className="btn btn-primary" to={`/jobfairs/${jobFairId}`}>Back to event</Link>
        </div>
      </div>

      {message ? <div className="message message-success">{message}</div> : null}

      <div className="card card-dark card-pad stack">
        <div className="toolbar">
          <button className="btn btn-ghost btn-small" type="button" onClick={() => applyPreset({ status: 'Passed' })}>Passed applicants</button>
          <button className="btn btn-ghost btn-small" type="button" onClick={() => applyPreset({ status: 'Pending Requirements' })}>Pending requirements</button>
          <button className="btn btn-ghost btn-small" type="button" onClick={() => applyPreset({ match: 'high' })}>High match score</button>
          <button className="btn btn-ghost btn-small" type="button" onClick={() => applyPreset({ parser: 'failed' })}>Parser failed</button>
          <button className="btn btn-secondary btn-small" type="button" onClick={saveCurrentPreset}>Save current filter</button>
        </div>
        <div className="grid-3">
          <label className="field">
            <span>Search</span>
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone, email, queue #" />
          </label>
          <label className="field">
            <span>Status</span>
            <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_OPTIONS.map((status) => <option key={status || 'all'} value={status}>{status || 'All statuses'}</option>)}
            </select>
          </label>
        </div>
        <div className="grid-3">
          <label className="field">
            <span>Position filter</span>
            <select className="select" value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}>
              <option value="">All positions</option>
              {(jobFair?.positions || []).map((position) => (
                <option key={position.id || position.title} value={position.id || position.title}>{position.title}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Assigned recruiter</span>
            <select className="select" value={recruiterFilter} onChange={(e) => setRecruiterFilter(e.target.value)}>
              <option value="">All recruiters</option>
              {(jobFair?.assignedRecruiters || []).map((recruiterId) => (
                <option key={recruiterId} value={recruiterId}>{recruiterId}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Parser status</span>
            <select className="select" value={parserFilter} onChange={(e) => setParserFilter(e.target.value)}>
              <option value="">All parser states</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
          </label>
          <label className="field">
            <span>Match score</span>
            <select className="select" value={matchFilter} onChange={(e) => setMatchFilter(e.target.value)}>
              <option value="">All scores</option>
              <option value="high">High (80-100)</option>
              <option value="medium">Medium (50-79)</option>
              <option value="low">Low (&lt; 50)</option>
            </select>
          </label>
          <label className="field">
            <span>Sort</span>
            <select className="select" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
              <option value="queueIndex">Queue number</option>
              <option value="createdAt">Submitted date</option>
              <option value="matchScore">Match score</option>
              <option value="interviewDate">Interview date</option>
            </select>
          </label>
        </div>
        <div className="toolbar">
          {savedFilters.length === 0 ? <span className="muted">No saved filters yet.</span> : null}
          {savedFilters.map((preset) => (
            <button key={preset.name} className="btn btn-ghost btn-small" type="button" onClick={() => applyPreset(preset)}>
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Queue #</th>
              <th>Full name</th>
              <th>Position</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Status</th>
              <th>Match</th>
              <th>Parser</th>
              <th>Skills</th>
              <th>Recruiter</th>
              <th>Interview</th>
              <th>Interviewed by</th>
              <th>Checklist</th>
              <th>Rating</th>
              <th>Submitted</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((applicant) => {
              const checklistDone = applicant.checklist?.filter((item) => item.checked).length || 0;
              const checklistTotal = applicant.checklist?.length || 0;
              return (
                <tr key={applicant.id}>
                  <td>{applicant.queueNumber}</td>
                  <td>{applicant.fullName}</td>
                  <td>{applicant.positionApplied}</td>
                  <td>{applicant.phone}</td>
                  <td>{applicant.email}</td>
                  <td><StatusBadge value={applicant.status} /></td>
                  <td><MatchBadge score={applicant.matchScore} parserStatus={applicant.parsedResume?.parserStatus || applicant.parserStatus} needsReview={applicant.matchScore === null || applicant.matchScore === undefined || applicant.matchScore === '' || applicant.parsedResume?.parserStatus === 'failed'} /></td>
                  <td>{applicant.parsedResume?.parserStatus || applicant.parserStatus || '-'}</td>
                  <td>{(applicant.parsedResume?.extractedSkills || applicant.skills?.split(',') || []).filter(Boolean).slice(0, 3).join(', ') || '-'}</td>
                  <td>{applicant.assignedRecruiterName || applicant.assignedRecruiterId || '-'}</td>
                  <td>{applicant.interviewDate ? `${applicant.interviewDate} ${applicant.interviewTime || ''}` : '-'}</td>
                  <td>{applicant.interviewedBy || '-'}</td>
                  <td>{checklistDone}/{checklistTotal}</td>
                  <td>{applicant.rating || 0}</td>
                  <td>{formatDateTime(applicant.createdAt)}</td>
                  <td>
                    <div className="row-actions">
                      <Link className="btn btn-ghost btn-small" to={`/jobfairs/${jobFairId}/applicants/${applicant.id}`}>Open</Link>
                      <button className="btn btn-secondary btn-small" type="button" onClick={() => handleQueueAction(applicant, 'for_interview')}>For Interview</button>
                      <button className="btn btn-secondary btn-small" type="button" onClick={() => handleQueueAction(applicant, 'now_serving')}>Now Serving</button>
                      <button className="btn btn-secondary btn-small" type="button" onClick={() => handleQueueAction(applicant, 'interviewed')}>Interviewed</button>
                      <button className="btn btn-secondary btn-small" type="button" onClick={() => handleQueueAction(applicant, 'completed')}>Completed</button>
                      <button className="btn btn-ghost btn-small" type="button" onClick={() => runAnalysis(applicant, 'both')}>Re-run analysis</button>
                      <select className="select" defaultValue={applicant.status} onChange={(e) => handleQuickStatus(applicant, e.target.value)}>
                        {STATUS_OPTIONS.filter(Boolean).map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

