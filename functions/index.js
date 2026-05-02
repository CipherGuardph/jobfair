const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const nodemailer = require('nodemailer');

admin.initializeApp();

const db = admin.firestore();
const bucket = admin.storage().bucket();
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;
const increment = admin.firestore.FieldValue.increment;

const ALLOWED_STATUSES = [
  'Submitted',
  'For Screening',
  'For Interview',
  'Interviewed',
  'Pending Requirements',
  'Passed',
  'Failed',
  'Completed'
];

function toIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value.toDate) return value.toDate().toISOString();
  return null;
}

async function getUserRole(uid) {
  const snap = await db.doc(`users/${uid}`).get();
  return snap.exists ? snap.data().role : null;
}

async function canManageJobFair(uid, jobFair) {
  const role = await getUserRole(uid);
  if (role === 'admin') return true;
  if (role !== 'hr') return false;
  return jobFair.createdBy === uid || (Array.isArray(jobFair.assignedRecruiters) && jobFair.assignedRecruiters.includes(uid));
}

function makeQueueNumber(nextIndex) {
  return `A${String(nextIndex).padStart(3, '0')}`;
}

function buildChecklist(template = []) {
  return template.map((item) => ({
    id: item.id,
    label: item.label,
    required: !!item.required,
    checked: false,
    checkedBy: null,
    checkedAt: null
  }));
}

function statusCounterKey(status) {
  if (status === 'Passed') return 'totalPassed';
  if (status === 'Failed') return 'totalFailed';
  if (status === 'Completed') return 'totalCompleted';
  return null;
}

function isFirestoreTimestamp(value) {
  return value && typeof value.toDate === 'function';
}

function toMillis(value) {
  if (!value) return 0;
  if (isFirestoreTimestamp(value)) return value.toDate().getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }
  return 0;
}

function normalizeApplicantStatus(applicant) {
  if (applicant.status === 'Completed') return 'Completed';
  if (applicant.status === 'Passed') return 'Passed';
  if (applicant.status === 'Failed') return 'Failed';
  if (applicant.interviewedAt || applicant.status === 'Interviewed') return 'Interviewed';
  if (applicant.calledAt || applicant.status === 'For Interview') return 'For Interview';
  if (applicant.status === 'Pending Requirements') return 'Pending Requirements';
  if (applicant.status === 'For Screening') return 'For Screening';
  return 'Submitted';
}

function computeQueueSummary(applicants = []) {
  const ordered = [...applicants].sort((a, b) => (a.queueIndex || 0) - (b.queueIndex || 0));
  const active = ordered.filter((applicant) => normalizeApplicantStatus(applicant) !== 'Completed');
  const waiting = active.filter((applicant) => !applicant.calledAt && normalizeApplicantStatus(applicant) !== 'Interviewed' && normalizeApplicantStatus(applicant) !== 'Passed' && normalizeApplicantStatus(applicant) !== 'Failed');
  const nowServing = ordered.filter((applicant) => applicant.calledAt && !applicant.interviewedAt && !applicant.completedAt).slice(0, 5);
  const nextApplicants = waiting
    .filter((applicant) => !applicant.calledAt)
    .slice(0, 5);

  return {
    nowServingApplicants: nowServing.map((applicant) => ({
      queueNumber: applicant.queueNumber || '',
      status: 'Now Serving',
      interviewRoom: applicant.interviewRoom || '',
      calledAt: applicant.calledAt || null
    })),
    nextApplicants: nextApplicants.map((applicant) => ({
      queueNumber: applicant.queueNumber || '',
      status: normalizeApplicantStatus(applicant)
    })),
    waitingCount: waiting.length,
    completedCount: ordered.filter((applicant) => normalizeApplicantStatus(applicant) === 'Completed').length,
    currentServingQueueNumber: nowServing[0]?.queueNumber || null,
    currentServingApplicantId: nowServing[0]?.id || null
  };
}

function changedValue(previous, next) {
  return JSON.stringify(previous ?? null) !== JSON.stringify(next ?? null);
}

function buildAuditAction(flags, finalStatus) {
  if (finalStatus === 'Completed') return 'applicant_completed';
  if (flags.analysisChanged) return 'analysis_updated';
  if (flags.interviewScheduled) return 'interview_scheduled';
  if (flags.interviewRescheduled) return 'interview_rescheduled';
  if (flags.interviewCancelled) return 'interview_cancelled';
  if (flags.interviewCompleted) return 'interview_completed';
  if (flags.ownerChanged) return 'assigned_recruiter_changed';
  if (flags.statusChanged) return 'status_changed';
  if (flags.checklistChanged) return 'checklist_updated';
  if (flags.ratingChanged) return 'rating_changed';
  if (flags.notesChanged) return 'notes_changed';
  if (flags.queueChanged) return 'queue_updated';
  return 'applicant_updated';
}

function safeText(value) {
  return asText(value).trim();
}

function buildNotificationText(title, applicant, jobFair, extras = {}) {
  const lines = [
    title,
    `Job fair: ${jobFair.title} at ${jobFair.companyName}`,
    `Applicant: ${applicant.fullName}`,
    extras.body || ''
  ].filter(Boolean);

  return lines.join('\n');
}

