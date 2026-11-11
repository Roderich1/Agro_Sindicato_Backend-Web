import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { AdminRoute } from './components/admin-route';
import { CollectiveRoute } from './components/collective-route';
import { FarmerRoute, LegacyDirectivaRedirect } from './components/farmer-route';
import { PrivateRoute } from './components/private-route';
import { RedirectWithQuery } from './components/redirect-with-query';
import { AuthProvider } from './contexts/auth.context';
import { CampaignProvider } from './contexts/campaign.context';
import { useAuth } from './hooks/use-auth';
import { COLLECTIVE_PATHS, ESTIMATION_COPY_PATH, homePathFor, WEB_NOT_FOR_FARMERS_PATH } from './lib/navigation';
import { CampaignsPage } from './pages/campaigns.page';
import { DashboardPage } from './pages/dashboard.page';
import { InventoryPage } from './pages/inventory.page';
import { LoginPage } from './pages/login.page';
import { PlotsPage } from './pages/plots.page';
import { SyncPage } from './pages/sync.page';
import { UsersPage } from './pages/users.page';
import { WebNotForFarmersPage } from './pages/web-not-for-farmers.page';

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
const EstimationCopyPage = lazy(() =>
  import('./pages/estimation-copy.page').then((module) => ({ default: module.EstimationCopyPage })),
);
const AuditLogsPage = lazy(() =>
  import('./pages/audit-logs.page').then((module) => ({ default: module.AuditLogsPage })),
);
/* Rediseño 2026-11-10 (contrato §2): contenedores por tareas y detalle de campaña. */
const HistoryPage = lazy(() => import('./pages/history.page').then((module) => ({ default: module.HistoryPage })));
const CatalogPage = lazy(() => import('./pages/catalog.page').then((module) => ({ default: module.CatalogPage })));
const CampaignDetailPage = lazy(() =>
  import('./pages/campaign-detail.page').then((module) => ({ default: module.CampaignDetailPage })),
);
/**
 * Prototipos del Resumen (rediseño 2026-11-10, contrato §7): sólo en desarrollo,
 * sin guarda ni API. En producción la condición es falsa y el módulo no entra
 * en el paquete.
 */
const ResumenPrototypes = import.meta.env.DEV ? lazy(() => import('./dev/prototypes/resumen/harness')) : null;

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
      {/* Rediseño 2026-11-10: «Histórico y estimaciones» reúne tendencias selladas (F07) y la estimación
          del consumo (F12-EST-06, INT-09; el servidor autoriza). Las rutas antiguas redirigen conservando
          la consulta; la guarda queda en el destino. */}
      <Route
        path={COLLECTIVE_PATHS.history}
        element={
          <CollectiveRoute>
            <HistoryPage />
          </CollectiveRoute>
        }
      />
      <Route
        path={COLLECTIVE_PATHS.trends}
        element={<RedirectWithQuery to={COLLECTIVE_PATHS.history} set={{ vista: 'tendencias' }} />}
      />
      <Route
        path={COLLECTIVE_PATHS.estimation}
        element={<RedirectWithQuery to={COLLECTIVE_PATHS.history} set={{ vista: 'estimacion' }} />}
      />
      {/* «Catálogo y equivalencias»: productos del sindicato (crear y editar sólo Directiva y Administrador,
          lo decide el servidor) y equivalencias de productos. */}
      <Route
        path={COLLECTIVE_PATHS.catalog}
        element={
          <CollectiveRoute>
            <CatalogPage />
          </CollectiveRoute>
        }
      />
      <Route
        path={COLLECTIVE_PATHS.products}
        element={<RedirectWithQuery to={COLLECTIVE_PATHS.catalog} set={{ vista: 'productos' }} />}
      />
      <Route
        path={COLLECTIVE_PATHS.reconciliation}
        element={<RedirectWithQuery to={COLLECTIVE_PATHS.catalog} set={{ vista: 'equivalencias' }} />}
      />
      {/* F12-EST-07-WEB (#180): copia descargada, legible sin conexión y sin llamar al servidor */}
      <Route path={ESTIMATION_COPY_PATH} element={<EstimationCopyPage />} />
      {/* F07-WEB-01 (#23): otro rol no recibe menú ni datos, sólo este aviso */}
      <Route path={WEB_NOT_FOR_FARMERS_PATH} element={<WebNotForFarmersPage />} />
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
      {/* Detalle de campaña (rediseño 2026-11-10): compuesto en la Web, misma guarda que el listado */}
      <Route
        path="/campaigns/:id"
        element={
          <PrivateRoute>
            <CampaignDetailPage />
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
      {ResumenPrototypes && <Route path="/prototipos/resumen" element={<ResumenPrototypes />} />}
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
