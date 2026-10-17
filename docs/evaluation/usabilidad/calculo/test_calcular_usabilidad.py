"""Comprueba la aritmética de `calcular_usabilidad.py` con el EJEMPLO FICTICIO.

    python -I -X utf8 test_calcular_usabilidad.py -v

Los valores esperados se calcularon a mano a partir de `ejemplo_ficticio/`
(ver README de esa carpeta). No son resultados de ninguna evaluación.
"""
import csv
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import calcular_usabilidad as cu  # noqa: E402

EXAMPLE = HERE / 'ejemplo_ficticio'


class SusScore(unittest.TestCase):
    def test_brooke_rule(self):
        self.assertEqual(cu.sus_score([3] * 10), 50.0)
        self.assertEqual(cu.sus_score([5, 1] * 5), 100.0)
        self.assertEqual(cu.sus_score([1, 5] * 5), 0.0)
        self.assertEqual(cu.sus_score([4, 2] * 5), 75.0)
        self.assertEqual(cu.sus_score([4, 1] * 5), 87.5)

    def test_incomplete_has_no_score(self):
        items = [4, 2] * 5
        items[8] = None
        self.assertIsNone(cu.sus_score(items))


class ExampleReport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = cu.build_report(EXAMPLE)

    def test_marked_as_fictitious(self):
        self.assertTrue(self.report.startswith('# EJEMPLO FICTICIO'))

    def test_pilot_excluded(self):
        self.assertIn('Piloto excluido de todos los cálculos: 1 (EJ-X01)', self.report)
        self.assertNotIn('| EJ-X01 |', self.report)
        self.assertIn('Participantes (sin piloto): 5; muestra planificada: 5.', self.report)

    def test_task_rows_with_denominators(self):
        expected = [
            '| T1 | 5 | 2/5 | 1/5 | 3/5 (60 %) | 1/5 | 1/5 | 0/5 | 0 | 3 | 0 | NO CUMPLE |',
            '| T2 | 5 | 5/5 | 0/5 | 5/5 (100 %) | 0/5 | 0/5 | 0/5 | 0 | 0 | 1 | NO CUMPLE |',
            '| T3 | 5 | 4/5 | 0/5 | 4/5 (80 %) | 0/5 | 0/5 | 1/5 | 0 | 0 | 0 | CUMPLE |',
            # 4/4 éxitos, pero la muestra planificada es 5: nunca CUMPLE con menos.
            '| T4 | 4 | 0/4 | 4/4 | 4/4 (100 %) | 0/4 | 0/4 | 0/4 | 1 | 0 | 0 | '
            'NO EJECUTADA (muestra incompleta: 4 de 5) |',
            '| T5 | 5 | 3/5 | 0/5 | 3/5 (60 %) | 0/5 | 0/5 | 2/5 | 0 | 0 | 0 | NO CUMPLE |',
            '| W2 | 2 | 1/2 | 0/2 | 1/2 (50 %) | 1/2 | 0/2 | 0/2 | 0 | 0 | 0 | NO CUMPLE |',
            '| W4 | 2 | 1/2 | 0/2 | 1/2 (50 %) | 0/2 | 0/2 | 1/2 | 0 | 0 | 0 | NO CUMPLE |',
        ]
        for line in expected:
            self.assertIn(line, self.report)

    def test_times_and_seq_descriptive(self):
        self.assertIn('| T1 | n=5; mediana 150,0; mín. 90; máx. 280 | '
                      'n=3; mediana 120,0; mín. 90; máx. 150 | '
                      'n=4; mediana 5,5; mín. 4; máx. 7 (sin respuesta: 1) |', self.report)

    def test_sus_complete_incomplete_and_missing(self):
        self.assertIn('| EJ-P05 | 87,5 |', self.report)
        self.assertIn('- EJ-P04: 9/10 ítems respondidos', self.report)
        self.assertNotIn('| EJ-P04 |', self.report)
        self.assertIn('n válido: 4 de 5 participantes (incompletos: 1; sin cuestionario: 0).',
                      self.report)
        # (50 + 100 + 75 + 87,5) / 4 = 78,125; mediana (75 + 87,5) / 2 = 81,25.
        self.assertIn('Media 78,1; mediana 81,3; rango 50,0–100,0.', self.report)
        self.assertIn('Sin cuestionario SUS: EJ-D02.', self.report)
        self.assertIn('n válido: 1 de 2 participantes', self.report)

    def test_profile_counts(self):
        self.assertIn('Perfil: comodidad digital 1–2: 2; 3: 1; 4–5: 2; modalidad compartida: 2, '
                      'individual: 3.', self.report)
        self.assertIn('Perfil: comodidad digital 1–2: 1; 3: 0; 4–5: 1.', self.report)

    def test_sus_never_as_percentage(self):
        sus_part = self.report.split('### SUS')[1]
        self.assertNotIn('%', sus_part.split('Muestra pequeña')[0])