function buildNotificationPayload(type, applicant, jobFair, extras = {}) {
  const subjectMap = {
    application_submitted: `Application received for ${jobFair.title}`,
    interview_scheduled: `Interview scheduled for ${jobFair.title}`,
    interview_rescheduled: `Interview rescheduled for ${jobFair.title}`,
    interview_cancelled: `Interview cancelled for ${jobFair.title}`,
    applicant_passed: `Application update for ${jobFair.title}`,
    pending_requirements: `Requirements update for ${jobFair.title}`
  };

  const bodyMap = {
    application_submitted: `Your application has been received. Queue number: ${applicant.queueNumber}.`,
    interview_scheduled: `Your interview is scheduled on ${applicant.interviewDate || 'TBA'} at ${applicant.interviewTime || 'TBA'} (${applicant.interviewType || 'onsite'}). Location: ${applicant.interviewLocation || 'TBA'}.`,
    interview_rescheduled: `Your interview has been rescheduled to ${applicant.interviewDate || 'TBA'} at ${applicant.interviewTime || 'TBA'}.`,
    interview_cancelled: `Your interview has been cancelled. HR will contact you with next steps.`,
    applicant_passed: `Good news, your application has progressed to Passed status.`,
    pending_requirements: `Your application needs additional requirements. Please review the notes from HR.`
  };

  const subject = subjectMap[type] || `Update for ${jobFair.title}`;
  return {
    jobFairId: extras.jobFairId,
    applicantId: extras.applicantId,
    recipientEmail: applicant.email,
    recipientName: applicant.fullName,
    subject,
    text: buildNotificationText(subject, applicant, jobFair, { body: bodyMap[type] || extras.body || '' }),
    html: `<p>${safeText(subject)}</p><p>${safeText(bodyMap[type] || extras.body || '')}</p>`,
    type,
    status: 'queued',
    createdAt: serverTimestamp(),
    meta: extras.meta || {}
  };
}

function buildTimelineLabel(item) {
  if (item.source === 'comment') return 'Internal comment';
  switch (item.action) {
    case 'submitted_application':
      return 'Submitted application';
    case 'analysis_updated':
    case 'resume_reparsed':
    case 'resume_reparsed_and_matched':
      return 'Resume parsed';
    case 'status_changed':
      return 'Status changed';
    case 'interview_scheduled':
      return 'Interview scheduled';
    case 'interview_rescheduled':
      return 'Interview rescheduled';
    case 'interview_cancelled':
      return 'Interview cancelled';
    case 'interview_completed':
      return 'Interview completed';
    case 'checklist_updated':
      return 'Requirements updated';
    case 'rating_changed':
      return 'Rating updated';
    case 'notes_changed':
      return 'Notes updated';
    case 'applicant_completed':
      return 'Applicant completed';
    case 'notification_sent':
      return 'Notification sent';
    default:
      return item.action || 'Activity';
  }
}

