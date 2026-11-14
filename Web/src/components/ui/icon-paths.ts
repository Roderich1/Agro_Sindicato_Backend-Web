/*
 * Trazos de los iconos de la Web (24×24, trazo redondeado). Sin librería de
 * iconos: se añaden aquí y se dibujan con `<Icon d={ICON.nombre} />`. Todos son
 * decorativos; el significado va siempre en el texto.
 */
export const ICON = {
  // Estados
  check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  alert: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  warn: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  inbox: 'M20 13V7a2 2 0 00-2-2H6a2 2 0 00-2 2v6m16 0v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4m16 0h-4l-2 3h-4l-2-3H4',
  search: 'M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z',
  lock: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z',
  eyeOff: 'M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 5.09A9.77 9.77 0 0112 5c4.48 0 8.27 2.94 9.54 7a9.96 9.96 0 01-4.13 5.17M6.61 6.61A9.97 9.97 0 002.46 12c1.27 4.06 5.06 7 9.54 7 1.67 0 3.25-.41 4.63-1.13',
  chart: 'M4 19h16M7 16v-3m5 3V9m5 7v-5',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  tick: 'M5 12.5l4.5 4.5L19 7.5',
  // Navegación (láminas 03, 21 y 43)
  home: 'M3.5 10.5L12 3.5l8.5 7V20a1 1 0 01-1 1H15v-6.5H9V21H4.5a1 1 0 01-1-1v-9.5z',
  clipboard: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  megaphone: 'M4 10v4a1 1 0 001 1h2l5 4V5L7 9H5a1 1 0 00-1 1zm12.5-1.5a5 5 0 010 7',
  archive: 'M4 8h16v11a2 2 0 01-2 2H6a2 2 0 01-2-2V8zm-1-4h18v4H3V4zm7 8h4',
  bars: 'M4 20h16M7.5 16v-4.5M12 16V6M16.5 16v-6',
  calendar: 'M8 3v4m8-4v4M4 10h16M5.5 5h13A1.5 1.5 0 0120 6.5v13a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 19.5v-13A1.5 1.5 0 015.5 5z',
  document: 'M14 3H7a1 1 0 00-1 1v16a1 1 0 001 1h10a1 1 0 001-1V7l-4-4zm0 0v4h4M9 12.5h6M9 16.5h6',
  users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  sprout: 'M12 21v-9m0 0C12 8.1 9.4 5.5 5 5.5c0 4 2.7 6.5 7 6.5zm0 2c0-3.6 2.5-6 6.5-6 0 3.6-2.5 6-6.5 6z',
  // Acciones
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M18 15l-6-6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  arrowRight: 'M5 12h14m-5-5l5 5-5 5',
  download: 'M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14',
  refresh: 'M20 12a8 8 0 11-2.34-5.66M20 4v5h-5',
  logout: 'M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M9 16l-4-4 4-4M5 12h10',
  close: 'M6 18L18 6M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  camera: 'M3 8.5A1.5 1.5 0 014.5 7h2.4l1.6-2.5h7l1.6 2.5h2.4A1.5 1.5 0 0121 8.5v10a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.5v-10zm9 8.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
} as const;

export type IconName = keyof typeof ICON;
