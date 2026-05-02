import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

function requireFunctions() {
  if (!functions) {
    throw new Error('Firebase Functions is not available. Check your Firebase configuration.');
  }
}

export async function submitApplicant(payload) {
  requireFunctions();
  const fn = httpsCallable(functions, 'createApplicantSubmission');
  const result = await fn(payload);
  return result.data;
}

export async function updateApplicantStatus(payload) {
  requireFunctions();
  const fn = httpsCallable(functions, 'updateApplicantStatus');
  const result = await fn(payload);
  return result.data;
}

export async function refreshApplicantAnalysis(payload) {
  requireFunctions();
  const fn = httpsCallable(functions, 'refreshApplicantAnalysis');
  const result = await fn(payload);
  return result.data;
}

export async function exportApplicantsCsv(payload) {
  requireFunctions();
  const fn = httpsCallable(functions, 'exportApplicants');
  const result = await fn(payload);
  return result.data.csv;
}

export async function addApplicantInternalComment(payload) {
  requireFunctions();
  const fn = httpsCallable(functions, 'addApplicantInternalComment');
  const result = await fn(payload);
  return result.data;
}
