"""Cálculo verificable de la evaluación de usabilidad F10 (UX-01 Móvil, UX-02 Web).

Uso (Python 3.9+, sólo biblioteca estándar):

    python -I -X utf8 calcular_usabilidad.py <carpeta_con_csv> [--salida informe.md]

Lee `participantes.csv`, `tareas.csv` y `sus.csv` con el formato de
`../plantillas/` (UTF-8, con o sin BOM; separador coma). Escribe un informe en
Markdown con todos los denominadores a la vista. No imputa, no redondea antes
de calcular y no descarta fallos. Ante datos inválidos se detiene sin informe
parcial: cabeceras incompletas, valores fuera de rango, combinaciones
imposibles o filas que faltan.

Reglas (protocolo F10 v1.1 §3.3–§3.6; precisiones de `../README.md`):

- El piloto (`es_piloto=si`) no es un resultado: se excluye y sólo se cuenta.
- Móvil (T1–T6) y Web (W1–W5) se informan por separado.
- Cada intento se clasifica en exactamente una categoría, en este orden de
  precedencia: nivel de ayuda 3 -> «intervención del facilitador» (se informa
  aparte, no como éxito ni como fallo, sea cual sea el resultado); si no,
  resultado distinto de COMPLETADA -> «fallo» (abandono, tiempo agotado,
  incorrecta); si no, por nivel: 0 «sin ayuda», 1 «pista general»,
  2 «ayuda específica».
- Criterio por tarea: (sin ayuda + pista general) / intentos >= 80 % y cero
  errores críticos. Sólo se evalúa si la tarea la intentó **toda** la muestra
  planificada de la interfaz (5 Móvil, 2 Web). Con menos (o más) intentos el
  resultado es «NO EJECUTADA (muestra incompleta …)», con los conteos a la
  vista: nunca CUMPLE con menos.
- Tiempos y SEQ: sólo descriptivos (n, mediana, mínimo, máximo).
- SUS: puntaje por participante sólo con los 10 ítems respondidos; los
  incompletos se listan aparte sin puntaje. Media, mediana y rango de los
  completos. El puntaje SUS no es un porcentaje.

Con datos de ejemplo (códigos que empiezan por `EJ-`, sin distinguir
mayúsculas) el informe se marca como EJEMPLO FICTICIO y se niega a escribirse
dentro de una carpeta `resultados`.
"""
from __future__ import annotations

import argparse
import csv
import statistics
import sys
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

TASKS = {
    'MOVIL': ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'],
    'WEB': ['W1', 'W2', 'W3', 'W4', 'W5'],
}
#: Muestra planificada (decisiones de cierre §2; protocolo v1.1 §3.3).
PLANNED = {'MOVIL': 5, 'WEB': 2}
PROFILE_FOR = {'MOVIL': 'AGRICULTOR', 'WEB': 'DIRECTIVA'}
MODALITIES = {'INDIVIDUAL', 'COMPARTIDA'}
MAX_SECONDS = {'MOVIL': 300, 'WEB': 240}
RESULTS = {'COMPLETADA', 'INCORRECTA', 'ABANDONO', 'TIEMPO_AGOTADO'}
SUCCESS_CRITERION = 0.8
SUS_CRITERION = 68.0
EXAMPLE_PREFIX = 'EJ-'

COLUMNS = {
    'participantes.csv': ['codigo', 'interfaz', 'perfil', 'comodidad_digital', 'modalidad',
                          'es_piloto', 'version_tarjetas', 'version_sus', 'version_seq',
                          'observador_independiente', 'notas'],
    'tareas.csv': ['codigo', 'tarea', 'intentada', 'tiempo_s', 'resultado', 'nivel_ayuda',
                   'errores', 'errores_criticos', 'seq', 'notas'],
    'sus.csv': ['codigo', 'interfaz'] + [f'i{i}' for i in range(1, 11)] + ['notas'],
}
YES = {'si', 'sí'}


class DataError(Exception):
    """Los datos no cumplen el formato: se detiene sin informe parcial."""


@dataclass
class Participant:
    code: str
    interface: str
    profile: str
    comfort: int
    modality: str
    pilot: bool


