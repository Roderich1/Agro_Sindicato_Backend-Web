/**
 * Segunda ronda de correcciones de BASE (2026-11-13): margen del héroe pegado dentro de space-y,
 * línea del Stepper, posición al navegar y barra lateral fija. Medidas en el navegador real; sólo lectura.
 */
const LATERAL = 'nav[aria-label="Navegación principal"]';
const HERO = `(() => {
  const bar = document.querySelector('header.ui-shell-header');
  const hero = document.querySelector('.ui-hero-attach');
  if (!hero) return { hero: 'no encontrado' };
  const h = hero.getBoundingClientRect();
  const b = bar ? bar.getBoundingClientRect() : null;
  const parent = hero.parentElement;
  return { ruta: location.pathname, padreSpaceY: [...parent.classList].filter((c) => c.startsWith('space-y')), barraAbajo: b && Math.round(b.bottom), heroArriba: Math.round(h.top), heroIzq: Math.round(h.left), heroDer: Math.round(window.innerWidth - h.right), margenSuperior: getComputedStyle(hero).marginTop };
})()`;
const SCROLL = (label) => `(() => ({ ${label ? `momento: '${label}', ` : ''}ruta: location.pathname + location.search, scrollY: Math.round(window.scrollY) }))()`;

export default [
  {
    role: 'directiva',
    steps: [
      { goto: '/campaigns', after: 6000 },
      { viewport: 'movil' },
      { goto: '/campaigns', after: 4000 },
      { probe: 'héroe pegado /campaigns (390)', js: HERO },
      { shot: 'ronda3/campanas-cabecera-pegada', desc: 'Cabecera pegada a la barra en Campañas (390), dentro de space-y', sizes: ['actual'], full: false },
      { click: 'Ver detalle' },
      { probe: 'héroe pegado detalle de campaña (390)', js: HERO },
      { shot: 'ronda3/detalle-campana-heroe-pegado', desc: 'HeroPanel attachToHeader en el detalle de campaña (390)', sizes: ['actual'], full: false },
      { viewport: 'escritorio' },
      { scroll: '[aria-label="Versión de las cifras"]' },
      { shot: 'ronda3/stepper-version-cifras', desc: 'Stepper «Versión de las cifras» con la línea completa (escritorio)', sizes: ['escritorio'], full: false },
      { goto: '/colectivo/resumen', after: 5000 },
      { probe: 'antes', js: '(() => { window.scrollTo(0, 1500); return { scrollY: Math.round(window.scrollY) }; })()' },
      { probe: 'barra lateral desplazada', js: `(() => { const a = document.querySelector('aside#barra-lateral').getBoundingClientRect(); return { scrollY: Math.round(window.scrollY), asideArriba: Math.round(a.top), asideAlto: Math.round(a.height), ventanaAlto: window.innerHeight, posicion: getComputedStyle(document.querySelector('aside#barra-lateral')).position }; })()` },
      { shot: 'ronda3/barra-lateral-desplazada', desc: 'Barra lateral fija con la página desplazada 1500 px (ventana visible)', sizes: ['escritorio'], full: false },
      { click: '^Campañas$', in: LATERAL },
      { wait: 2500 },
      { probe: 'tras enlace a /campaigns', js: SCROLL('PUSH') },
      { goto: '/colectivo/catalogo?vista=productos', after: 5000 },
      { probe: 'catálogo antes', js: '(() => { window.scrollTo(0, 400); return { scrollY: Math.round(window.scrollY), alto: document.documentElement.scrollHeight }; })()' },
      { click: '^Nombres equivalentes$', in: LATERAL },
      { wait: 2500 },
      { probe: 'tras ?vista=equivalencias', js: SCROLL('misma ruta') },
    ],
  },
];
