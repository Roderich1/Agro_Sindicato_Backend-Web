"""Comprobación independiente del oráculo Web DS-UX (sólo biblioteca estándar).

    python -I -X utf8 oraculo_check.py oraculo_web.json [manifiesto.json]

Recalcula, desde la tabla «necesidades» del oráculo y la regla del umbral k
(una celda se publica si la declaran k o más miembros distintos), las celdas,
la cobertura y las líneas del borrador antes de W3, tras W3 (en los dos
sentidos de la asociación) y tras W4, y comprueba que coinciden con lo escrito
a mano en «esperado». No usa el código bajo prueba.

Con un manifiesto del generador, comprueba además que lo sembrado
(dataset.contributions y dataset.agricultores) es exactamente la tabla del
oráculo: un generador mal escrito no puede cambiar el valor esperado.
"""
import json
import sys


def cells(needs, alias_to_canonical, k):
    by_product = {}
    for row in needs:
        product = alias_to_canonical.get(row["producto"], row["producto"])
        cell = by_product.setdefault(product, {"members": set(), "base": 0})
        cell["members"].add(row["miembro"])
        cell["base"] += row["litros"] * 1000
    out = []
    for product in sorted(by_product):
        cell = by_product[product]
        out.append({
            "producto": product,
            "total_base": str(cell["base"]),
            "total_presentacion": str(cell["base"] // 1000) if cell["base"] % 1000 == 0 else str(cell["base"] / 1000),
            "aportantes": len(cell["members"]),
            "publicada": len(cell["members"]) >= k,
            "_members": cell["members"],
        })
    return out


def coverage(computed, agricultores):
    published = set()
    for cell in computed:
        if cell["publicada"]:
            published |= cell["_members"]
    return {"members_with_contribution": len(published), "linked_members": len(agricultores)}


def strip(computed, keys):
    return [{key: cell[key] for key in keys} for cell in computed]


def main():
    oracle = json.load(open(sys.argv[1], encoding="utf-8"))
    k = oracle["politica"]["k"]
    needs = oracle["necesidades"]
    expected = oracle["esperado"]
    failures = []

    def same(name, got, want):
        if got != want:
            failures.append(f"{name}: calculado {got} ≠ escrito {want}")

    cell_keys = ["producto", "total_base", "total_presentacion", "aportantes", "publicada"]
    before = cells(needs, {}, k)
    same("antes_de_W3.celdas", strip(before, cell_keys), expected["antes_de_W3"]["celdas"])
    same("antes_de_W3.cobertura", coverage(before, oracle["agricultores"]), expected["antes_de_W3"]["cobertura"])
    for canonical, alias in (("Bellator", "Belator"), ("Belator", "Bellator")):
        after = cells(needs, {alias: canonical}, k)
        same(f"tras_W3[{canonical}].celdas", strip(after, cell_keys), expected["tras_W3"]["celdas_por_canonico"][canonical])
        same(f"tras_W3[{canonical}].cobertura", coverage(after, oracle["agricultores"]), expected["tras_W3"]["cobertura"])
        lines = [cell for cell in after if cell["publicada"]]
        same(f"tras_W4[{canonical}].lineas", strip(lines, ["producto", "total_base", "total_presentacion", "aportantes"]),
             expected["tras_W4"]["lineas_por_canonico"][canonical])

    if len(sys.argv) > 2:
        manifest = json.load(open(sys.argv[2], encoding="utf-8"))
        seeded = sorted((c["member"], c["product"], c["quantity_base"], c["base_unit"], c["projection_type"])
                        for c in manifest["dataset"]["contributions"])
        wanted = sorted((n["miembro"], n["producto"], str(n["litros"] * 1000), "ML", "DECLARED_NEED") for n in needs)
        same("manifiesto.contributions", seeded, wanted)
        same("manifiesto.agricultores", manifest["dataset"]["agricultores"], oracle["agricultores"])
        same("manifiesto.campaign", manifest["dataset"]["campaign"], oracle["campana"])
        same("manifiesto.products", sorted(p["name"] for p in manifest["dataset"]["products"]), sorted(oracle["productos"]))

    if failures:
        print("ORÁCULO NO COINCIDE")
        for failure in failures:
            print(f"  {failure}")
        sys.exit(1)
    print("ORÁCULO COINCIDE" + (" (y el manifiesto siembra exactamente su tabla)" if len(sys.argv) > 2 else ""))


if __name__ == "__main__":
    main()