@dataclass
class TaskRow:
    code: str
    task: str
    attempted: bool
    seconds: int | None
    result: str | None
    help_level: int | None
    errors: int | None
    critical: int | None
    seq: int | None

    @property
    def category(self) -> str:
        """Categoría única; el nivel 3 prevalece sobre el resultado."""
        if self.help_level == 3:
            return 'intervencion'
        if self.result != 'COMPLETADA':
            return 'fallo'
        return {0: 'sin_ayuda', 1: 'pista_general', 2: 'ayuda_especifica'}[self.help_level]


@dataclass
class TaskSummary:
    interface: str
    task: str
    attempts: int = 0
    not_attempted: int = 0
    counts: dict = field(default_factory=lambda: {
        'sin_ayuda': 0, 'pista_general': 0, 'ayuda_especifica': 0,
        'intervencion': 0, 'fallo': 0,
    })
    errors: int = 0
    critical: int = 0
    times_all: list = field(default_factory=list)
    times_success: list = field(default_factory=list)
    seq: list = field(default_factory=list)

    @property
    def successes(self) -> int:
        return self.counts['sin_ayuda'] + self.counts['pista_general']

    @property
    def verdict(self) -> str:
        planned = PLANNED[self.interface]
        if self.attempts == 0:
            return 'NO EJECUTADA'
        if self.attempts < planned:
            return f'NO EJECUTADA (muestra incompleta: {self.attempts} de {planned})'
        if self.attempts > planned:
            return f'NO EJECUTADA (muestra distinta de la planificada: {self.attempts} de {planned})'
        ok = self.successes / self.attempts >= SUCCESS_CRITERION and self.critical == 0
        return 'CUMPLE' if ok else 'NO CUMPLE'


def is_example(code: str) -> bool:
    return code.upper().startswith(EXAMPLE_PREFIX)


def _int(value: str, name: str, where: str, lo: int, hi: int | None = None) -> int | None:
    value = (value or '').strip()
    if value == '':
        return None
    try:
        number = int(value)
    except ValueError as exc:
        raise DataError(f'{where}: {name}="{value}" no es un entero') from exc
    if number < lo or (hi is not None and number > hi):
        raise DataError(f'{where}: {name}={number} fuera de rango [{lo}, {hi}]')
    return number


def _read(folder: Path, name: str) -> list[dict]:
    path = folder / name
    if not path.exists():
        raise DataError(f'Falta {name}')
    # utf-8-sig: un BOM (p. ej. CSV guardado desde Excel) no altera la cabecera.
    with path.open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        header = reader.fieldnames or []
        if len(header) <= 1 and header and ';' in header[0]:
            raise DataError(f'{name}: el separador es «;»; guarde el CSV separado por comas')
        missing = [c for c in COLUMNS[name] if c not in header]
        extra = [c for c in header if c not in COLUMNS[name]]
        if missing or extra:
            raise DataError(f'{name}: cabecera inválida (faltan: {missing or "—"}; '
                            f'sobran: {extra or "—"})')
        rows = list(reader)
    for n, row in enumerate(rows, start=2):
        if None in row:
            raise DataError(f'{name}:{n}: la fila tiene más columnas que la cabecera')
    return rows


def load_participants(folder: Path) -> dict[str, Participant]:
    participants: dict[str, Participant] = {}
    for n, row in enumerate(_read(folder, 'participantes.csv'), start=2):
        where = f'participantes.csv:{n}'
        code = (row['codigo'] or '').strip()
        interface = (row['interfaz'] or '').strip().upper()
        profile = (row['perfil'] or '').strip().upper()
        modality = (row['modalidad'] or '').strip().upper()
        pilot = (row['es_piloto'] or '').strip().lower()
        if not code:
            raise DataError(f'{where}: código vacío')
        if code in participants:
            raise DataError(f'{where}: código repetido {code}')
        if interface not in TASKS:
            raise DataError(f'{where}: interfaz "{interface}" no es MOVIL ni WEB')
        if profile != PROFILE_FOR[interface]:
            raise DataError(f'{where}: la interfaz {interface} corresponde al perfil '
                            f'{PROFILE_FOR[interface]}, no a "{profile}"')
        if profile == 'AGRICULTOR' and modality not in MODALITIES:
            raise DataError(f'{where}: modalidad "{modality}" debe ser INDIVIDUAL o COMPARTIDA')
        if profile == 'DIRECTIVA' and modality:
            raise DataError(f'{where}: la modalidad sólo se registra para agricultores')
        if pilot not in YES | {'no'}:
            raise DataError(f'{where}: es_piloto debe ser si/no')
        comfort = _int(row['comodidad_digital'], 'comodidad_digital', where, 1, 5)
        if comfort is None:
            raise DataError(f'{where}: falta comodidad_digital')
        participants[code] = Participant(code, interface, profile, comfort, modality,
                                         pilot in YES)
    return participants


