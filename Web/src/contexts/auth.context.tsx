import axios from 'axios';
import {
  createContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, clearAccessToken, setAccessToken } from '../lib/axios';
import { closeContext, openContext, purgeInaccessibleCopies } from '../lib/estimation-copy';

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
  tenant: TenantInfo;
}

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * F12-EST-07-WEB (#180): la copia de la estimación sólo se lee en el contexto
 * local de la sesión que la guardó (`lib/estimation-copy`). Una sesión que el
 * servidor acepta con rol institucional abre o mantiene ese contexto; con otra
 * identidad, sindicato o rol, se cierra el anterior. Cerrar o perder la sesión
 * lo cierra. Primero se retira el acceso, de forma síncrona, y después se
 * intenta el borrado físico. Si falla, queda pendiente (`purgePending`) y se
 * reintenta en la siguiente sesión o carga; nunca se da por hecho.
 */
function beginSession(next: AuthUser) {
  openContext({ userId: next.id, tenantId: next.tenantId, name: next.name, tenantName: next.tenant?.name ?? '', role: next.role });
  void purgeInaccessibleCopies();
}

function endSession() {
  closeContext();
  return purgeInaccessibleCopies();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    axios
      .post<AuthResponse>('/api/v1/auth/refresh', {}, { withCredentials: true })
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        beginSession(data.user);
        setUser(data.user);
      })
      .catch((err: unknown) => {
        // Sin sesión previa, continúa como anónimo. Si el servidor rechaza la
        // sesión, la copia sin conexión se retira; sin conexión no se sabe y se conserva.
        if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) void endSession();
        // Sin conexión, el contexto local se conserva para leer la copia; se reintenta un borrado pendiente.
        else void purgeInaccessibleCopies();
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
    setAccessToken(data.accessToken);
    beginSession(data.user);
    setUser(data.user);
  };

  const logout = async (): Promise<void> => {
    // El acceso a la copia se retira antes de avisar al servidor, aunque falle la red o el borrado.
    await endSession();
    try {
      await api.post('/auth/logout');
    } finally {
      clearAccessToken();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
