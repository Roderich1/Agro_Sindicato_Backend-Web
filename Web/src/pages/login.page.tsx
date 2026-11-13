import axios from 'axios';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, ICON, Icon, Notice, inputClass, labelClass, linkClass } from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { readableCopies } from '../lib/estimation-copy';
import { ESTIMATION_COPY_PATH } from '../lib/navigation';

/*
 * Rediseño v2 (lámina 01): mitad izquierda oscura con la marca y el propósito de la Web; a la derecha, la
 * tarjeta «Ingresar». En teléfono la marca queda arriba, compacta. Sin enlaces de descarga ni datos fijos.
 * N2 (emulador): con `interactive-widget=resizes-content` el teclado encoge el área visible; la página
 * (min-h-dvh, sin alto fijo ni overflow oculto) puede desplazarse y el margen de desplazamiento deja el
 * campo enfocado por encima del teclado cuando el navegador lo lleva a la vista.
 */
const fieldClass = `${inputClass} scroll-my-24 min-h-12 text-base sm:text-sm`;

function Logo() {
  return (
    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-lime text-ink sm:h-12 sm:w-12" aria-hidden="true">
      <Icon d={ICON.sprout} className="h-6 w-6" strokeWidth={2.2} />
    </span>
  );
}

const FARMER_HINT = '¿Es agricultor? Su cuenta se usa en la aplicación móvil.';

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
    <main className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      {/* Marca y propósito (lámina 01). En teléfono, franja oscura compacta arriba. */}
      <div className="ui-on-ink ui-safe-top flex flex-col bg-ink text-white lg:w-1/2">
        <div className="ui-gutter flex flex-1 flex-col justify-between gap-8 py-7 lg:px-14 lg:py-14 xl:px-16">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="font-display text-2xl font-extrabold leading-none sm:text-3xl">Agrocuentas</span>
          </div>
          <div className="max-w-xl">
            <p className="font-display text-4xl font-extrabold leading-[0.98] tracking-tight sm:text-5xl lg:text-7xl">
              La Web de
              <br />
              la <span className="text-lime">Directiva</span>
            </p>
            <p className="mt-4 text-base leading-relaxed text-on-ink lg:mt-6 lg:text-xl">
              Vea cuánto necesita el sindicato, prepare las compras conjuntas y mantenga el catálogo.
            </p>
            <p className="mt-8 hidden text-sm text-on-ink-muted lg:block">{FARMER_HINT}</p>
          </div>
        </div>
      </div>

      {/* Formulario */}
      <div className="ui-gutter flex w-full flex-1 flex-col items-center justify-center py-8 sm:py-12 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="rounded-[28px] bg-surface px-6 py-8 shadow-card sm:px-10 sm:py-10">
            <h1 className="text-4xl font-extrabold leading-tight text-ink">Ingresar</h1>
            <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
              <div>
                <label htmlFor="email" className={labelClass}>
                  Correo electrónico
                </label>
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
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor="password" className={labelClass}>
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    enterKeyHint="go"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className={`${fieldClass} pr-24`}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-1.5 top-1/2 inline-flex min-h-10 -translate-y-1/2 items-center rounded-full px-3.5 text-sm font-bold text-ink hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2"
                  >
                    {showPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert">
                  <Notice kind="error">{error}</Notice>
                </div>
              )}

              <Button type="submit" size="lg" block busy={isLoading} disabled={!email || !password}>
                {isLoading ? 'Ingresando…' : 'Ingresar'}
              </Button>
            </form>

            <p className="mt-5 text-sm leading-relaxed text-ink-muted">Si no puede ingresar, hable con la administración de su sindicato.</p>

            {hasCopy && (
              <div className="mt-5 rounded-[18px] bg-sunken px-4 py-3.5 text-sm leading-relaxed text-ink" data-testid="offline-copy-link">
                <p>Este navegador tiene una copia de la estimación, guardada por una sesión que sigue abierta.</p>
                <Link className={linkClass} to={ESTIMATION_COPY_PATH}>
                  Consultarla sin conexión
                </Link>
                <p className="mt-1 text-xs text-ink-muted">Este aviso sólo aparece si esa copia existe. No da acceso a otros datos.</p>
              </div>
            )}
          </div>
          <p className="mt-6 text-center text-sm text-ink-muted lg:hidden">{FARMER_HINT}</p>
        </div>
      </div>
    </main>
  );
}
