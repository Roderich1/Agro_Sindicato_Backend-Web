import axios from 'axios';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { buttonClassFor } from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { readableCopies } from '../lib/estimation-copy';
import { ESTIMATION_COPY_PATH } from '../lib/navigation';

const LOGO_PATH =
  'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064';

/* Rediseño 2026-11-10: superficies claras y sólidas, sin degradados, desenfoques ni animación decorativa. */
const fieldClass =
  'w-full rounded-control border border-slate-300 bg-surface py-3 pl-11 text-sm text-ink placeholder-slate-500 focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700/25 disabled:opacity-60';

function Logo() {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card bg-brand-700 text-white" aria-hidden="true">
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={LOGO_PATH} />
      </svg>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // F12-EST-07-WEB (#180): si hay un contexto local vigente con copias (sin conexión no se pudo comprobar la sesión), se ofrece leerlas.
  const [hasCopy, setHasCopy] = useState(false);

  useEffect(() => {
    let alive = true;
    readableCopies(null)
      .then((copies) => alive && setHasCopy(copies.length > 0))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login(email, password);
      // La raíz elige la pantalla inicial según el rol (F07-WEB-01).
      navigate('/', { replace: true });
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const status = err.response.status;
        if (status === 429) {
          setError('Demasiados intentos. Espere un momento antes de intentar nuevamente.');
        } else {
          setError('Correo o contraseña incorrectos. Verifique sus datos.');
        }
      } else {
        setError('Error de conexión. Revise su acceso a internet.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-dvh bg-canvas">
      {/* Panel informativo (escritorio): fondo claro, sin decoración */}
      <div className="hidden border-r border-line bg-brand-50 lg:flex lg:w-1/2 xl:w-[55%]">
        <div className="flex flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-lg font-bold text-ink">Agrocuentas</span>
          </div>

          <div className="max-w-lg">
            <h2 className="text-balance text-4xl font-extrabold leading-tight text-ink xl:text-5xl">Vistas colectivas del sindicato</h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-700">
              Necesidad declarada, consumo registrado, propuesta de compra conjunta y estimación del consumo, con las cifras que
              autoriza la política de divulgación.
            </p>
            <ul className="mt-8 space-y-2.5">
              {['Resumen colectivo', 'Necesidades y propuestas', 'Histórico y estimaciones', 'Versiones selladas'].map((feat) => (
                <li key={feat} className="flex items-center gap-2.5 text-sm font-medium text-slate-800">
                  <svg className="h-4 w-4 shrink-0 text-brand-700" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {feat}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm text-slate-600">© {new Date().getFullYear()} Agrocuentas · Proyecto de Grado</p>
        </div>
      </div>

      {/* Formulario */}
      <div className="ui-gutter flex w-full flex-col items-center justify-center py-12 lg:w-1/2 xl:w-[45%]">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="mb-5 flex items-center gap-3 lg:hidden">
              <Logo />
              <p className="text-lg font-bold text-ink">Agrocuentas</p>
            </div>
            <h1 className="text-2xl font-bold text-ink">Ingresar</h1>
            <p className="mt-1.5 text-sm text-slate-600">
              Vistas colectivas de la Directiva y el Administrador. Ingrese sus credenciales para continuar.
            </p>
          </div>

          <div className="rounded-card border border-line bg-surface px-6 py-7 shadow-card sm:px-7">
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Correo electrónico
                </label>
                <div className="input-icon-wrapper">
                  <input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="next"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    placeholder="nombre@correo.com"
                    className={`${fieldClass} pr-4`}
                  />
                  <span className="input-icon" aria-hidden="true">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Contraseña
                </label>
                <div className="input-icon-wrapper relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    enterKeyHint="go"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className={`${fieldClass} pr-12`}
                  />
                  <span className="input-icon" aria-hidden="true">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-control text-slate-600 hover:bg-slate-100 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-700"
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                        />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                        />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0Z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" className="flex items-start gap-2.5 rounded-control border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <svg className="mt-0.5 h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              <button type="submit" disabled={isLoading || !email || !password} className={`${buttonClassFor('primary')} w-full py-3`}>
                {isLoading ? (
                  <>
                    <svg className="h-5 w-5 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Ingresando…
                  </>
                ) : (
                  'Ingresar'
                )}
              </button>
            </form>
            {hasCopy && (
              <p className="mt-4 text-sm text-slate-700" data-testid="offline-copy-link">
                Hay una estimación descargada en este navegador.{' '}
                <Link className="font-semibold text-brand-800 underline underline-offset-2" to={ESTIMATION_COPY_PATH}>
                  Consultarla sin conexión
                </Link>
              </p>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-slate-600">Si no puede ingresar, comuníquese con el administrador de su organización.</p>
        </div>
      </div>
    </main>
  );
}
