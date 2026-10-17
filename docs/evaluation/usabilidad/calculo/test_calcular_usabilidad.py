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
        self.assertIn('Participantes (sin piloto): 5.', self.report)

    def test_task_rows_with_denominators(self):
        expected = [
            '| T1 | 5 | 2/5 | 1/5 | 3/5 (60 %) | 1/5 | 1/5 | 0/5 | 0 | 3 | 0 | NO CUMPLE |',
            '| T2 | 5 | 5/5 | 0/5 | 5/5 (100 %) | 0/5 | 0/5 | 0/5 | 0 | 0 | 1 | NO CUMPLE |',
            '| T3 | 5 | 4/5 | 0/5 | 4/5 (80 %) | 0/5 | 0/5 | 1/5 | 0 | 0 | 0 | CUMPLE |',
            '| T4 | 4 | 0/4 | 4/4 | 4/4 (100 %) | 0/4 | 0/4 | 0/4 | 1 | 0 | 0 | CUMPLE |',
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

    def test_example_not_written_into_results(self):
        out = self.dir / 'resultados'
        out.mkdir()
        code = cu.main([str(self.dir), '--salida', str(out / 'informe.md')])
        self.assertEqual(code, 2)
        self.assertFalse((out / 'informe.md').exists())


if __name__ == '__main__':
    unittest.main()
