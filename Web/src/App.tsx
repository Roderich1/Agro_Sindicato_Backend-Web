import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { AdminRoute } from './components/admin-route';
import { CollectiveRoute } from './components/collective-route';
import { FarmerRoute, LegacyDirectivaRedirect } from './components/farmer-route';
import { PrivateRoute } from './components/private-route';
import { AuthProvider } from './contexts/auth.context';
import { CampaignProvider } from './contexts/campaign.context';
import { useAuth } from './hooks/use-auth';
import { COLLECTIVE_PATHS, homePathFor } from './lib/navigation';
import { CampaignsPage } from './pages/campaigns.page';
import { DashboardPage } from './pages/dashboard.page';
import { InventoryPage } from './pages/inventory.page';
import { LoginPage } from './pages/login.page';
import { PlotsPage } from './pages/plots.page';
import { SyncPage } from './pages/sync.page';
import { UsersPage } from './pages/users.page';

const ApplicationsPage = lazy(() =>
  import('./pages/applications.page').then((module) => ({ default: module.ApplicationsPage })),
);
const PurchasesPage = lazy(() =>
  import('./pages/purchases.page').then((module) => ({ default: module.PurchasesPage })),
);
const CalendarPage = lazy(() =>
  import('./pages/calendar.page').then((module) => ({ default: module.CalendarPage })),
);
const ReportsPage = lazy(() =>
  import('./pages/reports.page').then((module) => ({ default: module.ReportsPage })),
);
const CollectiveSummaryPage = lazy(() =>
  import('./pages/collective-summary.page').then((module) => ({ default: module.CollectiveSummaryPage })),
);
const JointProposalPage = lazy(() =>
  import('./pages/joint-proposal.page').then((module) => ({ default: module.JointProposalPage })),
);
const CoveragePage = lazy(() =>
  import('./pages/coverage.page').then((module) => ({ default: module.CoveragePage })),
);
const ProductReconciliationPage = lazy(() =>
  import('./pages/product-reconciliation.page').then((module) => ({ default: module.ProductReconciliationPage })),
);
const AuditLogsPage = lazy(() =>
  import('./pages/audit-logs.page').then((module) => ({ default: module.AuditLogsPage })),
);

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  return user ? <Navigate to={homePathFor(user.role)} replace /> : <>{children}</>;
}

function RoleRoute({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return roles.includes(user.role) ? <>{children}</> : <Navigate to={homePathFor(user.role)} replace />;
}

function HomeRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      {/* F07: Directiva y Administrador del tenant (ADR-003); el servidor autoriza */}
      <Route
        path={COLLECTIVE_PATHS.summary}
        element={
          <CollectiveRoute>
            <CollectiveSummaryPage />
          </CollectiveRoute>
        }
      />
      <Route
        path={COLLECTIVE_PATHS.proposals}
        element={
          <CollectiveRoute>
            <JointProposalPage />
          </CollectiveRoute>
        }
      />
      <Route
        path={COLLECTIVE_PATHS.coverage}
        element={
          <CollectiveRoute>
            <CoveragePage />
          </CollectiveRoute>
        }
      />
      <Route
        path={COLLECTIVE_PATHS.reconciliation}
        element={
          <CollectiveRoute>
            <ProductReconciliationPage />
          </CollectiveRoute>
        }
      />
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <FarmerRoute>
            <DashboardPage />
          </FarmerRoute>
        }
      />
      <Route
        path="/campaigns"
        element={
          <PrivateRoute>
            <CampaignsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/plots"
        element={
          <FarmerRoute>
            <PlotsPage />
          </FarmerRoute>
        }
      />
      <Route
        path="/applications"
        element={
          <FarmerRoute>
            <ApplicationsPage />
          </FarmerRoute>
        }
      />
      <Route
        path="/calendar"
        element={
          <PrivateRoute>
            <CalendarPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <FarmerRoute>
            <ReportsPage />
          </FarmerRoute>
        }
      />
      <Route
        path="/audit-logs"
        element={
          <RoleRoute roles={['DIRECTIVA', 'ADMINISTRADOR']}>
            <AuditLogsPage />
          </RoleRoute>
        }
      />
      <Route
        path="/users"
        element={
          <AdminRoute>
            <UsersPage />
          </AdminRoute>
        }
      />
      {/* F10-SEC-02 (#45): operación privada legacy, sólo AGRICULTOR (FarmerRoute) */}
      <Route
        path="/inventory"
        element={
          <FarmerRoute>
            <InventoryPage />
          </FarmerRoute>
        }
      />
      <Route
        path="/purchases"
        element={
          <FarmerRoute>
            <PurchasesPage />
          </FarmerRoute>
        }
      />
      <Route
        path="/sync"
        element={
          <FarmerRoute>
            <SyncPage />
          </FarmerRoute>
        }
      />
      {/* F10-SEC-02 (#45): la pantalla heredada ejecutaba compras y pagos; el camino vigente es la propuesta */}
      <Route path="/directiva" element={<LegacyDirectivaRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CampaignProvider>
          <Suspense fallback={null}>
            <AppRoutes />
          </Suspense>
        </CampaignProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
