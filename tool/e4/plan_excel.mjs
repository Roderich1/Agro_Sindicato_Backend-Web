// Verificación E4, Parte 1.4: descarga del Excel del Resumen (Directiva).
export default [{ role: 'D1', steps: [{ goto: '/colectivo/resumen', after: 5000 }, { download: 'Descargar Excel', as: 'resumen_D1.xlsx' }, { wait: 2000 }] }];
