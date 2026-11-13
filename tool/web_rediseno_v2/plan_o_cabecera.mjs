// Orquestador: acción principal de PageHeader a la altura del título en escritorio (láminas 21, 28, 31).
export default [
  { role: 'directiva', steps: [
    { goto: '/campaigns' }, { wait: 3000 },
    { shot: 'cabecera/28-campanas-accion', desc: 'Campañas: «Nueva campaña» a la altura del título', full: false, mobile: true },
  ] },
];