def load_tasks(folder: Path, participants: dict[str, Participant]) -> list[TaskRow]:
    rows: list[TaskRow] = []
    seen: set[tuple[str, str]] = set()
    for n, row in enumerate(_read(folder, 'tareas.csv'), start=2):
        where = f'tareas.csv:{n}'
        code = (row['codigo'] or '').strip()
        task = (row['tarea'] or '').strip().upper()
        if code not in participants:
            raise DataError(f'{where}: código {code} no está en participantes.csv')
        interface = participants[code].interface
        if task not in TASKS[interface]:
            raise DataError(f'{where}: la tarea {task} no es de la interfaz {interface}')
        if (code, task) in seen:
            raise DataError(f'{where}: {code} tiene la tarea {task} repetida')
        seen.add((code, task))
        attempted = (row['intentada'] or '').strip().lower()
        if attempted not in YES | {'no'}:
            raise DataError(f'{where}: intentada debe ser si/no')
        measures = ('tiempo_s', 'resultado', 'nivel_ayuda', 'errores', 'errores_criticos', 'seq')
        if attempted == 'no':
            filled = [m for m in measures if (row[m] or '').strip()]
            if filled:
                raise DataError(f'{where}: una tarea no intentada no lleva mediciones '
                                f'({", ".join(filled)}); el motivo va en notas')
            rows.append(TaskRow(code, task, False, None, None, None, None, None, None))
            continue
        result = (row['resultado'] or '').strip().upper()
        if result not in RESULTS:
            raise DataError(f'{where}: resultado "{result}" no válido')
        seconds = _int(row['tiempo_s'], 'tiempo_s', where, 0, MAX_SECONDS[interface])
        help_level = _int(row['nivel_ayuda'], 'nivel_ayuda', where, 0, 3)
        errors = _int(row['errores'], 'errores', where, 0)
        critical = _int(row['errores_criticos'], 'errores_criticos', where, 0)
        seq = _int(row['seq'], 'seq', where, 1, 7)
        for name, value in (('tiempo_s', seconds), ('nivel_ayuda', help_level),
                            ('errores', errors), ('errores_criticos', critical)):
            if value is None:
                raise DataError(f'{where}: falta {name} en una tarea intentada')
        if result == 'TIEMPO_AGOTADO' and seconds != MAX_SECONDS[interface]:
            raise DataError(f'{where}: TIEMPO_AGOTADO debe registrar {MAX_SECONDS[interface]} s')
        rows.append(TaskRow(code, task, True, seconds, result, help_level, errors, critical, seq))
    return rows


def load_sus(folder: Path, participants: dict[str, Participant]) -> list[tuple[str, list]]:
    answers = []
    seen = set()
    for n, row in enumerate(_read(folder, 'sus.csv'), start=2):
        where = f'sus.csv:{n}'
        code = (row['codigo'] or '').strip()
        if code not in participants:
            raise DataError(f'{where}: código {code} no está en participantes.csv')
        if code in seen:
            raise DataError(f'{where}: SUS repetido para {code}')
        seen.add(code)
        interface = (row['interfaz'] or '').strip().upper()
        if interface != participants[code].interface:
            raise DataError(f'{where}: la interfaz no coincide con participantes.csv')
        items = [_int(row[f'i{i}'], f'i{i}', where, 1, 5) for i in range(1, 11)]
        answers.append((code, items))
    return answers