function buildPublicDoc(jobFairId, data) {
  return {
    jobFairId,
    publicSlug: data.publicSlug,
    createdBy: data.createdBy || '',
    companyName: data.companyName,
    title: data.title,
    venue: data.venue,
    description: data.description,
    startAt: data.startAt,
    endAt: data.endAt,
    isSubmissionOpen: data.isSubmissionOpen,
    contactPerson: data.contactPerson,
    contactEmail: data.contactEmail,
    contactPhone: data.contactPhone,
    positions: data.positions,
    checklistTemplate: data.checklistTemplate,
    bannerUrl: data.bannerUrl || '',
    queueCounter: 0,
    currentServingQueueNumber: null,
    nowServingApplicants: [],
    nextApplicants: [],
    waitingCount: 0,
    completedCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

async function enqueueNotification(transaction, jobFairRef, payload) {
  const ref = jobFairRef.collection('notificationQueue').doc();
  transaction.set(ref, payload);
  return ref.id;
}

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function normalizeTokens(value) {
  return asText(value)
    .toLowerCase()
    .split(/[\n,;/|]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((item) => item.split(/\s{2,}/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueList(values = []) {
  return [...new Set(values.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function extractEmail(text) {
  const match = asText(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : '';
}

function extractPhone(text) {
  const match = asText(text).match(/(\+?\d[\d\s().-]{6,}\d)/);
  return match ? match[0].trim() : '';
}

function sectionAfterHeading(lines, headings) {
  const headingIndex = lines.findIndex((line) => headings.some((heading) => line.toLowerCase().startsWith(heading)));
  if (headingIndex === -1) return '';
  const slice = [];
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      if (slice.length) break;
      continue;
    }
    if (/^(education|experience|work experience|skills|summary|profile|objective|contact)\b/i.test(line) && slice.length) {
      break;
    }
    slice.push(line);
    if (slice.join(' ').length > 500) break;
  }
  return slice.join(' ');
}

function extractSectionSignals(rawText) {
  const lines = asText(rawText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    extractedName: lines[0] || '',
    extractedEducation: sectionAfterHeading(lines, ['education']),
    extractedExperience: sectionAfterHeading(lines, ['experience', 'work experience', 'employment history']),
    extractedSkills: uniqueList(
      normalizeTokens(sectionAfterHeading(lines, ['skills']))
        .concat(normalizeTokens(rawText))
        .filter((item) => item.length <= 40)
    )
  };
}

function findPositionRequirements(jobFair, applicant) {
  const selected = (jobFair.positions || []).find((position) => (position.id && position.id === applicant.positionId) || position.title === applicant.positionApplied);
  const requiredSkills = selected?.requiredSkills || '';
  const positionTitle = selected?.title || applicant.positionApplied || '';
  return {
    selected,
    requiredSkills: uniqueList(normalizeTokens(requiredSkills)),
    positionTitle
  };
}

function scoreCandidate({ parsedResume, applicant, jobFair }) {
  const { requiredSkills, positionTitle } = findPositionRequirements(jobFair, applicant);
  const resumeText = [
    parsedResume?.rawText || '',
    parsedResume?.extractedSkills?.join(' ') || '',
    applicant.skills || ''
  ].join(' ').toLowerCase();

  const matchedSkills = requiredSkills.filter((skill) => resumeText.includes(skill.toLowerCase()));
  const missingSkills = requiredSkills.filter((skill) => !matchedSkills.includes(skill));
  const skillScore = requiredSkills.length ? Math.round((matchedSkills.length / requiredSkills.length) * 85) : 60;
  const bonus = [
    ['customer service', 'support', 'communication', 'english', 'sales', 'bpo', 'call center'],
    ['degree', 'diploma', 'bachelor', 'college', 'education']
  ].reduce((acc, group, index) => {
    const found = group.some((keyword) => resumeText.includes(keyword));
    return acc + (found ? (index === 0 ? 10 : 5) : 0);
  }, 0);
  const score = Math.max(0, Math.min(100, skillScore + bonus));
  const summary = score >= 80
    ? `Strong match for ${positionTitle || 'the role'}.`
    : score >= 50
      ? `Moderate match for ${positionTitle || 'the role'}.`
      : `Low match for ${positionTitle || 'the role'}; manual review recommended.`;

  return {
    matchScore: score,
    matchSummary: `${summary} ${matchedSkills.length ? `Matched: ${matchedSkills.join(', ')}.` : ''}${missingSkills.length ? ` Missing: ${missingSkills.join(', ')}.` : ''}`.trim(),
    matchedSkills,
    missingSkills
  };
}

async function parseStoredResume(resumeStoragePath) {
  const result = {
    rawText: '',
    extractedName: '',
    extractedEmail: '',
    extractedPhone: '',
    extractedSkills: [],
    extractedEducation: '',
    extractedExperience: '',
    parsedAt: serverTimestamp(),
    parserStatus: 'pending'
  };

  try {
    if (!resumeStoragePath) {
      throw new Error('Missing resume storage path.');
    }

    const [buffer] = await bucket.file(resumeStoragePath).download();
    const lowerPath = resumeStoragePath.toLowerCase();
    let rawText = '';

    if (lowerPath.endsWith('.pdf')) {
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = pdfParseModule.default || pdfParseModule;
      const parsed = await pdfParse(buffer);
      rawText = parsed.text || '';
    } else if (lowerPath.endsWith('.docx')) {
      const mammoth = require('mammoth');
      const parsed = await mammoth.extractRawText({ buffer });
      rawText = parsed.value || '';
    } else {
      throw new Error('Unsupported resume file type for parsing.');
    }

    const sectionSignals = extractSectionSignals(rawText);
    const extractedEmail = extractEmail(rawText);
    const extractedPhone = extractPhone(rawText);
    const extractedSkills = uniqueList(sectionSignals.extractedSkills);

    result.rawText = rawText;
    result.extractedName = sectionSignals.extractedName;
    result.extractedEmail = extractedEmail;
    result.extractedPhone = extractedPhone;
    result.extractedSkills = extractedSkills;
    result.extractedEducation = sectionSignals.extractedEducation;
    result.extractedExperience = sectionSignals.extractedExperience;
    result.parserStatus = 'success';
    return result;
  } catch (error) {
    return {
      ...result,
      parserStatus: 'failed'
    };
  }
}

async function analyzeApplicantRecord({ jobFairRef, jobFair, applicantRef, applicant, mode = 'both', parsedResumePatch = null }) {
  const existingParsedResume = applicant.parsedResume || {
    rawText: '',
    extractedName: '',
    extractedEmail: '',
    extractedPhone: '',
    extractedSkills: [],
    extractedEducation: '',
    extractedExperience: '',
    parsedAt: null,
    parserStatus: 'pending'
  };

  let parsedResume = existingParsedResume;
  if (mode === 'parse' || mode === 'both') {
    parsedResume = await parseStoredResume(applicant.resumeStoragePath);
  }

  if (parsedResumePatch) {
    parsedResume = {
      ...parsedResume,
      ...parsedResumePatch,
      extractedSkills: uniqueList(parsedResumePatch.extractedSkills || parsedResume.extractedSkills || []),
      parserStatus: parsedResumePatch.parserStatus || parsedResume.parserStatus || 'pending'
    };
  }

  const matchingSource = {
    ...applicant,
    parsedResume
  };
  const matchResult = scoreCandidate({
    parsedResume,
    applicant: matchingSource,
    jobFair
  });

  const updates = {
    parsedResume,
    parserStatus: parsedResume.parserStatus,
    matchScore: matchResult.matchScore,
    matchSummary: matchResult.matchSummary,
    matchedSkills: matchResult.matchedSkills,
    missingSkills: matchResult.missingSkills,
    updatedAt: serverTimestamp()
  };

  if (mode === 'parse' && parsedResume.parserStatus === 'failed') {
    updates.matchScore = applicant.matchScore ?? null;
    updates.matchSummary = applicant.matchSummary || 'Resume parsing failed; manual review recommended.';
    updates.matchedSkills = applicant.matchedSkills || [];
    updates.missingSkills = applicant.missingSkills || [];
  }

  await applicantRef.update(updates);
  return updates;
}

async function addAuditLog(transaction, jobFairRef, payload) {
  transaction.set(jobFairRef.collection('auditLogs').doc(), {
    actorId: payload.actorId,
    actorName: payload.actorName,
    action: payload.action,
    targetType: payload.targetType,
    targetId: payload.targetId,
    previousValue: payload.previousValue,
    newValue: payload.newValue,
    createdAt: serverTimestamp()
  });
}

async function refreshPublicQueueSummary(jobFairRef) {
  const [jobFairSnap, applicantsSnap] = await Promise.all([
    jobFairRef.get(),
    jobFairRef.collection('applicants').get()
  ]);

  if (!jobFairSnap.exists) return;

  const jobFair = jobFairSnap.data();
  const applicants = applicantsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const summary = computeQueueSummary(applicants);

  await Promise.all([
    jobFairRef.update({
      ...summary,
      updatedAt: serverTimestamp()
    }),
    jobFair.publicSlug
      ? db.doc(`publicJobFairs/${jobFair.publicSlug}`).set({
          jobFairId: jobFairRef.id,
          publicSlug: jobFair.publicSlug,
          companyName: jobFair.companyName,
          title: jobFair.title,
          venue: jobFair.venue,
          description: jobFair.description,
          startAt: jobFair.startAt,
          endAt: jobFair.endAt,
          isSubmissionOpen: jobFair.isSubmissionOpen,
          contactPerson: jobFair.contactPerson,
          contactEmail: jobFair.contactEmail,
          contactPhone: jobFair.contactPhone,
          positions: jobFair.positions || [],
          checklistTemplate: jobFair.checklistTemplate || [],
          bannerUrl: jobFair.bannerUrl || '',
          queueCounter: jobFair.queueCounter || 0,
          currentServingQueueNumber: summary.currentServingQueueNumber,
          currentServingApplicantId: summary.currentServingApplicantId,
          nowServingApplicants: summary.nowServingApplicants,
          nextApplicants: summary.nextApplicants,
          waitingCount: summary.waitingCount,
          completedCount: summary.completedCount,
          updatedAt: serverTimestamp(),
          createdAt: jobFair.createdAt || serverTimestamp()
        }, { merge: true })
      : Promise.resolve()
  ]);
}

function createMailer() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !from) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: user && pass ? { user, pass } : undefined
  });
}

async function deliverNotificationEmail(notification, jobFairId, notificationId) {
  const mailer = createMailer();
  if (!mailer) {
    console.log('Notification queued without SMTP configuration', notificationId);
    return { skipped: true };
  }

  const from = process.env.SMTP_FROM;
  await mailer.sendMail({
    from,
    to: notification.recipientEmail,
    subject: notification.subject,
    text: notification.text,
    html: notification.html || `<p>${safeText(notification.text)}</p>`
  });

  return { skipped: false };
}

exports.createApplicantSubmission = onCall({ enforceAppCheck: false }, async (request) => {
  const data = request.data || {};
  const {
    publicSlug,
    jobFairId,
    applicantId,
    applicant,
    resumeStoragePath,
    resumeDownloadUrl
  } = data;

  if (!publicSlug || !jobFairId || !applicant) {
    throw new HttpsError('invalid-argument', 'Missing submission payload.');
  }

  const publicRef = db.doc(`publicJobFairs/${publicSlug}`);
  const publicSnap = await publicRef.get();
  if (!publicSnap.exists) {
    throw new HttpsError('not-found', 'Job fair not found.');
  }

  const jobFairRef = db.doc(`jobFairs/${jobFairId}`);
  const jobFairSnap = await jobFairRef.get();
  if (!jobFairSnap.exists) {
    throw new HttpsError('not-found', 'Job fair not found.');
  }

  const jobFair = jobFairSnap.data();
  const now = new Date();
  const startAt = toIso(jobFair.startAt) ? new Date(toIso(jobFair.startAt)) : null;
  const endAt = toIso(jobFair.endAt) ? new Date(toIso(jobFair.endAt)) : null;

  if (jobFair.publicSlug !== publicSlug) {
    throw new HttpsError('permission-denied', 'Invalid job fair link.');
  }
  if (!jobFair.isSubmissionOpen) {
    throw new HttpsError('failed-precondition', 'Submissions are currently closed.');
  }
  if (startAt && now < startAt) {
    throw new HttpsError('failed-precondition', 'This job fair is not yet open.');
  }
  if (endAt && now > endAt) {
    throw new HttpsError('failed-precondition', 'Submissions are closed.');
  }

  const requiredFields = ['fullName', 'email', 'phone', 'positionApplied', 'consentAccepted'];
  for (const field of requiredFields) {
    if (!applicant[field] && applicant[field] !== false) {
      throw new HttpsError('invalid-argument', `Missing field: ${field}`);
    }
  }

  const applicantRef = applicantId
    ? jobFairRef.collection('applicants').doc(applicantId)
    : jobFairRef.collection('applicants').doc();

  let queueNumber = null;
  let queueIndex = null;

  await db.runTransaction(async (transaction) => {
    const freshJobFair = await transaction.get(jobFairRef);
    if (!freshJobFair.exists) {
      throw new HttpsError('not-found', 'Job fair not found.');
    }

    const existingApplicant = await transaction.get(applicantRef);
    if (existingApplicant.exists) {
      queueNumber = existingApplicant.data().queueNumber || null;
      queueIndex = existingApplicant.data().queueIndex || null;
      return;
    }

    const current = freshJobFair.data();
    const freshNow = new Date();
    const freshStart = toIso(current.startAt) ? new Date(toIso(current.startAt)) : null;
    const freshEnd = toIso(current.endAt) ? new Date(toIso(current.endAt)) : null;

    if (!current.isSubmissionOpen || (freshStart && freshNow < freshStart) || (freshEnd && freshNow > freshEnd)) {
      throw new HttpsError('failed-precondition', 'Submissions are currently closed.');
    }

    queueIndex = Number(current.queueCounter || 0) + 1;
    queueNumber = makeQueueNumber(queueIndex);

    transaction.set(applicantRef, {
      id: applicantRef.id,
      queueIndex,
      queueNumber,
      fullName: applicant.fullName,
      email: applicant.email,
      phone: applicant.phone,
      address: applicant.address || '',
      dateOfBirth: applicant.dateOfBirth || '',
      positionApplied: applicant.positionApplied,
      positionId: applicant.positionId || '',
      education: applicant.education || '',
      workExperienceSummary: applicant.workExperienceSummary || '',
      skills: applicant.skills || '',
      resumeStoragePath: resumeStoragePath || '',
      resumeDownloadUrl: resumeDownloadUrl || '',
      status: 'Submitted',
      interviewStatus: 'scheduled',
      interviewDate: '',
      interviewTime: '',
      interviewType: '',
      interviewLocation: '',
      meetingLink: '',
      assignedInterviewer: '',
      interviewedBy: '',
      assignedRecruiterId: '',
      assignedRecruiterName: '',
      interviewRoom: '',
      calledAt: null,
      interviewedAt: null,
      completedAt: null,
      parserStatus: 'pending',
      parsedResume: {
        rawText: '',
        extractedName: '',
        extractedEmail: '',
        extractedPhone: '',
        extractedSkills: [],
        extractedEducation: '',
        extractedExperience: '',
        parsedAt: null,
        parserStatus: 'pending'
      },
      matchScore: null,
      matchSummary: '',
      matchedSkills: [],
      missingSkills: [],
      matchNotes: '',
      finalRecommendation: '',
      checklist: buildChecklist(current.checklistTemplate || []),
      rating: 0,
      notes: '',
      interviewNotes: '',
      finalResult: '',
      consentAccepted: !!applicant.consentAccepted,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      publicTimelineReady: true
    });

    transaction.update(jobFairRef, {
      queueCounter: queueIndex,
      totalApplicants: increment(1),
      updatedAt: serverTimestamp()
    });

    transaction.set(jobFairRef.collection('auditLogs').doc(), {
      actorId: request.auth ? request.auth.uid : 'public',
      actorName: applicant.fullName,
      action: 'submitted_application',
      targetType: 'applicant',
      targetId: applicantRef.id,
      previousValue: null,
      newValue: {
        queueNumber,
        positionApplied: applicant.positionApplied
      },
      createdAt: serverTimestamp()
    });
  });

  const submittedApplicant = (await applicantRef.get()).data();
  await jobFairRef.collection('notificationQueue').add(
    buildNotificationPayload(
      'application_submitted',
      submittedApplicant,
      jobFair,
      {
        jobFairId,
        applicantId: applicantRef.id,
        meta: { queueNumber }
      }
    )
  );

  try {
    const freshJobFair = (await jobFairRef.get()).data();
    const freshApplicant = (await applicantRef.get()).data();
    await analyzeApplicantRecord({
      jobFairRef,
      jobFair: freshJobFair,
      applicantRef,
      applicant: freshApplicant,
      mode: 'both'
    });
    await refreshPublicQueueSummary(jobFairRef);
  } catch (error) {
    await applicantRef.update({
      parsedResume: {
        rawText: '',
        extractedName: '',
        extractedEmail: '',
        extractedPhone: '',
        extractedSkills: [],
        extractedEducation: '',
        extractedExperience: '',
        parsedAt: serverTimestamp(),
        parserStatus: 'failed'
      },
      parserStatus: 'failed',
      updatedAt: serverTimestamp()
    });
  }

  await refreshPublicQueueSummary(jobFairRef);

  return {
    applicantId: applicantRef.id,
    queueNumber
  };
});

exports.createJobFair = onCall({ enforceAppCheck: false }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Please sign in.');
  }

  const {
    companyName = '',
    title = '',
    venue = '',
    description = '',
    startAt,
    endAt,
    isSubmissionOpen = true,
    contactPerson = '',
    contactEmail = '',
    contactPhone = '',
    bannerUrl = '',
    positions = [],
    checklistTemplate = []
  } = request.data || {};

  if (!companyName || !title || !venue || !startAt || !endAt || !contactEmail) {
    throw new HttpsError('invalid-argument', 'Missing job fair fields.');
  }

  const userRole = await getUserRole(request.auth.uid);
  if (!userRole || !['admin', 'hr'].includes(userRole)) {
    throw new HttpsError('permission-denied', 'You do not have access to create job fairs.');
  }

  const jobFairRef = db.collection('jobFairs').doc();
  const slugBase = `${String(companyName || title || 'job-fair').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}-${jobFairRef.id.slice(0, 6)}`;
  const publicSlug = slugBase || `job-fair-${jobFairRef.id.slice(0, 6)}`;

  const data = {
    id: jobFairRef.id,
    companyName,
    title,
    venue,
    description,
    startAt,
    endAt,
    isSubmissionOpen,
    publicSlug,
    createdBy: request.auth.uid,
    assignedRecruiters: [request.auth.uid],
    positions,
    checklistTemplate,
    queueCounter: 0,
    totalApplicants: 0,
    totalPassed: 0,
    totalFailed: 0,
    totalCompleted: 0,
    contactPerson,
    contactEmail,
    contactPhone,
    bannerUrl,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await jobFairRef.set(data);
  await db.doc(`publicJobFairs/${publicSlug}`).set(buildPublicDoc(jobFairRef.id, { ...data, publicSlug, createdBy: request.auth.uid }));
  await jobFairRef.collection('auditLogs').add({
    actorId: request.auth.uid,
    actorName: request.auth.token.name || request.auth.token.email || request.auth.uid,
    action: 'jobfair_created',
    targetType: 'jobFair',
    targetId: jobFairRef.id,
    previousValue: null,
    newValue: { publicSlug, title, companyName },
    createdAt: serverTimestamp()
  });

  return {
    id: jobFairRef.id,
    publicSlug,
    publicApplyUrl: `/apply/${publicSlug}`,
    queueUrl: `/queue/${publicSlug}`
  };
});

exports.updateApplicantStatus = onCall({ enforceAppCheck: false }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Please sign in.');
  }

  const {
    jobFairId,
    applicantId,
    status,
    queueAction = '',
    interviewAction = '',
    interviewedBy = '',
    assignedRecruiterId = '',
    assignedRecruiterName = '',
    assignedInterviewer = '',
    interviewDate = '',
    interviewTime = '',
    interviewType = '',
    interviewLocation = '',
    meetingLink = '',
    interviewStatus = '',
    interviewRoom = '',
    rating = null,
    notes = '',
    interviewNotes = '',
    finalResult = '',
    checklist = null,
    parsedResumePatch = null,
    matchNotes = '',
    finalRecommendation = ''
  } = request.data || {};
  if (!jobFairId || !applicantId || !status) {
    throw new HttpsError('invalid-argument', 'Missing update payload.');
  }
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new HttpsError('invalid-argument', 'Invalid status.');
  }

  const jobFairRef = db.doc(`jobFairs/${jobFairId}`);
  const applicantRef = jobFairRef.collection('applicants').doc(applicantId);

  let updatedApplicant = null;

  await db.runTransaction(async (transaction) => {
    const [jobFairSnap, applicantSnap] = await Promise.all([
      transaction.get(jobFairRef),
      transaction.get(applicantRef)
    ]);

    if (!jobFairSnap.exists || !applicantSnap.exists) {
      throw new HttpsError('not-found', 'Job fair or applicant not found.');
    }

    const jobFair = jobFairSnap.data();
    if (!(await canManageJobFair(request.auth.uid, jobFair))) {
      throw new HttpsError('permission-denied', 'You do not have access to this job fair.');
    }

    const applicant = applicantSnap.data();
    const nextValues = {
      status: status || applicant.status,
      interviewedBy: interviewedBy ?? applicant.interviewedBy ?? '',
      assignedRecruiterId: assignedRecruiterId ?? applicant.assignedRecruiterId ?? '',
      assignedRecruiterName: assignedRecruiterName ?? applicant.assignedRecruiterName ?? '',
      assignedInterviewer: assignedInterviewer ?? applicant.assignedInterviewer ?? '',
      interviewDate: interviewDate ?? applicant.interviewDate ?? '',
      interviewTime: interviewTime ?? applicant.interviewTime ?? '',
      interviewType: interviewType ?? applicant.interviewType ?? '',
      interviewLocation: interviewLocation ?? applicant.interviewLocation ?? '',
      meetingLink: meetingLink ?? applicant.meetingLink ?? '',
      interviewStatus: interviewStatus || applicant.interviewStatus || 'scheduled',
      interviewRoom: interviewRoom ?? applicant.interviewRoom ?? '',
      rating: rating === null || rating === undefined ? applicant.rating || 0 : Number(rating),
      notes: notes ?? applicant.notes ?? '',
      interviewNotes: interviewNotes ?? applicant.interviewNotes ?? '',
      finalResult: finalResult ?? applicant.finalResult ?? '',
      matchNotes: matchNotes ?? applicant.matchNotes ?? '',
      finalRecommendation: finalRecommendation ?? applicant.finalRecommendation ?? '',
      checklist: checklist || applicant.checklist || [],
      calledAt: applicant.calledAt || null,
      interviewedAt: applicant.interviewedAt || null,
      completedAt: applicant.completedAt || null
    };

    if (queueAction === 'now_serving') {
      nextValues.status = 'For Interview';
      nextValues.calledAt = serverTimestamp();
    } else if (queueAction === 'interviewed') {
      nextValues.status = 'Interviewed';
      nextValues.interviewedAt = serverTimestamp();
    } else if (queueAction === 'completed') {
      nextValues.status = 'Completed';
      nextValues.completedAt = serverTimestamp();
    } else if (queueAction === 'for_interview') {
      nextValues.status = 'For Interview';
    } else if (!nextValues.status) {
      nextValues.status = applicant.status;
    }

    if (interviewAction === 'schedule') {
      nextValues.interviewStatus = 'scheduled';
      nextValues.status = nextValues.status || 'For Interview';
    } else if (interviewAction === 'reschedule') {
      nextValues.interviewStatus = 'rescheduled';
      nextValues.status = nextValues.status || 'For Interview';
    } else if (interviewAction === 'cancel') {
      nextValues.interviewStatus = 'cancelled';
    } else if (interviewAction === 'complete') {
      nextValues.interviewStatus = 'completed';
      nextValues.interviewedAt = nextValues.interviewedAt || serverTimestamp();
    }

    if (nextValues.status === 'Completed' && !nextValues.completedAt) {
      nextValues.completedAt = serverTimestamp();
    }

    if (queueAction === 'now_serving' && !nextValues.interviewRoom) {
      nextValues.interviewRoom = applicant.interviewRoom || '';
    }

    const previousSnapshot = {
      status: applicant.status,
      interviewedBy: applicant.interviewedBy || '',
      assignedRecruiterId: applicant.assignedRecruiterId || '',
      interviewRoom: applicant.interviewRoom || '',
      rating: applicant.rating || 0,
      notes: applicant.notes || '',
      interviewNotes: applicant.interviewNotes || '',
      finalResult: applicant.finalResult || '',
      matchNotes: applicant.matchNotes || '',
      finalRecommendation: applicant.finalRecommendation || '',
      assignedRecruiterName: applicant.assignedRecruiterName || '',
      assignedInterviewer: applicant.assignedInterviewer || '',
      interviewDate: applicant.interviewDate || '',
      interviewTime: applicant.interviewTime || '',
      interviewType: applicant.interviewType || '',
      interviewLocation: applicant.interviewLocation || '',
      meetingLink: applicant.meetingLink || '',
      interviewStatus: applicant.interviewStatus || '',
      checklist: applicant.checklist || [],
      calledAt: applicant.calledAt || null,
      interviewedAt: applicant.interviewedAt || null,
      completedAt: applicant.completedAt || null
    };

    const previousKey = statusCounterKey(applicant.status);
    const nextKey = statusCounterKey(nextValues.status);
    const updates = {
      ...nextValues,
      updatedAt: serverTimestamp()
    };

    transaction.update(applicantRef, updates);

    const jobFairUpdates = {
      updatedAt: serverTimestamp()
    };

    if (previousKey && previousKey !== nextKey) {
      jobFairUpdates[previousKey] = increment(-1);
    }
    if (nextKey && previousKey !== nextKey) {
      jobFairUpdates[nextKey] = increment(1);
    }

    transaction.update(jobFairRef, jobFairUpdates);

    const statusChanged = previousSnapshot.status !== nextValues.status;
    const interviewScheduled = interviewAction === 'schedule' || (previousSnapshot.interviewDate !== nextValues.interviewDate && !!nextValues.interviewDate && !applicant.interviewDate);
    const interviewRescheduled = interviewAction === 'reschedule' || (previousSnapshot.interviewDate !== nextValues.interviewDate && !!nextValues.interviewDate && !!applicant.interviewDate);
    const interviewCancelled = interviewAction === 'cancel';
    const interviewCompleted = interviewAction === 'complete' || nextValues.interviewStatus === 'completed';
    const ownerChanged = previousSnapshot.assignedRecruiterId !== nextValues.assignedRecruiterId;
    const checklistChanged = changedValue(previousSnapshot.checklist, nextValues.checklist);
    const ratingChanged = previousSnapshot.rating !== nextValues.rating;
    const notesChanged =
      previousSnapshot.notes !== nextValues.notes ||
      previousSnapshot.interviewNotes !== nextValues.interviewNotes ||
      previousSnapshot.finalResult !== nextValues.finalResult ||
      previousSnapshot.matchNotes !== nextValues.matchNotes ||
      previousSnapshot.finalRecommendation !== nextValues.finalRecommendation;
    const queueChanged =
      previousSnapshot.calledAt !== nextValues.calledAt ||
      previousSnapshot.interviewedAt !== nextValues.interviewedAt ||
      previousSnapshot.completedAt !== nextValues.completedAt ||
      previousSnapshot.interviewRoom !== nextValues.interviewRoom ||
      previousSnapshot.interviewedBy !== nextValues.interviewedBy ||
      previousSnapshot.assignedRecruiterId !== nextValues.assignedRecruiterId;

    transaction.set(jobFairRef.collection('auditLogs').doc(), {
      actorId: request.auth.uid,
      actorName: request.auth.token.name || request.auth.token.email || request.auth.uid,
      action: buildAuditAction({
        analysisChanged: !!parsedResumePatch,
        interviewScheduled,
        interviewRescheduled,
        interviewCancelled,
        interviewCompleted,
        ownerChanged,
        statusChanged,
        checklistChanged,
        ratingChanged,
        notesChanged,
        queueChanged
      }, nextValues.status),
      targetType: 'applicant',
      targetId: applicantRef.id,
      previousValue: previousSnapshot,
      newValue: nextValues,
      createdAt: serverTimestamp()
    });

    if (parsedResumePatch) {
      const nextParsedResume = {
        ...(applicant.parsedResume || {}),
        ...parsedResumePatch,
        extractedSkills: uniqueList(parsedResumePatch.extractedSkills || applicant.parsedResume?.extractedSkills || []),
        parserStatus: parsedResumePatch.parserStatus || applicant.parsedResume?.parserStatus || 'success'
      };

      transaction.update(applicantRef, {
        parsedResume: nextParsedResume
      });
    }

    let notificationType = null;
    if (interviewScheduled) notificationType = 'interview_scheduled';
    else if (interviewRescheduled) notificationType = 'interview_rescheduled';
    else if (interviewCancelled) notificationType = 'interview_cancelled';
    else if (statusChanged && nextValues.status === 'Passed') notificationType = 'applicant_passed';
    else if (statusChanged && nextValues.status === 'Pending Requirements') notificationType = 'pending_requirements';

    if (notificationType && applicant.email) {
      transaction.set(jobFairRef.collection('notificationQueue').doc(), buildNotificationPayload(
        notificationType,
        { ...applicant, ...nextValues, fullName: applicant.fullName, email: applicant.email },
        jobFair,
        {
          jobFairId,
          applicantId: applicantRef.id,
          meta: {
            interviewAction,
            status: nextValues.status
          }
        }
      ));
    }

    updatedApplicant = {
      id: applicantRef.id,
      status: nextValues.status
    };
  });

  await refreshPublicQueueSummary(jobFairRef);

  return updatedApplicant;
});

