# ADR-004: Estimación exploratoria del consumo con SES y línea base naive (INT-09)

- **Estado:** Aceptada
- **Fecha de la decisión:** 2026-11-01 en Bolivia (2026-11-02 UTC). Es una decisión de Roderich Rendón, autor, comunicada en la sesión de conciliación del contrato F12-EST-01. Registrada el mismo día.
- **Alcance de la aceptación:** decisión del autor. No es una revisión del tutor ni de la Directiva.
- **Autor:** Roderich Rendón
- **Requisitos:** N11; RU-20, RU-21; CU-20, CU-21; RF-35 a RF-40; RN-25 a RN-30; INT-09; DAT-18 a DAT-20. Documento `Proyecto_Grado_Rodrigo_Univalle_v1.22.1_DEPURADO.docx`, 3.12.4.8.
- **Issue:** [#174](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/174) (F12-EST-01), decisión EST-D-01.
- **Relacionado:** [`F12_EST_01_ESTIMATION_CONTRACT.md`](../architecture/F12_EST_01_ESTIMATION_CONTRACT.md); [ADR-001](ADR-001-mobile-individual-system-of-record.md); [ADR-002](ADR-002-renumeracion-fases.md); [ADR-003](ADR-003-administrador-presidente-funciones-directiva.md).

## Contexto

Desde el 2026-10-15, los textos de alcance del repositorio excluían el pronóstico sin distinguir métodos:

| Archivo | Texto anterior (literal) |
|---|---|
| `docs/scope/CURRENT_SCOPE.md` §11 | «forecasting o predicción mediante IA;» |
| `AGENTS.md` | «No reintroducir forecasting, predicción o recomendaciones automáticas.» |
| `Back/AGENTS.md` | «No implementar forecasting ni aportes comunales (retirados, ADR-002).» |
| `Web/AGENTS.md` | «No implementar forecasting, aportes comunales (retirados, ADR-002) ni voz autónoma.» |

El documento v1.22.1, conciliado el 2026-10-31, sí incluye una estimación del consumo:
- es una referencia exploratoria por producto para la próxima campaña comparable (N11);
- se calcula en el servicio central con suavizamiento exponencial simple (SES) y se compara con una línea base naive (3.12.4.8);
- no tiene efectos sobre necesidades, propuestas, compras ni inventarios (RN-29).

El contrato F12-EST-01 dejó la contradicción abierta como EST-D-01.

## Decisión

1. **Se incluye en el alcance** la estimación exploratoria del consumo publicado por producto canónico y unidad base, para la campaña siguiente comparable (h = 1):
   - mediante SES, con la línea base naive como referencia;
   - calculada por lotes en el servicio central, según el contrato F12-EST-01.
2. **SES es un método de pronóstico estadístico**, y así se reconoce. La exclusión anterior del «forecasting» queda acotada por esta ADR; no desaparece.
3. **Siguen excluidos:**
   - ARIMA, Prophet, redes neuronales y cualquier otro modelo de aprendizaje automático o de IA;
   - variables climáticas, de precios o cualquier otra variable externa;
   - las recomendaciones automáticas, agronómicas o de compra, y las decisiones automáticas;
   - sumar la estimación a necesidades declaradas, propuestas, compras, lotes o inventarios, o usarla para crearlos o modificarlos;
   - cualquier otro método de pronóstico distinto de SES con línea base naive.
4. **`DemandForecast` no se reutiliza.** Sigue como modelo heredado `REMOVE_FROM_LIVE_SCOPE`, con su retiro en el epic #81.
5. **Sin modelo de roles nuevo.** Se usa la autorización existente por roles; ADR-003 se aplica sin cambios.

## Textos que cambian

Los cuatro textos de la tabla del contexto se sustituyen por la delimitación del punto 3 y enlazan esta ADR. El texto anterior queda aquí, literal, y en el historial de Git.

**No cambian**, porque esta decisión no los autorizó:
- `docs/scope/CAPABILITY_DISPOSITION_MATRIX.md`, fila `demand-forecasting` («No implementar forecasting»). Trata del modelo heredado `DemandForecast`, que sigue fuera del alcance Live.
- `docs/architecture/F06_COLLECTIVE_PROJECTION_CONTRACT.md` §1 («No hay réplica de SQLite, sincronización financiera, forecasting, IA, recomendación…»). Trata de lo que custodia la proyección colectiva F06; la estimación es otro módulo que solo lee sus cifras publicadas. El texto no lo distingue, y acotarlo queda pendiente.
- `docs/architecture/F07_SEALED_HISTORY_CONTRACT.md` §8 («No incluye forecasting…»). Trata de las tendencias F07, que siguen sin estimación.
- `docs/architecture/F01_INTEGRATION_DECISIONS.md`: la necesidad declarada «no es forecasting». Sigue siendo cierto.

## Historial

| Período | Regla vigente |
|---|---|
| Del 2026-10-15 al 2026-11-01 | Pronóstico excluido sin distinguir métodos (textos de la tabla del contexto) |
| Desde el 2026-11-01 (Bolivia) | Estimación SES/naive de INT-09 incluida; el resto del pronóstico sigue excluido (punto 3) |

Los commits, issues, PR y evidencias anteriores no se reescriben. Una referencia a «forecasting» con fecha anterior se lee con la regla de su período.

## Consecuencias

- F12-EST-02 a F12-EST-08 pueden implementar el contrato F12-EST-01 dentro del punto 3.
- Cualquier método distinto de SES/naive, o cualquier variable externa, exige una ADR nueva.
- La estimación sigue sujeta a la política de divulgación y a los permisos vigentes (contrato §2 y §4.2). Entregarla al Agricultor con datos reales exige que la política institucional (GOV-02, #107) contemple esa proyección (EST-D-05).
- Esta ADR **no** declara implementado nada. El estado de cada pieza está en el contrato §12.
