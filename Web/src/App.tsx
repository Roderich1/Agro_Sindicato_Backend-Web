import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { AdminRoute } from './components/admin-route';
import { CollectiveRoute } from './components/collective-route';
import { LegacyDirectivaRedirect } from './components/legacy-directiva-redirect';
import { PrivateRoute } from './components/private-route';
import { RedirectWithQuery } from './components/redirect-with-query';
import { AuthProvider } from './contexts/auth.context';
import { CampaignProvider } from './contexts/campaign.context';
import { useAuth } from './hooks/use-auth';
import { COLLECTIVE_PATHS, ESTIMATION_COPY_PATH, homePathFor, WEB_NOT_FOR_FARMERS_PATH } from './lib/navigation';
import { CampaignsPage } from './pages/campaigns.page';
import { LoginPage } from './pages/login.page';
import { UsersPage } from './pages/users.page';
import { WebNotForFarmersPage } from './pages/web-not-for-farmers.page';

const CalendarPage = lazy(() =>
  import('./pages/calendar.page').then((module) => ({ default: module.CalendarPage })),
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
/* E2 §6 (2026-11-11): convocatorias de compra conjunta (lista y detalle). */
const JointPurchaseCallsPage = lazy(() =>
  import('./pages/joint-purchase-calls.page').then((module) => ({ default: module.JointPurchaseCallsPage })),
);
const JointPurchaseCallDetailPage = lazy(() =>
  import('./pages/joint-purchase-call-detail.page').then((module) => ({ default: module.JointPurchaseCallDetailPage })),
);
const CampaignDetailPage = lazy(() =>
  import('./pages/campaign-detail.page').then((module) => ({ default: module.CampaignDetailPage })),
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

/** Tabla de rutas (se exporta para las pruebas de acceso por rol). */
export function AppRoutes() {
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
      {/* E2 §6: convocatorias de compra conjunta. Ver participantes exige además el permiso del responsable
          (E2-D6), que decide el servidor. */}
      <Route
        path={COLLECTIVE_PATHS.jointPurchaseCalls}
        element={
          <CollectiveRoute>
            <JointPurchaseCallsPage />
          </CollectiveRoute>
        }
      />
      <Route
        path={`${COLLECTIVE_PATHS.jointPurchaseCalls}/:id`}
        element={
          <CollectiveRoute>
            <JointPurchaseCallDetailPage />
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
        path="/calendar"
        element={
          <PrivateRoute>
            <CalendarPage />
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
      {/* F10-SEC-02 (#45): la pantalla heredada ejecutaba compras y pagos; el camino vigente es la propuesta */}
      <Route path="/directiva" element={<LegacyDirectivaRedirect />} />
      {/* La Web es sólo de Directiva y Administración: cualquier otra ruta (incluidas las antiguas del
          agricultor, ya retiradas) vuelve al inicio que corresponde a la sesión: login, resumen o aviso. */}
      <Route path="*" element={<HomeRedirect />} />
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