exports.refreshApplicantAnalysis = onCall({ enforceAppCheck: false }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Please sign in.');
  }

  const { jobFairId, applicantId, mode = 'both' } = request.data || {};
  if (!jobFairId || !applicantId) {
    throw new HttpsError('invalid-argument', 'Missing analysis payload.');
  }
  if (!['parse', 'match', 'both'].includes(mode)) {
    throw new HttpsError('invalid-argument', 'Invalid analysis mode.');
  }

  const jobFairRef = db.doc(`jobFairs/${jobFairId}`);
  const applicantRef = jobFairRef.collection('applicants').doc(applicantId);

  const [jobFairSnap, applicantSnap] = await Promise.all([
    jobFairRef.get(),
    applicantRef.get()
  ]);

  if (!jobFairSnap.exists || !applicantSnap.exists) {
    throw new HttpsError('not-found', 'Job fair or applicant not found.');
  }

  const jobFair = jobFairSnap.data();
  if (!(await canManageJobFair(request.auth.uid, jobFair))) {
    throw new HttpsError('permission-denied', 'You do not have access to this job fair.');
  }

  const applicant = applicantSnap.data();
  const updates = await analyzeApplicantRecord({
    jobFairRef,
    jobFair,
    applicantRef,
    applicant,
    mode
  });

  await db.collection(`jobFairs/${jobFairId}/auditLogs`).add({
    actorId: request.auth.uid,
    actorName: request.auth.token.name || request.auth.token.email || request.auth.uid,
    action: mode === 'parse' ? 'resume_reparsed' : mode === 'match' ? 'match_recalculated' : 'resume_reparsed_and_matched',
    targetType: 'applicant',
    targetId: applicantId,
    previousValue: null,
    newValue: {
      parserStatus: updates.parsedResume?.parserStatus || 'success',
      matchScore: updates.matchScore
    },
    createdAt: serverTimestamp()
  });

  return updates;
});