class Validation(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix='ux_calc_'))
        for name in ('participantes.csv', 'tareas.csv', 'sus.csv'):
            shutil.copy(EXAMPLE / name, self.dir / name)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def _edit(self, name, mutate):
        path = self.dir / name
        with path.open(encoding='utf-8', newline='') as handle:
            rows = list(csv.DictReader(handle))
            fields = list(rows[0].keys())
        mutate(rows)
        with path.open('w', encoding='utf-8', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)

    def assertRejected(self, fragment):
        with self.assertRaises(cu.DataError) as caught:
            cu.build_report(self.dir)
        self.assertIn(fragment, str(caught.exception))

    def test_sus_out_of_range(self):
        self._edit('sus.csv', lambda rows: rows[1].update(i3='6'))
        self.assertRejected('fuera de rango')

    def test_duplicate_task(self):
        self._edit('tareas.csv', lambda rows: rows.append(dict(rows[6])))
        self.assertRejected('repetida')

    def test_task_of_other_interface(self):
        self._edit('tareas.csv', lambda rows: rows[6].update(tarea='W1'))
        self.assertRejected('no es de la interfaz')

    def test_missing_task_row(self):
        self._edit('tareas.csv', lambda rows: rows.pop(6))
        self.assertRejected('Falta la fila')

    def test_timeout_must_record_the_limit(self):
        self._edit('tareas.csv', lambda rows: rows[26].update(tiempo_s='250'))
        self.assertRejected('TIEMPO_AGOTADO')

    def _verdict(self, task):
        line = next(l for l in cu.build_report(self.dir).splitlines()
                    if l.startswith(f'| {task} | '))
        return line.rsplit('|', 2)[1].strip()

    def test_web_with_one_of_two_attempts_is_not_executed(self):
        # D02 no intentó W1 y D01 acierta: 1/1 no es CUMPLE.
        def mutate(rows):
            for row in rows:
                if row['codigo'] == 'EJ-D02' and row['tarea'] == 'W1':
                    row.update(intentada='no', tiempo_s='', resultado='', nivel_ayuda='',
                               errores='', errores_criticos='', seq='')
        self._edit('tareas.csv', mutate)
        self.assertEqual(self._verdict('W1'), 'NO EJECUTADA (muestra incompleta: 1 de 2)')

    def test_mobile_with_one_of_five_attempts_is_not_executed(self):
        def mutate(rows):
            for row in rows:
                if row['tarea'] == 'T6' and row['codigo'] != 'EJ-P01' and row['codigo'] != 'EJ-X01':
                    row.update(intentada='no', tiempo_s='', resultado='', nivel_ayuda='',
                               errores='', errores_criticos='', seq='')
        self._edit('tareas.csv', mutate)
        self.assertEqual(self._verdict('T6'), 'NO EJECUTADA (muestra incompleta: 1 de 5)')

    def test_not_attempted_row_cannot_carry_measures(self):
        def mutate(rows):
            for row in rows:
                if row['codigo'] == 'EJ-P05' and row['tarea'] == 'T4':
                    row.update(errores_criticos='1')
        self._edit('tareas.csv', mutate)
        self.assertRejected('no intentada no lleva mediciones')

    def test_missing_column_is_rejected(self):
        path = self.dir / 'sus.csv'
        lines = path.read_text(encoding='utf-8').splitlines()
        trimmed = [','.join(l.split(',')[:11] + l.split(',')[12:]) for l in lines]  # sin i10
        path.write_text('\n'.join(trimmed) + '\n', encoding='utf-8')
        self.assertRejected("faltan: ['i10']")

    def test_missing_seq_column_is_rejected(self):
        path = self.dir / 'tareas.csv'
        lines = path.read_text(encoding='utf-8').splitlines()
        trimmed = [','.join(l.split(',')[:8] + l.split(',')[9:]) for l in lines]  # sin seq
        path.write_text('\n'.join(trimmed) + '\n', encoding='utf-8')
        self.assertRejected("faltan: ['seq']")

    def test_bom_is_accepted_and_semicolon_is_explained(self):
        path = self.dir / 'participantes.csv'
        text = path.read_text(encoding='utf-8')
        path.write_text('\ufeff' + text, encoding='utf-8')
        cu.build_report(self.dir)
        path.write_text(text.replace(',', ';'), encoding='utf-8')
        self.assertRejected('separador es «;»')

    def test_profile_must_match_interface(self):
        self._edit('participantes.csv', lambda rows: rows[1].update(perfil='DIRECTIVA'))
        self.assertRejected('corresponde al perfil AGRICULTOR')

    def test_modality_is_validated(self):
        self._edit('participantes.csv', lambda rows: rows[1].update(modalidad='OTRA'))
        self.assertRejected('modalidad')
        self._edit('participantes.csv', lambda rows: rows[1].update(modalidad='INDIVIDUAL'))
        self._edit('participantes.csv', lambda rows: rows[6].update(modalidad='INDIVIDUAL'))
        self.assertRejected('sólo se registra para agricultores')

    def test_level_three_prevails_over_result(self):
        def mutate(rows):
            for row in rows:
                if row['codigo'] == 'EJ-P01' and row['tarea'] == 'T6':
                    row.update(nivel_ayuda='3', resultado='ABANDONO')
        self._edit('tareas.csv', mutate)
        line = next(l for l in cu.build_report(self.dir).splitlines() if l.startswith('| T6 | '))
        # Intervención 1/5, fallo 0/5: el nivel 3 no se cuenta como fallo.
        self.assertIn('| 1/5 | 0/5 | 0 |', line)

    def test_lowercase_example_prefix_is_still_an_example(self):
        for name in ('participantes.csv', 'tareas.csv', 'sus.csv'):
            path = self.dir / name
            path.write_text(path.read_text(encoding='utf-8').replace('EJ-', 'ej-'),
                            encoding='utf-8')
        self.assertTrue(cu.build_report(self.dir).startswith('# EJEMPLO FICTICIO'))

    def test_example_not_written_into_results(self):
        out = self.dir / 'resultados'
        out.mkdir()
        code = cu.main([str(self.dir), '--salida', str(out / 'informe.md')])
        self.assertEqual(code, 2)
        self.assertFalse((out / 'informe.md').exists())


if __name__ == '__main__':
    unittest.main()
