import axios from 'axios';
import {
  createContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, clearAccessToken, setAccessToken, setSessionSync } from '../lib/axios';
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

/** Misma cuenta, sindicato y rol: la sesión local no cambia (ni se vuelve a pintar). */
function sameSession(a: AuthUser, b: AuthUser): boolean {
  return a.id === b.id && a.tenantId === b.tenantId && a.role === b.role;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Usuario vigente para los avisos del cliente HTTP, que llegan fuera del render.
  const userRef = useRef<AuthUser | null>(null);
  const setUser = (next: AuthUser | null) => {
    userRef.current = next;
    setUserState(next);
  };

  /**
   * Cierre O5 (decisión D): el rol vigente que devuelve el servidor (`GET /auth/me`
   * tras un 403, o la renovación del token) sustituye al de la sesión local. La
   * barra lateral y las guardas de ruta leen `user.role`, así que se recalculan y
   * una página que el nuevo rol no permite redirige a su inicio. Sin sesión local
   * no se adopta nada (el inicio de sesión sigue siendo el único que la abre).
   */
  useEffect(() => {
    const adoptServerUser = (next: AuthUser) => {
      const current = userRef.current;
      if (!current || sameSession(current, next)) return;
      beginSession(next);
      userRef.current = next;
      setUserState(next);
    };
    return setSessionSync({
      revalidate: async () => {
        if (!userRef.current) return;
        const { data } = await api.get<AuthUser>('/auth/me');
        adoptServerUser(data);
      },
      refreshed: adoptServerUser,
    });
  }, []);

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