exports.addApplicantInternalComment = onCall({ enforceAppCheck: false }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Please sign in.');
  }

  const { jobFairId, applicantId, comment, taggedRecruiterName = '' } = request.data || {};
  if (!jobFairId || !applicantId || !comment) {
    throw new HttpsError('invalid-argument', 'Missing comment payload.');
  }

  const jobFairRef = db.doc(`jobFairs/${jobFairId}`);
  const applicantRef = jobFairRef.collection('applicants').doc(applicantId);
  const [jobFairSnap, applicantSnap] = await Promise.all([jobFairRef.get(), applicantRef.get()]);
  if (!jobFairSnap.exists || !applicantSnap.exists) {
    throw new HttpsError('not-found', 'Job fair or applicant not found.');
  }

  const jobFair = jobFairSnap.data();
  if (!(await canManageJobFair(request.auth.uid, jobFair))) {
    throw new HttpsError('permission-denied', 'You do not have access to this job fair.');
  }

  const commenterName = request.auth.token.name || request.auth.token.email || request.auth.uid;
  await applicantRef.collection('internalComments').add({
    actorId: request.auth.uid,
    actorName: commenterName,
    taggedRecruiterName,
    comment,
    createdAt: serverTimestamp()
  });

  await jobFairRef.collection('auditLogs').add({
    actorId: request.auth.uid,
    actorName: commenterName,
    action: 'internal_comment_added',
    targetType: 'applicant',
    targetId: applicantId,
    previousValue: null,
    newValue: { comment, taggedRecruiterName },
    createdAt: serverTimestamp()
  });

  return { success: true };
});

