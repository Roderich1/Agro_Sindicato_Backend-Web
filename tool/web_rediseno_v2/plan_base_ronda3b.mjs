/**
 * Segunda pasada de la ronda 3 (2026-11-13): el héroe pegado dentro de un `space-y-*` real
 * (se añade la clase al contenedor sólo en esta sonda) y el origen de la vuelta arriba al
 * cambiar `?vista=` (¿efecto del armazón o recorte del navegador porque la vista se acorta
 * mientras carga?). Sólo lectura.
 */
const LATERAL = 'nav[aria-label="Navegación principal"]';
const HERO_SPACE = `(() => {
  const hero = document.querySelector('.ui-hero-attach');
  if (!hero) return { hero: 'no encontrado' };
  const parent = hero.parentElement;
  const sibling = document.createElement('div');
  sibling.textContent = 'sonda';
  parent.insertBefore(sibling, hero);
  parent.removeChild(sibling);
  parent.classList.add('space-y-4');
  const bar = document.querySelector('header.ui-shell-header').getBoundingClientRect();
  const h = hero.getBoundingClientRect();
  const r = { contenedor: [...parent.classList].filter((c) => c.startsWith('space-y')), barraAbajo: Math.round(bar.bottom), heroArriba: Math.round(h.top), heroIzq: Math.round(h.left), margenSuperior: getComputedStyle(hero).marginTop, margenInferior: getComputedStyle(hero).marginBottom };
  parent.classList.remove('space-y-4');
  return r;
})()`;

export default [
  {
    role: 'directiva',
    steps: [
      { goto: '/campaigns', after: 6000 },
      { viewport: 'movil' },
      { goto: '/campaigns', after: 4000 },
      { probe: 'héroe pegado con space-y-4 en el contenedor (390)', js: HERO_SPACE },
      { viewport: 'escritorio' },
      { goto: '/colectivo/catalogo?vista=productos', after: 5000 },
      { probe: 'registro', js: `(() => { window.scrollTo(0, 300); window.__desplaz = []; window.addEventListener('scroll', () => window.__desplaz.push([Math.round(window.scrollY), document.documentElement.scrollHeight])); return { scrollY: Math.round(window.scrollY), alto: document.documentElement.scrollHeight }; })()` },
      { click: '^Nombres equivalentes$', in: LATERAL },
      { wait: 3000 },
      { probe: 'tras ?vista=equivalencias', js: `(() => ({ ruta: location.pathname + location.search, scrollY: Math.round(window.scrollY), alto: document.documentElement.scrollHeight, eventos: window.__desplaz.slice(0, 6) }))()` },
    ],
  },
];
