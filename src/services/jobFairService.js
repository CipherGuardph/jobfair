import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import { createQrCodeDataUrl } from '../utils/qrCode';
import { slugify } from '../utils/validators';

function buildPublicDoc(jobFairId, data) {
  return {
    jobFairId,
    publicSlug: data.publicSlug,
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

export async function createJobFair({ ownerUid, ...payload }) {
  const jobFairRef = doc(collection(db, 'jobFairs'));
  const slugBase = slugify(`${payload.companyName || payload.title || 'job-fair'}-${jobFairRef.id.slice(0, 6)}`);
  const publicSlug = slugBase || `job-fair-${jobFairRef.id.slice(0, 6)}`;
  const data = {
    id: jobFairRef.id,
    ...payload,
    publicSlug,
    createdBy: ownerUid,
    assignedRecruiters: payload.assignedRecruiters?.length ? payload.assignedRecruiters : [ownerUid],
    queueCounter: 0,
    totalApplicants: 0,
    totalPassed: 0,
    totalFailed: 0,
    totalCompleted: 0,
    currentServingQueueNumber: null,
    currentServingApplicantId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const batch = writeBatch(db);
  batch.set(jobFairRef, data);
  batch.set(doc(db, 'publicJobFairs', publicSlug), buildPublicDoc(jobFairRef.id, { ...payload, publicSlug }));
  await batch.commit();

  return {
    id: jobFairRef.id,
    publicSlug,
    publicApplyUrl: `/apply/${publicSlug}`,
    queueUrl: `/queue/${publicSlug}`
  };
}

export async function getAccessibleJobFairs(uid, role) {
  if (!uid) return [];
  if (role === 'admin') {
    const snap = await getDocs(collection(db, 'jobFairs'));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  }

  const createdSnap = await getDocs(query(collection(db, 'jobFairs'), where('createdBy', '==', uid)));
  const assignedSnap = await getDocs(query(collection(db, 'jobFairs'), where('assignedRecruiters', 'array-contains', uid)));
  const map = new Map();
  [...createdSnap.docs, ...assignedSnap.docs].forEach((docSnap) => {
    map.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
  });
  return [...map.values()].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function getJobFairById(jobFairId) {
  const snap = await getDoc(doc(db, 'jobFairs', jobFairId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getPublicJobFairBySlug(publicSlug) {
  const snap = await getDoc(doc(db, 'publicJobFairs', publicSlug));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateJobFairSubmissionState(jobFairId, isSubmissionOpen, actorName, actorId) {
  const ref = doc(db, 'jobFairs', jobFairId);
  const snap = await getDoc(ref);
  const current = snap.data();
  await updateDoc(ref, {
    isSubmissionOpen,
    updatedAt: serverTimestamp()
  });
  if (current?.publicSlug) {
    await updateDoc(doc(db, 'publicJobFairs', current.publicSlug), {
      isSubmissionOpen,
      updatedAt: serverTimestamp()
    });
  }
  await addDoc(collection(db, 'jobFairs', jobFairId, 'auditLogs'), {
    actorId,
    actorName,
    action: isSubmissionOpen ? 'opened_submissions' : 'closed_submissions',
    targetType: 'jobFair',
    targetId: jobFairId,
    previousValue: { isSubmissionOpen: !isSubmissionOpen },
    newValue: { isSubmissionOpen },
    createdAt: serverTimestamp()
  });
}

export async function getApplicants(jobFairId) {
  const snap = await getDocs(query(collection(db, 'jobFairs', jobFairId, 'applicants'), orderBy('queueIndex', 'asc')));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function getRecentAuditLogs(jobFairId, count = 10) {
  const snap = await getDocs(query(collection(db, 'jobFairs', jobFairId, 'auditLogs'), orderBy('createdAt', 'desc'), limit(count)));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function getApplicantInternalComments(jobFairId, applicantId) {
  const snap = await getDocs(query(collection(db, 'jobFairs', jobFairId, 'applicants', applicantId, 'internalComments'), orderBy('createdAt', 'asc')));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function getApplicantTimeline(jobFairId, applicantId) {
  const [auditLogs, comments] = await Promise.all([
    getDocs(query(collection(db, 'jobFairs', jobFairId, 'auditLogs'), orderBy('createdAt', 'asc'))),
    getDocs(query(collection(db, 'jobFairs', jobFairId, 'applicants', applicantId, 'internalComments'), orderBy('createdAt', 'asc')))
  ]);

  const auditItems = auditLogs.docs
    .map((docSnap) => ({ id: docSnap.id, source: 'audit', ...docSnap.data() }))
    .filter((item) => (item.targetId === applicantId || item.targetType === 'applicant') && item.action !== 'internal_comment_added');
  const commentItems = comments.docs.map((docSnap) => ({ id: docSnap.id, source: 'comment', ...docSnap.data() }));

  return [...auditItems, ...commentItems].sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return aTime - bTime;
  });
}

export async function addApplicantInternalComment(jobFairId, applicantId, payload) {
  return addDoc(collection(db, 'jobFairs', jobFairId, 'applicants', applicantId, 'internalComments'), {
    ...payload,
    createdAt: serverTimestamp()
  });
}

export async function getApplicant(jobFairId, applicantId) {
  const snap = await getDoc(doc(db, 'jobFairs', jobFairId, 'applicants', applicantId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateApplicantDirect(jobFairId, applicantId, payload) {
  await updateDoc(doc(db, 'jobFairs', jobFairId, 'applicants', applicantId), {
    ...payload,
    updatedAt: serverTimestamp()
  });
}

export function buildPublicLink(publicSlug) {
  return `${window.location.origin}/apply/${publicSlug}`;
}

export function buildQueueLink(publicSlug) {
  return `${window.location.origin}/queue/${publicSlug}`;
}

export async function generateQr(publicSlug) {
  return createQrCodeDataUrl(buildPublicLink(publicSlug));
}