exports.exportApplicants = onCall({ enforceAppCheck: false }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Please sign in.');
  }

  const { jobFairId, filters = {} } = request.data || {};
  if (!jobFairId) {
    throw new HttpsError('invalid-argument', 'Missing jobFairId.');
  }

  const jobFairRef = db.doc(`jobFairs/${jobFairId}`);
  const jobFairSnap = await jobFairRef.get();
  if (!jobFairSnap.exists) {
    throw new HttpsError('not-found', 'Job fair not found.');
  }
  if (!(await canManageJobFair(request.auth.uid, jobFairSnap.data()))) {
    throw new HttpsError('permission-denied', 'You do not have access to this job fair.');
  }

  const snap = await jobFairRef.collection('applicants').get();
  const rows = snap.docs
    .map((doc) => doc.data())
    .filter((applicant) => {
      if (filters.status && applicant.status !== filters.status) return false;
      if (filters.positionId && applicant.positionId !== filters.positionId && applicant.positionApplied !== filters.positionId) return false;
      return true;
    })
    .sort((a, b) => (a.queueIndex || 0) - (b.queueIndex || 0))
    .map((applicant) => {
      return [
        applicant.queueNumber || '',
        applicant.fullName || '',
        applicant.email || '',
        applicant.phone || '',
        applicant.address || '',
        applicant.positionApplied || '',
        applicant.education || '',
        applicant.workExperienceSummary || '',
        applicant.skills || '',
        applicant.status || '',
        applicant.interviewedBy || '',
        applicant.rating || 0,
        applicant.finalResult || '',
        applicant.notes || '',
        applicant.matchScore ?? '',
        (applicant.matchedSkills || []).join('; '),
        (applicant.missingSkills || []).join('; '),
        applicant.parsedResume?.parserStatus || applicant.parserStatus || '',
        applicant.finalRecommendation || '',
        toIso(applicant.createdAt) || '',
        toIso(applicant.completedAt) || ''
      ];
    });

  const header = [
    'Queue Number',
    'Full Name',
    'Email',
    'Phone',
    'Address',
    'Position Applied',
    'Education',
    'Work Experience Summary',
    'Skills',
    'Status',
    'Interviewed By',
    'Rating',
    'Final Result',
    'Notes',
    'Match Score',
    'Matched Skills',
    'Missing Skills',
    'Parser Status',
    'Final Recommendation',
    'Submitted Date',
    'Completed Date'
  ];
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  return { csv };
});