def sus_score(items: list) -> float | None:
    """Brooke (1996): impares - 1, pares 5 - x, suma x 2,5. None si incompleto."""
    if any(value is None for value in items):
        return None
    total = sum((v - 1) if i % 2 == 0 else (5 - v) for i, v in enumerate(items))
    return total * 2.5


def fmt(value: float | None, decimals: int = 1) -> str:
    """Sólo para mostrar: redondeo «mitad hacia arriba» (81,25 -> 81,3), el que
    se obtiene a mano; los cálculos usan el valor sin redondear."""
    if value is None:
        return '—'
    quantum = Decimal(1).scaleb(-decimals)
    rounded = Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP)
    return f'{rounded:.{decimals}f}'.replace('.', ',')


def describe(values: list) -> str:
    if not values:
        return 'n=0'
    return (f'n={len(values)}; mediana {fmt(statistics.median(values))}; '
            f'mín. {fmt(min(values), 0)}; máx. {fmt(max(values), 0)}')


def profile_line(people: list[Participant], interface: str) -> str:
    """n por perfil (protocolo v1.1 §3.3 y §3.7)."""
    low = sum(p.comfort <= 2 for p in people)
    mid = sum(p.comfort == 3 for p in people)
    high = sum(p.comfort >= 4 for p in people)
    text = (f'Perfil: comodidad digital 1–2: {low}; 3: {mid}; 4–5: {high}')
    if interface == 'MOVIL':
        shared = sum(p.modality == 'COMPARTIDA' for p in people)
        text += (f'; modalidad compartida: {shared}, individual: {len(people) - shared}. '
                 f'Objetivo del protocolo: al menos 2 con comodidad 1–2 '
                 f'({"cumplido" if low >= 2 else "no cumplido"}) y al menos 1 compartida '
                 f'({"cumplido" if shared >= 1 else "no cumplido"}).')
    else:
        text += '.'
    return text


