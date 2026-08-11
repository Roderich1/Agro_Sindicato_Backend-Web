import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { AdminRoute } from './components/admin-route';
import { PrivateRoute } from './components/private-route';
import { AuthProvider } from './contexts/auth.context';
import { CampaignProvider } from './contexts/campaign.context';
import { useAuth } from './hooks/use-auth';
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
const DirectivaPage = lazy(() =>
  import('./pages/directiva.page').then((module) => ({ default: module.DirectivaPage })),
);
const CalendarPage = lazy(() =>
  import('./pages/calendar.page').then((module) => ({ default: module.CalendarPage })),
);
const ReportsPage = lazy(() =>
  import('./pages/reports.page').then((module) => ({ default: module.ReportsPage })),
);
const AuditLogsPage = lazy(() =>
  import('./pages/audit-logs.page').then((module) => ({ default: module.AuditLogsPage })),
);

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  return user ? <Navigate to="/dashboard" replace /> : <>{children}</>;
}

function RoleRoute({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return roles.includes(user.role) ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

/**
 * FarmerRoute: permite el acceso a agricultores y administradores,
 * pero BLOQUEA a DIRECTIVA (los redirige a su vista propia).
 */
function FarmerRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'DIRECTIVA') return <Navigate to="/directiva" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
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
          <PrivateRoute>
            <DashboardPage />
          </PrivateRoute>
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
          <PrivateRoute>
            <PlotsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/applications"
        element={
          <PrivateRoute>
            <ApplicationsPage />
          </PrivateRoute>
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
          <PrivateRoute>
            <ReportsPage />
          </PrivateRoute>
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
      {/* Solo agricultores y administradores — DIRECTIVA es redirigida */}
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
      {/* Solo DIRECTIVA y ADMINISTRADOR */}
      <Route
        path="/directiva"
        element={
          <RoleRoute roles={['DIRECTIVA', 'ADMINISTRADOR']}>
            <DirectivaPage />
          </RoleRoute>
        }
      />
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
