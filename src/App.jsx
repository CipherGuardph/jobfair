import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/AppShell';
const LandingPage = lazy(() => import('./pages/LandingPage').then((module) => ({ default: module.LandingPage })));

const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const AccountPage = lazy(() => import('./pages/AccountPage').then((module) => ({ default: module.AccountPage })));
const CreateJobFairPage = lazy(() => import('./pages/CreateJobFairPage').then((module) => ({ default: module.CreateJobFairPage })));
const JobFairDetailPage = lazy(() => import('./pages/JobFairDetailPage').then((module) => ({ default: module.JobFairDetailPage })));
const ApplicantsPage = lazy(() => import('./pages/ApplicantsPage').then((module) => ({ default: module.ApplicantsPage })));
const ApplicantDetailPage = lazy(() => import('./pages/ApplicantDetailPage').then((module) => ({ default: module.ApplicantDetailPage })));
const PublicApplyPage = lazy(() => import('./pages/PublicApplyPage').then((module) => ({ default: module.PublicApplyPage })));
const QueueDisplayPage = lazy(() => import('./pages/QueueDisplayPage').then((module) => ({ default: module.QueueDisplayPage })));

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="app-loading">
          <div className="spinner" />
          <p>Loading page...</p>
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/apply/:publicSlug" element={<PublicApplyPage />} />
        <Route path="/queue/:publicSlug" element={<QueueDisplayPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppShell>
                <DashboardPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <AppShell>
                <AccountPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobfairs/new"
          element={
            <ProtectedRoute>
              <AppShell>
                <CreateJobFairPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobfairs/:jobFairId"
          element={
            <ProtectedRoute>
              <AppShell>
                <JobFairDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobfairs/:jobFairId/applicants"
          element={
            <ProtectedRoute>
              <AppShell>
                <ApplicantsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobfairs/:jobFairId/applicants/:applicantId"
          element={
            <ProtectedRoute>
              <AppShell>
                <ApplicantDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
