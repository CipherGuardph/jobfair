import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { createJobFair } from '../services/jobFairService';
import { dateToInputValue, nowLocalIso } from '../utils/dateHelpers';
import { isValidEmail } from '../utils/validators';

function emptyPosition() {
  return { title: '', description: '', requiredSkills: '', slotsAvailable: 1 };
}

function emptyChecklistItem() {
  return { label: '', required: true };
}

export function CreateJobFairPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    companyName: profile?.companyName || '',
    title: '',
    venue: '',
    description: '',
    startAt: nowLocalIso(),
    endAt: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
    isSubmissionOpen: true,
    contactPerson: profile?.displayName || '',
    contactEmail: user?.email || '',
    contactPhone: '',
    bannerUrl: '',
    positions: [emptyPosition()],
    checklistTemplate: [emptyChecklistItem()]
  });

  const updatePosition = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      positions: prev.positions.map((item, idx) => (idx === index ? { ...item, [key]: value } : item))
    }));
  };

  const updateChecklist = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      checklistTemplate: prev.checklistTemplate.map((item, idx) => (idx === index ? { ...item, [key]: value } : item))
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!form.positions.length) {
      setError('Add at least one position.');
      return;
    }
    if (!isValidEmail(form.contactEmail)) {
      setError('Enter a valid contact email.');
      return;
    }
    if (new Date(form.startAt) >= new Date(form.endAt)) {
      setError('Start date must be before end date.');
      return;
    }

    setLoading(true);
    try {
      const result = await createJobFair({
        ownerUid: user.uid,
        companyName: form.companyName,
        title: form.title,
        venue: form.venue,
        description: form.description,
        startAt: new Date(form.startAt),
        endAt: new Date(form.endAt),
        isSubmissionOpen: form.isSubmissionOpen,
        contactPerson: form.contactPerson,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        bannerUrl: form.bannerUrl,
        positions: form.positions.filter((item) => item.title.trim()),
        checklistTemplate: form.checklistTemplate.filter((item) => item.label.trim())
      });
      setMessage('Job fair created successfully.');
      navigate(`/jobfairs/${result.id}`);
    } catch (err) {
      setError(err.message || 'Unable to create job fair.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Create job fair</h1>
        <p className="muted">Set up a public application page and QR code in one step.</p>
      </div>
      {error ? <div className="message message-error">{error}</div> : null}
      {message ? <div className="message message-success">{message}</div> : null}
      <form className="card card-dark card-pad stack" onSubmit={handleSubmit}>
        <div className="grid-2">
          <label className="field"><span>Company name</span><input className="input" value={form.companyName} onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))} required /></label>
          <label className="field"><span>Job fair title</span><input className="input" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} required /></label>
          <label className="field"><span>Venue / location</span><input className="input" value={form.venue} onChange={(e) => setForm((prev) => ({ ...prev, venue: e.target.value }))} required /></label>
          <label className="field"><span>Contact person</span><input className="input" value={form.contactPerson} onChange={(e) => setForm((prev) => ({ ...prev, contactPerson: e.target.value }))} required /></label>
          <label className="field"><span>Contact email</span><input className="input" type="email" value={form.contactEmail} onChange={(e) => setForm((prev) => ({ ...prev, contactEmail: e.target.value }))} required /></label>
          <label className="field"><span>Contact phone</span><input className="input" value={form.contactPhone} onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: e.target.value }))} /></label>
        </div>
        <label className="field">
          <span>Description</span>
          <textarea className="textarea" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
        </label>
        <label className="field">
          <span>Banner / logo URL</span>
          <input className="input" value={form.bannerUrl} onChange={(e) => setForm((prev) => ({ ...prev, bannerUrl: e.target.value }))} />
        </label>
        <div className="grid-2">
          <label className="field"><span>Start date and time</span><input className="input" type="datetime-local" value={dateToInputValue(form.startAt)} onChange={(e) => setForm((prev) => ({ ...prev, startAt: e.target.value }))} required /></label>
          <label className="field"><span>End date and time</span><input className="input" type="datetime-local" value={dateToInputValue(form.endAt)} onChange={(e) => setForm((prev) => ({ ...prev, endAt: e.target.value }))} required /></label>
        </div>

        <div className="stack">
          <h3 className="section-title">Positions</h3>
          {form.positions.map((position, index) => (
            <div key={index} className="card card-dark card-pad stack">
              <div className="grid-2">
                <label className="field"><span>Title</span><input className="input" value={position.title} onChange={(e) => updatePosition(index, 'title', e.target.value)} required /></label>
                <label className="field"><span>Slots available</span><input className="input" type="number" min="1" value={position.slotsAvailable} onChange={(e) => updatePosition(index, 'slotsAvailable', Number(e.target.value))} /></label>
              </div>
              <label className="field"><span>Description</span><textarea className="textarea" value={position.description} onChange={(e) => updatePosition(index, 'description', e.target.value)} /></label>
              <label className="field"><span>Required skills</span><input className="input" value={position.requiredSkills} onChange={(e) => updatePosition(index, 'requiredSkills', e.target.value)} /></label>
            </div>
          ))}
          <button className="btn btn-ghost btn-small" type="button" onClick={() => setForm((prev) => ({ ...prev, positions: [...prev.positions, emptyPosition()] }))}>
            Add position
          </button>
        </div>

        <div className="stack">
          <h3 className="section-title">Checklist template</h3>
          {form.checklistTemplate.map((item, index) => (
            <div key={index} className="grid-2">
              <label className="field"><span>Checklist item</span><input className="input" value={item.label} onChange={(e) => updateChecklist(index, 'label', e.target.value)} /></label>
              <label className="field"><span>Required</span><select className="select" value={String(item.required)} onChange={(e) => updateChecklist(index, 'required', e.target.value === 'true')}><option value="true">Yes</option><option value="false">No</option></select></label>
            </div>
          ))}
          <button className="btn btn-ghost btn-small" type="button" onClick={() => setForm((prev) => ({ ...prev, checklistTemplate: [...prev.checklistTemplate, emptyChecklistItem()] }))}>
            Add checklist item
          </button>
        </div>

        <label className="field">
          <span>Submission status</span>
          <select className="select" value={String(form.isSubmissionOpen)} onChange={(e) => setForm((prev) => ({ ...prev, isSubmissionOpen: e.target.value === 'true' }))}>
            <option value="true">Open</option>
            <option value="false">Closed</option>
          </select>
        </label>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create job fair'}
        </button>
      </form>
    </div>
  );
}
