import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { addApplicantInternalComment, getApplicant, getApplicantTimeline, getJobFairById } from '../services/jobFairService';
import { refreshApplicantAnalysis, updateApplicantStatus } from '../services/applicantService';
import { StatusBadge } from '../components/StatusBadge';
import { MatchBadge } from '../components/MatchBadge';
import { formatDateTime } from '../utils/validators';
import { useAuth } from '../hooks/useAuth';

const STATUS_OPTIONS = [
  'Submitted',
  'For Screening',
  'For Interview',
  'Interviewed',
  'Pending Requirements',
  'Passed',
  'Failed',
  'Completed'
];

function timelineLabel(item) {
  if (item.source === 'comment') return 'Internal comment';
  const map = {
    submitted_application: 'Submitted application',
    analysis_updated: 'Resume parsed',
    resume_reparsed: 'Resume parsed',
    resume_reparsed_and_matched: 'Resume parsed',
    status_changed: 'Status changed',
    interview_scheduled: 'Interview scheduled',
    interview_rescheduled: 'Interview rescheduled',
    interview_cancelled: 'Interview cancelled',
    interview_completed: 'Interview completed',
    checklist_updated: 'Requirements updated',
    rating_changed: 'Rating updated',
    notes_changed: 'Notes updated',
    applicant_completed: 'Applicant completed',
    notification_sent: 'Notification sent',
    internal_comment_added: 'Internal comment added'
  };
  return map[item.action] || item.action || 'Activity';
}

