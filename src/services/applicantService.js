import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export async function submitApplicant(payload) {
  const fn = httpsCallable(functions, 'createApplicantSubmission');
  const result = await fn(payload);
  return result.data;
}

export async function updateApplicantStatus(payload) {
  const fn = httpsCallable(functions, 'updateApplicantStatus');
  const result = await fn(payload);
  return result.data;
}

export async function refreshApplicantAnalysis(payload) {
  const fn = httpsCallable(functions, 'refreshApplicantAnalysis');
  const result = await fn(payload);
  return result.data;
}

export async function exportApplicantsCsv(payload) {
  const fn = httpsCallable(functions, 'exportApplicants');
  const result = await fn(payload);
  return result.data.csv;
}
