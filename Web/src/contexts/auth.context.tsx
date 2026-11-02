import axios from 'axios';
import {
  createContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, clearAccessToken, setAccessToken } from '../lib/axios';
import { discardAllCopies, discardCopies, retainOnly, setActiveIdentity } from '../lib/estimation-copy';
import { COLLECTIVE_ROLES } from '../lib/navigation';

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
 * F12-EST-07-WEB (#180): la copia de la estimación pertenece a la identidad de
 * la sesión. Al empezar una sesión se borran las copias de cualquier otra
 * identidad o sindicato, y también las propias si el servidor ya no le da un
 * rol institucional (la copia es del perfil institucional); al cerrarla, o si
 * el servidor la rechaza, todas.
 */
function beginSession(next: AuthUser) {
  const identity = { userId: next.id, tenantId: next.tenantId };
  setActiveIdentity(identity);
  const institutional = (COLLECTIVE_ROLES as readonly string[]).includes(next.role);
  void retainOnly(identity)
    .then(() => (institutional ? undefined : discardCopies(identity)))
    .catch(() => undefined);
}

function endSession() {
  setActiveIdentity(null);
  return discardAllCopies().catch(() => undefined);
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
    // La copia se borra antes de avisar al servidor: aunque falle la red, no queda.
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