export function ApplicantDetailPage() {
  const { jobFairId, applicantId } = useParams();
  const { user, profile } = useAuth();
  const [jobFair, setJobFair] = useState(null);
  const [applicant, setApplicant] = useState(null);
  const [form, setForm] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [commentForm, setCommentForm] = useState({ comment: '', taggedRecruiterName: '' });
  const [message, setMessage] = useState('');

  const load = async () => {
    const [jobFairData, applicantData, timelineData] = await Promise.all([
      getJobFairById(jobFairId),
      getApplicant(jobFairId, applicantId),
      getApplicantTimeline(jobFairId, applicantId)
    ]);
    setJobFair(jobFairData);
    setApplicant(applicantData);
    setForm({
      ...applicantData,
      parsedSkillsText: (applicantData.parsedResume?.extractedSkills || []).join(', '),
      parsedEducation: applicantData.parsedResume?.extractedEducation || '',
      parsedExperience: applicantData.parsedResume?.extractedExperience || '',
      matchNotes: applicantData.matchNotes || '',
      finalRecommendation: applicantData.finalRecommendation || '',
      interviewDate: applicantData.interviewDate || '',
      interviewTime: applicantData.interviewTime || '',
      interviewType: applicantData.interviewType || '',
      interviewLocation: applicantData.interviewLocation || '',
      meetingLink: applicantData.meetingLink || '',
      assignedInterviewer: applicantData.assignedInterviewer || '',
      interviewStatus: applicantData.interviewStatus || 'scheduled'
    });
    setTimeline(timelineData);
  };

  useEffect(() => {
    load();
  }, [jobFairId, applicantId]);

  if (!applicant || !form) {
    return <div className="card card-dark card-pad">Loading applicant...</div>;
  }

  const parsedResume = applicant.parsedResume || {};
  const parsedSkillsInput = form.parsedSkillsText;
  const parsedSkills = typeof parsedSkillsInput === 'string'
    ? parsedSkillsInput.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)
    : (parsedResume.extractedSkills || []);

  const saveDetails = async () => {
    await updateApplicantStatus({
      jobFairId,
      applicantId,
      status: form.status || applicant.status,
      interviewedBy: form.interviewedBy || '',
      assignedRecruiterId: form.assignedRecruiterId || '',
      interviewRoom: form.interviewRoom || '',
      rating: Number(form.rating || 0),
      notes: form.notes || '',
      interviewNotes: form.interviewNotes || '',
      finalResult: form.finalResult || '',
      matchNotes: form.matchNotes || '',
      finalRecommendation: form.finalRecommendation || '',
      parsedResumePatch: {
        extractedSkills: parsedSkills,
        extractedEducation: form.parsedEducation || '',
        extractedExperience: form.parsedExperience || ''
      },
      checklist: (form.checklist || []).map((item) => ({
        ...item,
        checkedBy: item.checked ? item.checkedBy || profile?.displayName || user?.email || 'HR' : item.checkedBy || '',
        checkedAt: item.checked ? item.checkedAt || new Date().toISOString() : item.checkedAt || null
      }))
    });

    setMessage('Applicant saved.');
    await load();
  };

  const saveInterviewSchedule = async (interviewAction = 'schedule') => {
    const nextAction = interviewAction === 'schedule' && applicant.interviewDate ? 'reschedule' : interviewAction;
    await updateApplicantStatus({
      jobFairId,
      applicantId,
      interviewAction: nextAction,
      status: form.status || applicant.status || 'For Interview',
      interviewedBy: form.interviewedBy || '',
      assignedRecruiterId: form.assignedRecruiterId || '',
      assignedRecruiterName: profile?.displayName || user?.email || '',
      assignedInterviewer: form.assignedInterviewer || '',
      interviewDate: form.interviewDate || '',
      interviewTime: form.interviewTime || '',
      interviewType: form.interviewType || 'onsite',
      interviewLocation: form.interviewLocation || '',
      meetingLink: form.meetingLink || '',
      interviewStatus: form.interviewStatus || (nextAction === 'cancel' ? 'cancelled' : nextAction === 'complete' ? 'completed' : 'scheduled')
    });
    setMessage(`Interview ${nextAction}.`);
    await load();
  };

  const addComment = async () => {
    if (!commentForm.comment.trim()) return;
    await addApplicantInternalComment(jobFairId, applicantId, {
      actorId: user?.uid,
      actorName: profile?.displayName || user?.email || 'HR',
      comment: commentForm.comment.trim(),
      taggedRecruiterName: commentForm.taggedRecruiterName.trim()
    });
    setCommentForm({ comment: '', taggedRecruiterName: '' });
    setMessage('Internal comment added.');
    await load();
  };

  const handleStatusChange = async (status) => {
    await updateApplicantStatus({ jobFairId, applicantId, status, interviewedBy: form.interviewedBy || '' });
    setMessage(`Status updated to ${status}.`);
    await load();
  };

  const handleQueueAction = async (queueAction) => {
    const nextStatus =
      queueAction === 'interviewed' ? 'Interviewed'
        : queueAction === 'completed' ? 'Completed'
        : 'For Interview';

    await updateApplicantStatus({
      jobFairId,
      applicantId,
      queueAction,
      status: nextStatus,
      interviewedBy: form.interviewedBy || '',
      assignedRecruiterId: form.assignedRecruiterId || '',
      interviewRoom: form.interviewRoom || '',
      rating: Number(form.rating || 0),
      notes: form.notes || '',
      interviewNotes: form.interviewNotes || '',
      finalResult: form.finalResult || '',
      checklist: form.checklist || []
    });
    setMessage(`Applicant marked ${queueAction.replace('_', ' ')}.`);
    await load();
  };

  const rerunParsing = async () => {
    await refreshApplicantAnalysis({ jobFairId, applicantId, mode: 'both' });
    setMessage('Resume parsing refreshed.');
    await load();
  };

  const recalcMatch = async () => {
    await refreshApplicantAnalysis({ jobFairId, applicantId, mode: 'match' });
    setMessage('Match score recalculated.');
    await load();
  };

  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1 className="page-title">{applicant.fullName}</h1>
          <p className="muted">{jobFair?.title}</p>
        </div>
        <div className="toolbar">
          <StatusBadge value={applicant.status} />
          <MatchBadge score={applicant.matchScore} parserStatus={parsedResume.parserStatus} needsReview={parsedResume.parserStatus !== 'success'} />
        </div>
      </div>

      {message ? <div className="message message-success">{message}</div> : null}

      <div className="grid-2">
        <div className="card card-dark card-pad stack">
          <h3 className="section-title">Profile</h3>
          <div className="compact-list">
            <li><span>Queue number</span><span>{applicant.queueNumber}</span></li>
            <li><span>Email</span><span>{applicant.email}</span></li>
            <li><span>Phone</span><span>{applicant.phone}</span></li>
            <li><span>Position</span><span>{applicant.positionApplied}</span></li>
            <li><span>Submitted</span><span>{formatDateTime(applicant.createdAt)}</span></li>
          </div>
          <label className="field">
            <span>Status</span>
            <select className="select" value={form.status || applicant.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <button className="btn btn-secondary" type="button" onClick={() => handleStatusChange(form.status || applicant.status)}>Update status</button>
          <label className="field">
            <span>Interviewed by</span>
            <input className="input" value={form.interviewedBy || ''} onChange={(e) => setForm((prev) => ({ ...prev, interviewedBy: e.target.value }))} />
          </label>
          <label className="field">
            <span>Assigned recruiter</span>
            <input className="input" value={form.assignedRecruiterId || ''} onChange={(e) => setForm((prev) => ({ ...prev, assignedRecruiterId: e.target.value }))} />
          </label>
          <label className="field">
            <span>Assigned interviewer</span>
            <input className="input" value={form.assignedInterviewer || ''} onChange={(e) => setForm((prev) => ({ ...prev, assignedInterviewer: e.target.value }))} />
          </label>
          <label className="field">
            <span>Interview room</span>
            <select className="select" value={form.interviewRoom || ''} onChange={(e) => setForm((prev) => ({ ...prev, interviewRoom: e.target.value }))}>
              <option value="">Select room</option>
              {['HR Desk 1', 'HR Desk 2', 'Interview Room 1', 'Interview Room 2'].map((room) => (
                <option key={room} value={room}>{room}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Rating</span>
            <input className="input" type="number" min="0" max="5" value={form.rating || 0} onChange={(e) => setForm((prev) => ({ ...prev, rating: e.target.value }))} />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Interview date</span>
              <input className="input" type="date" value={form.interviewDate || ''} onChange={(e) => setForm((prev) => ({ ...prev, interviewDate: e.target.value }))} />
            </label>
            <label className="field">
              <span>Interview time</span>
              <input className="input" type="time" value={form.interviewTime || ''} onChange={(e) => setForm((prev) => ({ ...prev, interviewTime: e.target.value }))} />
            </label>
            <label className="field">
              <span>Interview type</span>
              <select className="select" value={form.interviewType || 'onsite'} onChange={(e) => setForm((prev) => ({ ...prev, interviewType: e.target.value }))}>
                <option value="onsite">Onsite</option>
                <option value="phone">Phone</option>
                <option value="video">Video</option>
              </select>
            </label>
            <label className="field">
              <span>Interview status</span>
              <select className="select" value={form.interviewStatus || 'scheduled'} onChange={(e) => setForm((prev) => ({ ...prev, interviewStatus: e.target.value }))}>
                <option value="scheduled">Scheduled</option>
                <option value="rescheduled">Rescheduled</option>
                <option value="cancelled">Cancelled</option>
                <option value="completed">Completed</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Interview location</span>
            <input className="input" value={form.interviewLocation || ''} onChange={(e) => setForm((prev) => ({ ...prev, interviewLocation: e.target.value }))} />
          </label>
          <label className="field">
            <span>Meeting link</span>
            <input className="input" value={form.meetingLink || ''} onChange={(e) => setForm((prev) => ({ ...prev, meetingLink: e.target.value }))} />
          </label>
          <div className="muted-box">
            <strong>Match summary</strong>
            <div className="muted">{applicant.matchSummary || 'No match summary yet.'}</div>
          </div>
          <div className="toolbar">
            <button className="btn btn-secondary btn-small" type="button" onClick={() => handleQueueAction('for_interview')}>For Interview</button>
            <button className="btn btn-secondary btn-small" type="button" onClick={() => handleQueueAction('now_serving')}>Now Serving</button>
            <button className="btn btn-secondary btn-small" type="button" onClick={() => handleQueueAction('interviewed')}>Interviewed</button>
            <button className="btn btn-secondary btn-small" type="button" onClick={() => handleQueueAction('completed')}>Completed</button>
            <button className="btn btn-ghost btn-small" type="button" onClick={() => saveInterviewSchedule('schedule')}>Save interview</button>
            <button className="btn btn-ghost btn-small" type="button" onClick={() => saveInterviewSchedule('reschedule')}>Reschedule</button>
            <button className="btn btn-ghost btn-small" type="button" onClick={() => saveInterviewSchedule('cancel')}>Cancel interview</button>
            <button className="btn btn-ghost btn-small" type="button" onClick={() => saveInterviewSchedule('complete')}>Complete interview</button>
          </div>
        </div>

        <div className="card card-dark card-pad stack">
          <h3 className="section-title">Resume and notes</h3>
          <div className="resume-preview">
            <strong>Resume</strong>
            <a href={applicant.resumeDownloadUrl || '#'} target="_blank" rel="noreferrer">
              {applicant.resumeDownloadUrl ? 'Open resume' : 'No resume link available'}
            </a>
          </div>
          <div className="toolbar">
            <button className="btn btn-secondary btn-small" type="button" onClick={rerunParsing}>Re-run parsing</button>
            <button className="btn btn-ghost btn-small" type="button" onClick={recalcMatch}>Recalculate match score</button>
          </div>
          <div className="muted-box">
            <strong>Parsed resume</strong>
            <div className="compact-list">
              <li><span>Parser status</span><span>{parsedResume.parserStatus || 'pending'}</span></li>
              <li><span>Extracted name</span><span>{parsedResume.extractedName || '-'}</span></li>
              <li><span>Extracted email</span><span>{parsedResume.extractedEmail || '-'}</span></li>
              <li><span>Extracted phone</span><span>{parsedResume.extractedPhone || '-'}</span></li>
            </div>
            <div className="divider" />
            <div className="muted">Matched skills: {(applicant.matchedSkills || []).join(', ') || '-'}</div>
            <div className="muted">Missing skills: {(applicant.missingSkills || []).join(', ') || '-'}</div>
            <div className="divider" />
            <div className="muted">Raw text preview</div>
            <textarea className="textarea" readOnly value={parsedResume.rawText || ''} style={{ minHeight: 160 }} />
          </div>
          <label className="field">
            <span>Extracted skills</span>
            <textarea
              className="textarea"
              value={form.parsedSkillsText !== undefined ? form.parsedSkillsText : (parsedSkills || []).join(', ')}
              onChange={(e) => setForm((prev) => ({ ...prev, parsedSkillsText: e.target.value }))}
              placeholder="Comma or newline separated skills"
            />
          </label>
          <label className="field">
            <span>Extracted education</span>
            <textarea className="textarea" value={form.parsedEducation !== undefined ? form.parsedEducation : (parsedResume.extractedEducation || '')} onChange={(e) => setForm((prev) => ({ ...prev, parsedEducation: e.target.value }))} />
          </label>
          <label className="field">
            <span>Extracted experience</span>
            <textarea className="textarea" value={form.parsedExperience !== undefined ? form.parsedExperience : (parsedResume.extractedExperience || '')} onChange={(e) => setForm((prev) => ({ ...prev, parsedExperience: e.target.value }))} />
          </label>
          <label className="field">
            <span>General notes</span>
            <textarea className="textarea" value={form.notes || ''} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
          </label>
          <label className="field">
            <span>Interview notes</span>
            <textarea className="textarea" value={form.interviewNotes || ''} onChange={(e) => setForm((prev) => ({ ...prev, interviewNotes: e.target.value }))} />
          </label>
          <label className="field">
            <span>Final result</span>
            <textarea className="textarea" value={form.finalResult || ''} onChange={(e) => setForm((prev) => ({ ...prev, finalResult: e.target.value }))} />
          </label>
          <label className="field">
            <span>Match notes</span>
            <textarea className="textarea" value={form.matchNotes || ''} onChange={(e) => setForm((prev) => ({ ...prev, matchNotes: e.target.value }))} />
          </label>
          <label className="field">
            <span>Final recommendation</span>
            <textarea className="textarea" value={form.finalRecommendation || ''} onChange={(e) => setForm((prev) => ({ ...prev, finalRecommendation: e.target.value }))} />
          </label>
          <div className="compact-list">
            <li><span>Called at</span><span>{formatDateTime(applicant.calledAt)}</span></li>
            <li><span>Interviewed at</span><span>{formatDateTime(applicant.interviewedAt)}</span></li>
            <li><span>Completed at</span><span>{formatDateTime(applicant.completedAt)}</span></li>
          </div>
          <div className="muted-box">
            <strong>Internal comments</strong>
            <div className="field-grid" style={{ marginTop: 12 }}>
              <label className="field">
                <span>Comment</span>
                <textarea className="textarea" value={commentForm.comment} onChange={(e) => setCommentForm((prev) => ({ ...prev, comment: e.target.value }))} />
              </label>
              <label className="field">
                <span>Tag recruiter by name</span>
                <input className="input" value={commentForm.taggedRecruiterName} onChange={(e) => setCommentForm((prev) => ({ ...prev, taggedRecruiterName: e.target.value }))} />
              </label>
              <button className="btn btn-secondary btn-small" type="button" onClick={addComment}>Add internal comment</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card card-dark card-pad stack">
        <h3 className="section-title">Requirements checklist</h3>
        <div className="stack">
          {(form.checklist || []).map((item, index) => (
            <label className="checklist-item" key={item.id || index}>
              <input
                type="checkbox"
                checked={!!item.checked}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm((prev) => ({
                    ...prev,
                    checklist: prev.checklist.map((entry, idx) => idx === index ? { ...entry, checked } : entry)
                  }));
                }}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
        <button className="btn btn-primary" type="button" onClick={saveDetails}>Save applicant</button>
      </div>

      <div className="card card-dark card-pad stack">
        <h3 className="section-title">Timeline</h3>
        <div className="stack">
          {timeline.map((item) => (
            <div key={item.id} className="muted-box">
              <strong>{timelineLabel(item)}</strong>
              <div className="muted">{formatDateTime(item.createdAt)} · {item.actorName || 'System'}</div>
              {item.source === 'comment' ? (
                <div className="muted">{item.comment}</div>
              ) : (
                <div className="muted">
                  {item.action === 'internal_comment_added' ? item.newValue?.comment : ''}
                </div>
              )}
            </div>
          ))}
          {timeline.length === 0 ? <div className="muted">No activity yet.</div> : null}
        </div>
      </div>
    </div>
  );
}