def build_report(folder: Path) -> str:
    participants = load_participants(folder)
    tasks = load_tasks(folder, participants)
    sus = load_sus(folder, participants)
    example = any(is_example(code) for code in participants)
    pilots = sorted(c for c, p in participants.items() if p.pilot)

    lines: list[str] = []
    if example:
        lines += ['# EJEMPLO FICTICIO — NO ES UNA EVALUACIÓN EJECUTADA', '',
                  'Datos inventados para comprobar la aritmética. No describen a ninguna persona.', '']
    lines += ['# Resultados de usabilidad F10', '',
              f'Fuente: `{folder.name}/`. Piloto excluido de todos los cálculos: '
              f'{len(pilots)} ({", ".join(pilots) or "ninguno"}).', '']

    for interface, label in (('MOVIL', 'Móvil (UX-01)'), ('WEB', 'Web (UX-02)')):
        people = sorted((p for p in participants.values()
                         if p.interface == interface and not p.pilot), key=lambda p: p.code)
        codes = [p.code for p in people]
        lines += [f'## {label}', '',
                  f'Participantes (sin piloto): {len(codes)}; muestra planificada: '
                  f'{PLANNED[interface]}.', '', profile_line(people, interface), '']
        summaries = {t: TaskSummary(interface, t) for t in TASKS[interface]}
        recorded = {(r.code, r.task) for r in tasks}
        for code in codes:
            for task in TASKS[interface]:
                if (code, task) not in recorded:
                    raise DataError(f'Falta la fila de {code} para {task} en tareas.csv '
                                    '(si no se intentó, regístrela con intentada=no)')
        for row in tasks:
            if row.code not in codes:
                continue
            summary = summaries[row.task]
            if not row.attempted:
                summary.not_attempted += 1
                continue
            summary.attempts += 1
            summary.counts[row.category] += 1
            summary.errors += row.errors
            summary.critical += row.critical
            summary.times_all.append(row.seconds)
            if row.category in ('sin_ayuda', 'pista_general'):
                summary.times_success.append(row.seconds)
            if row.seq is not None:
                summary.seq.append(row.seq)

        lines += ['### Por tarea', '',
                  '| Tarea | Intentos | Sin ayuda (0) | Pista general (1) | Éxito 0–1 | '
                  'Ayuda específica (2) | Intervención (3) | Fallo | No intentada | Errores | '
                  'Críticos | Criterio |',
                  '|---|---|---|---|---|---|---|---|---|---|---|---|']
        for task, s in summaries.items():
            share = f'{s.successes}/{s.attempts}' if s.attempts else '0/0'
            if s.attempts:
                share += f' ({fmt(100 * s.successes / s.attempts, 0)} %)'
            lines.append(
                f'| {task} | {s.attempts} | {s.counts["sin_ayuda"]}/{s.attempts} | '
                f'{s.counts["pista_general"]}/{s.attempts} | {share} | '
                f'{s.counts["ayuda_especifica"]}/{s.attempts} | '
                f'{s.counts["intervencion"]}/{s.attempts} | {s.counts["fallo"]}/{s.attempts} | '
                f'{s.not_attempted} | {s.errors} | {s.critical} | {s.verdict} |')
        lines += ['', 'Criterio del estudio: éxito con ayuda de nivel 0–1 ≥ 80 % de los intentos '
                  'y ningún error crítico, evaluado sólo si intentó la tarea toda la muestra '
                  f'planificada ({PLANNED[interface]}). «Éxito 0–1» no es «sin ayuda»: el nivel 0 se '
                  'informa aparte. La intervención del facilitador (nivel 3) prevalece sobre el '
                  'resultado y se informa aparte: no es éxito ni fallo.',
                  '', '### Tiempo (s) y SEQ (1–7), descriptivos', '',
                  '| Tarea | Tiempo, todos los intentos | Tiempo, éxitos 0–1 | SEQ |',
                  '|---|---|---|---|']
        for task, s in summaries.items():
            lines.append(f'| {task} | {describe(s.times_all)} | {describe(s.times_success)} | '
                         f'{describe(s.seq)} (sin respuesta: {s.attempts - len(s.seq)}) |')

        complete = []
        incomplete = []
        for code, items in sus:
            if code not in codes:
                continue
            score = sus_score(items)
            if score is None:
                incomplete.append((code, sum(v is not None for v in items)))
            else:
                complete.append((code, score))
        missing = [c for c in codes if c not in {code for code, _ in sus}]
        lines += ['', '### SUS (0–100; no es un porcentaje)', '',
                  '| Código | Puntaje SUS |', '|---|---|']
        lines += [f'| {code} | {fmt(score)} |' for code, score in complete]
        if incomplete:
            lines += ['', 'Cuestionarios **incompletos** (sin puntaje, no entran en la media):', '']
            lines += [f'- {code}: {answered}/10 ítems respondidos' for code, answered in incomplete]
        if missing:
            lines += ['', f'Sin cuestionario SUS: {", ".join(missing)}.']
        scores = [score for _, score in complete]
        lines += ['', f'n válido: {len(scores)} de {len(codes)} participantes '
                  f'(incompletos: {len(incomplete)}; sin cuestionario: {len(missing)}).']
        if scores:
            mean = statistics.mean(scores)
            verdict = 'CUMPLE' if mean >= SUS_CRITERION else 'NO CUMPLE'
            lines.append(f'Media {fmt(mean)}; mediana {fmt(statistics.median(scores))}; '
                         f'rango {fmt(min(scores))}–{fmt(max(scores))}. '
                         f'Criterio del estudio (media ≥ 68): {verdict}.')
        else:
            lines.append('Sin cuestionarios completos: el criterio SUS queda NO EJECUTADO.')
        lines += ['', 'Muestra pequeña e intencional: resultados exploratorios, sin inferencia '
                  'poblacional.', '']
    return '\n'.join(lines) + '\n'


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('carpeta', type=Path)
    parser.add_argument('--salida', type=Path)
    args = parser.parse_args(argv)
    try:
        report = build_report(args.carpeta)
    except DataError as error:
        print(f'ERROR en los datos: {error}', file=sys.stderr)
        return 2
    if args.salida:
        example = report.startswith('# EJEMPLO FICTICIO')
        if example and 'resultados' in [part.lower() for part in args.salida.resolve().parts]:
            print('ERROR: un ejemplo ficticio no se escribe en una carpeta "resultados".',
                  file=sys.stderr)
            return 2
        args.salida.write_text(report, encoding='utf-8')
    else:
        sys.stdout.write(report)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
