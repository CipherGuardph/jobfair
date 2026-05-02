import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { functions, storage } from '../services/firebase';
import { getPublicJobFairBySlug } from '../services/jobFairService';
import { createQrCodeDataUrl } from '../utils/qrCode';
import { isAllowedResumeSize, isAllowedResumeType, isBetweenDates, isValidEmail, isValidPhone } from '../utils/validators';

function buildSubmissionId() {
  return crypto.randomUUID();
}

export function PublicApplyPage() {
  const { publicSlug } = useParams();
  const [jobFair, setJobFair] = useState(null);
  const [qr, setQr] = useState('');
  const [submissionId] = useState(() => {
    const storageKey = `jobfair-submission-${publicSlug}`;
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = buildSubmissionId();
    sessionStorage.setItem(storageKey, created);
    return created;
  });
  const [resumeFile, setResumeFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    dateOfBirth: '',
    positionApplied: '',
    positionId: '',
    education: '',
    workExperienceSummary: '',
    skills: '',
    consentAccepted: false
  });

  useEffect(() => {
    const load = async () => {
      const data = await getPublicJobFairBySlug(publicSlug);
      setJobFair(data);
      if (data?.publicSlug) {
        setQr(await createQrCodeDataUrl(`${window.location.origin}/apply/${data.publicSlug}`));
      }
    };
    load();
  }, [publicSlug]);

  const statusMessage = useMemo(() => {
    if (!jobFair) return 'Loading event...';
    const now = new Date();
    if (!isBetweenDates(now, jobFair.startAt, jobFair.endAt)) {
      if (now < new Date(jobFair.startAt?.toDate ? jobFair.startAt.toDate() : jobFair.startAt)) {
        return 'This job fair is not yet open.';
      }
      return 'Submissions are closed.';
    }
    if (!jobFair.isSubmissionOpen) {
      return 'Submissions are currently closed.';
    }
    return '';
  }, [jobFair]);

  const canApply = jobFair && !statusMessage;

  const handleFile = (event) => {
    const file = event.target.files?.[0] || null;
    setResumeFile(file);
    if (file && !isAllowedResumeType(file)) {
      setError('Resume file not allowed. Use PDF, DOC, or DOCX.');
    } else if (file && !isAllowedResumeSize(file)) {
      setError('Resume file is too large. Maximum size is 5 MB.');
    } else {
      setError('');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!storage || !functions) {
      setError('Application services are not available yet. Please try again in a moment.');
      return;
    }
    if (!canApply) {
      setError(statusMessage || 'Submissions are closed.');
      return;
    }
    if (!form.consentAccepted) {
      setError('Consent is required.');
      return;
    }
    if (!isValidEmail(form.email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!isValidPhone(form.phone)) {
      setError('Enter a valid phone number.');
      return;
    }
    if (!resumeFile) {
      setError('Please upload your resume.');
      return;
    }
    if (!isAllowedResumeType(resumeFile)) {
      setError('Resume file not allowed.');
      return;
    }
    if (!isAllowedResumeSize(resumeFile)) {
      setError('Resume file is too large.');
      return;
    }

    setLoading(true);
    try {
      const safeName = resumeFile.name.replace(/[^\w.-]+/g, '_');
      const fileRef = ref(storage, `jobFairs/${jobFair.jobFairId}/applicants/${submissionId}/resume/${Date.now()}-${safeName}`);
      await uploadBytes(fileRef, resumeFile, { contentType: resumeFile.type });
      const downloadUrl = await getDownloadURL(fileRef);

      const submit = httpsCallable(functions, 'createApplicantSubmission');
      const result = await submit({
        publicSlug,
        jobFairId: jobFair.jobFairId,
        applicant: {
          ...form,
          consentAccepted: true
        },
        resumeStoragePath: fileRef.fullPath,
        resumeDownloadUrl: downloadUrl,
        applicantId: submissionId
      });
      setConfirmation({
        queueNumber: result.data.queueNumber,
        applicantId: result.data.applicantId
      });
    } catch (err) {
      setError(err.message || 'Submission failed.');
    } finally {
      setLoading(false);
    }
  };

  if (confirmation) {
    return (
      <div className="auth-shell apply-shell">
        <section className="auth-hero apply-hero">
          <div className="brand">
            <div className="brand-mark" />
            <div>{jobFair?.title || 'Job fair'}</div>
          </div>
          <div className="hero-panel apply-hero-panel">
            <h1>Application submitted</h1>
            <p className="muted">Your queue number is:</p>
            <h2 style={{ fontSize: '3rem', margin: '0.2em 0' }}>{confirmation.queueNumber}</h2>
            <p className="muted">Please keep this reference for screening and interview updates.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="auth-shell apply-shell">
      <section className="auth-hero apply-hero">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <div>{jobFair?.companyName || 'Job Fair'}</div>
            <small className="muted">Public application</small>
          </div>
        </div>
        <div className="auth-copy">
          <p className="muted">{jobFair?.venue || ''}</p>
          <h1>{jobFair?.title || 'Application form'}</h1>
          <p>{jobFair?.description || 'Submit your details and resume securely from your phone.'}</p>
        </div>
        <div className="hero-panel apply-hero-panel">
          <div className="muted">Scan QR / open link</div>
          {qr ? <img src={qr} alt="QR code" width="180" height="180" /> : <div className="muted">Loading QR code...</div>}
        </div>
      </section>
      <section className="auth-panel apply-form-panel">
        <form className="card card-pad auth-form applicant-form apply-form-card" onSubmit={handleSubmit}>
          <div className="stack">
            <h2 className="form-title">Applicant details</h2>
            {statusMessage ? <div className="message message-info">{statusMessage}</div> : null}
            {error ? <div className="message message-error">{error}</div> : null}
            {message ? <div className="message message-success">{message}</div> : null}
            <div className="field-grid">
              <label className="field"><span>Full name</span><input className="input" value={form.fullName} onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))} required /></label>
              <label className="field"><span>Email</span><input className="input" type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} required /></label>
              <label className="field"><span>Phone number</span><input className="input" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} required /></label>
              <label className="field"><span>Address</span><input className="input" value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} /></label>
              <label className="field"><span>Date of birth</span><input className="input" type="date" value={form.dateOfBirth} onChange={(e) => setForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))} /></label>
              <label className="field">
                <span>Position applying for</span>
                <select className="select" value={form.positionId} onChange={(e) => {
                  const position = (jobFair?.positions || []).find((item) => (item.id || item.title) === e.target.value);
                  setForm((prev) => ({ ...prev, positionId: e.target.value, positionApplied: position?.title || e.target.selectedOptions[0]?.text || '' }));
                }} required>
                  <option value="">Select position</option>
                  {(jobFair?.positions || []).map((position) => (
                    <option key={position.id || position.title} value={position.id || position.title}>{position.title}</option>
                  ))}
                </select>
              </label>
              <label className="field"><span>Education</span><textarea className="textarea" value={form.education} onChange={(e) => setForm((prev) => ({ ...prev, education: e.target.value }))} /></label>
              <label className="field"><span>Work experience summary</span><textarea className="textarea" value={form.workExperienceSummary} onChange={(e) => setForm((prev) => ({ ...prev, workExperienceSummary: e.target.value }))} /></label>
              <label className="field"><span>Skills</span><textarea className="textarea" value={form.skills} onChange={(e) => setForm((prev) => ({ ...prev, skills: e.target.value }))} /></label>
              <label className="field"><span>Resume (PDF, DOC, DOCX)</span><input className="input" type="file" accept=".pdf,.doc,.docx" onChange={handleFile} required /></label>
            </div>
            <label className="checklist-item">
              <input type="checkbox" checked={form.consentAccepted} onChange={(e) => setForm((prev) => ({ ...prev, consentAccepted: e.target.checked }))} />
              <span>I consent to the collection and processing of my personal information and resume for recruitment purposes related to this job fair.</span>
            </label>
            <button className="btn btn-primary" type="submit" disabled={loading || !canApply}>
              {loading ? 'Submitting...' : 'Submit application'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
