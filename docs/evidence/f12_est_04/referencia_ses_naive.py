"""Referencia independiente de F12-EST-04 (SES/naive, 3.12.4.8 y EST-D-07).

Escrita a partir de las reglas, no del código TypeScript:
- fractions.Fraction para la aritmética exacta (sin redondeos intermedios);
- decimal.Decimal con ROUND_HALF_UP solo para las cifras finales.

Uso: python -I referencia_ses_naive.py > referencia_ses_naive.json
"""
import json
import sys
from decimal import ROUND_HALF_EVEN, ROUND_HALF_UP, Decimal, getcontext
from fractions import Fraction as F

getcontext().prec = 400
ALPHAS = [F(k, 20) for k in range(21)]  # 0.00 … 1.00, paso 0.05
TOL = F(1, 10**9)  # tolerancia relativa de empate


def ses(values, alpha):
    """Nivel inicial = primera observación; criterio = errores a un paso desde la tercera."""
    level = F(values[0])
    sse = F(0)
    for t in range(1, len(values)):
        if t >= 2:
            sse += (values[t] - level) ** 2
        level = alpha * values[t] + (1 - alpha) * level
    return level, sse


def q6(x, rounding=ROUND_HALF_UP):
    return str((Decimal(x.numerator) / Decimal(x.denominator)).quantize(Decimal("0.000001"), rounding=rounding))


def stepwise(values, alpha):
    """Lo que el motor no debe hacer: redondear el nivel en cada paso."""
    a = Decimal(alpha.numerator) / Decimal(alpha.denominator)
    level = Decimal(values[0])
    for y in values[1:]:
        level = (a * y + (1 - a) * level).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
    return str(level)


def run(values):
    grid = [(a,) + ses(values, a) for a in ALPHAS]
    smin = min(s for _, _, s in grid)
    tied = [a for a, _, s in grid if s - smin <= TOL * smin]
    alpha = max(tied)
    level, sse = next((l, s) for a, l, s in grid if a == alpha)
    return {
        "entradas": values,
        "alpha": f"{float(alpha):.2f}",
        "alpha_minimo_estricto": f"{float(max(a for a, _, s in grid if s == smin)):.2f}",
        "ajuste_informativo": len(tied) != len(grid),
        "ses": q6(level),
        "ses_exacto": str(level),
        "ses_half_even": q6(level, ROUND_HALF_EVEN),
        "ses_redondeando_cada_paso": stepwise(values, alpha),
        "naive": values[-1],
        "criterio_ses": q6(sse),
        "criterio_naive": q6(next(s for a, _, s in grid if a == 1)),
    }


CASES = {
    "tesis_3.12.5_L": [96, 120, 104, 116],
    "tesis_3.12.5_mL": [96000, 120000, 104000, 116000],
    "constante": [500, 500, 500, 500],
    "ceros_comprobados": [0, 0, 0],
    "dos_ceros_y_cifra": [0, 0, 900],
    "inicio_plano": [700, 700, 50],
    "extremo_alpha_0": [100, 1000, 100, 100],
    "extremo_alpha_1_tendencia": [100, 200, 300, 400],
    "empate_exacto": [0, 40, 21],
    "empate_dentro_de_tolerancia": [0, 40 * 10**10, 21 * 10**10 - 1],
    "fuera_de_tolerancia": [0, 40 * 10**8, 21 * 10**8 - 1],
    "empate_decimal_half_up": [0, 0, 2, 1, 0, 0],
    "redondeo_por_pasos_distinto": [0, 0, 1, 0, 0, 8, 0],
    "tramo_F07_C7_C9_mL": [2400, 3300, 900],
    "reservado_incluido_0": [96, 120, 104, 116, 0],
    "reservado_incluido_1e9": [96, 120, 104, 116, 10**9],
}

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    json.dump({name: run(v) for name, v in CASES.items()}, sys.stdout, indent=1, ensure_ascii=False)
    sys.stdout.write("\n")
