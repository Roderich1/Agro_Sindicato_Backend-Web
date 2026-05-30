import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoute } from './components/admin-route';
import { PrivateRoute } from './components/private-route';
import { AuthProvider } from './contexts/auth.context';
import { useAuth } from './hooks/use-auth';
import { DashboardPage } from './pages/dashboard.page';
import { DirectivaPage } from './pages/directiva.page';
import { InventoryPage } from './pages/inventory.page';
import { LoginPage } from './pages/login.page';
import { PurchasesPage } from './pages/purchases.page';
import { SyncPage } from './pages/sync.page';
import { UsersPage } from './pages/users.page';
import type { ReactNode } from 'react';

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
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
