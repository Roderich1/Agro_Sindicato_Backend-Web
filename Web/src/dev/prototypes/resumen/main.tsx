/**
 * Entrada de desarrollo de los prototipos del Resumen (2026-11-11):
 * `npx vite` y abrir `/src/dev/resumen-prototipos.html?v=2&datos=demo`.
 * Página aparte de la aplicación (como `break-ui.html`): los servicios se
 * sustituyen aquí por los fixtures sin tocar la aplicación real, que sigue
 * intacta en `/`. `vite build` no la incluye (sólo construye `index.html`).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import '../../../index.css';
import './proto.css';
import { AppShell } from '../../../components/app-shell';
import { DataState } from '../../../components/ui';
import { AuthContext } from '../../../contexts/auth.context';
import type { ResumenDataset } from './datasets';
import { ResumenPrototypes } from './harness';
import { installStubs } from './stubs';

if (!import.meta.env.DEV) throw new Error('Los prototipos del Resumen sólo funcionan en desarrollo.');

let dataset: ResumenDataset | null = null;
installStubs(() => dataset!);

const user = {
  id: 'u-proto',
  name: 'Usuaria sintética',
  email: 'prototipo@example.test',
  role: 'DIRECTIVA',
  tenantId: 't-proto',
  tenant: { id: 't-proto', name: 'Sindicato sintético de productores del valle', slug: 'sintetico' },
};

export const PROTO_PATH = '/src/dev/resumen-prototipos.html';

function Elsewhere() {
  const location = useLocation();
  return (
    <AppShell title="Prototipo" section="Prototipo · sólo desarrollo">
      <DataState
        state="empty"
        title="Esta ruta no forma parte del prototipo"
        description={`«${location.pathname}» pertenece a la aplicación real, que no cambia en este bloque.`}
        action={
          <Link to={`${PROTO_PATH}${location.search}`} className="font-semibold text-brand-800 underline underline-offset-2">
            Volver a los prototipos del Resumen
          </Link>
        }
      />
    </AppShell>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthContext.Provider value={{ user, isLoading: false, login: async () => undefined, logout: async () => undefined }}>
      <BrowserRouter>
        <Routes>
          <Route
            path={PROTO_PATH}
            element={
              <ResumenPrototypes
                onDataset={(next) => {
                  dataset = next;
                }}
              />
            }
          />
          <Route path="*" element={<Elsewhere />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  </StrictMode>,
);