exports.scheduledCloseExpiredJobFairs = onSchedule('every 30 minutes', async () => {
  const now = new Date();
  const snap = await db.collection('jobFairs')
    .where('isSubmissionOpen', '==', true)
    .get();

  const batch = db.batch();
  const refreshedRefs = [];
  let count = 0;
  snap.forEach((doc) => {
    const data = doc.data();
    const endAt = toIso(data.endAt) ? new Date(toIso(data.endAt)) : null;
    if (endAt && endAt < now) {
      batch.update(doc.ref, {
        isSubmissionOpen: false,
        updatedAt: serverTimestamp()
      });
      batch.set(doc.ref.collection('auditLogs').doc(), {
        actorId: 'system',
        actorName: 'System',
        action: 'auto_closed_submissions',
        targetType: 'jobFair',
        targetId: doc.id,
        previousValue: {
          isSubmissionOpen: true
        },
        newValue: {
          isSubmissionOpen: false
        },
        createdAt: serverTimestamp()
      });
      refreshedRefs.push(doc.ref);
      count += 1;
    }
  });
  if (count > 0) {
    await batch.commit();
    await Promise.all(refreshedRefs.map((ref) => refreshPublicQueueSummary(ref)));
  }
});

exports.sendQueuedNotificationEmail = onDocumentCreated('jobFairs/{jobFairId}/notificationQueue/{notificationId}', async (event) => {
  const { jobFairId, notificationId } = event.params;
  const notification = event.data?.data();
  if (!notification || notification.status === 'sent') {
    return;
  }

  const notificationRef = db.doc(`jobFairs/${jobFairId}/notificationQueue/${notificationId}`);
  const jobFairRef = db.doc(`jobFairs/${jobFairId}`);

  try {
    const result = await deliverNotificationEmail(notification, jobFairId, notificationId);
    await notificationRef.update({
      status: 'sent',
      deliveryMethod: result.skipped ? 'console' : 'email',
      sentAt: serverTimestamp()
    });

    await jobFairRef.collection('auditLogs').add({
      actorId: 'system',
      actorName: 'System',
      action: 'notification_sent',
      targetType: 'notification',
      targetId: notificationId,
      previousValue: { status: 'queued' },
      newValue: {
        status: 'sent',
        type: notification.type,
        recipientEmail: notification.recipientEmail
      },
      createdAt: serverTimestamp()
    });
  } catch (error) {
    await notificationRef.update({
      status: 'failed',
      errorMessage: error.message || 'Failed to send notification',
      sentAt: serverTimestamp()
    });
  }
});
