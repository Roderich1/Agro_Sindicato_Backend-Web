"""Verificación E4: conteo de filas por tabla y versión de esquema de una COPIA de la base de la app
(sacada con `adb exec-out run-as … cat`). Sólo cuenta: no imprime contenido.
   python -I tool/e4/db_counts.py <copia.db> [tablas de convocatorias a detallar...]"""
import sqlite3, sys, json
con = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
v = con.execute("PRAGMA user_version").fetchone()[0]
tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
counts = {t: con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in tables}
print(json.dumps({"user_version": v, "tablas": len(tables), "no_vacias": {t: c for t, c in counts.items() if c}, "todas": counts}, ensure_ascii=False, indent=1))
