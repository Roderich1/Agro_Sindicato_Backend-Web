// Verificación E4, Parte 1.4: K=3 retirado en lo colectivo (F07-POL-02): Resumen y Cobertura con
// 1 y 2 aportantes, «Política aplicada», Excel del resumen sin «umbral» ni «anónimo».
const FORBID = ['umbral', 'anónim', 'Menos de \d+ agricultores', 'alcanzan el umbral', 'F1 sintético', 'F2 sintético'];
export default [
  { role: 'D1', steps: [
    { goto: '/colectivo/resumen', after: 5000 },
    { shot: 'web/D1_resumen', desc: 'Resumen (Directiva): Herbicida con 1 aportante y Fertilizante con 2, publicados con F07-POL-02' },
    { text: 'D1 resumen', expect: ['Política aplicada', 'F07-POL-02'], forbid: FORBID },
    { download: 'Descargar Excel', as: 'resumen_D1.xlsx' },
    { goto: '/colectivo/cobertura', after: 5000 },
    { shot: 'web/D1_cobertura', desc: 'Cobertura (Directiva) con F07-POL-02' },
    { text: 'D1 cobertura', expect: ['F07-POL-02|Política'], forbid: FORBID },
    { goto: '/colectivo/historico', after: 5000 },
    { shot: 'web/D1_historico', desc: 'Histórico (Directiva): sin campañas selladas en este tenant' },
    { text: 'D1 historico', forbid: FORBID },
    { apiLog: 'D1 colectivo' }, { bodies: 'D1 colectivo' },
  ] },
  { role: 'A1', steps: [
    { goto: '/colectivo/resumen', after: 5000 },
    { shot: 'web/A1_resumen', desc: 'Resumen (Administración): las mismas cifras de 1 y 2 aportantes' },
    { text: 'A1 resumen', expect: ['Política aplicada', 'F07-POL-02'], forbid: FORBID },
    { download: 'Descargar Excel', as: 'resumen_A1.xlsx' },
    { apiLog: 'A1 colectivo' },
  ] },
];
