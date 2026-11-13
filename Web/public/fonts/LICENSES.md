# Tipografías de la Web (rediseño v2, 2026-11-13)

La Web carga sus tipografías desde este directorio (`/fonts/…`). No hace ninguna petición a Google Fonts ni a otro servicio externo.

## Archivos

Son copias byte a byte de las instancias que ya usa la app móvil: worktree `_wt/RDM-MOB`, rama del rediseño móvil, commit `2b4e2ec`, carpeta `assets/fonts/`. Se copiaron el 2026-11-13 y se dejaron en TTF, sin convertirlas a WOFF2: no había `fontTools` en el equipo y no se instaló ninguna dependencia nueva. El `.gitattributes` de esta carpeta (`* -text`) impide que git cambie los fines de línea, para que los SHA-256 sigan coincidiendo.

| Archivo | Familia y peso | SHA-256 | Bytes |
|---|---|---|---|
| `DMSans-400.ttf` | DM Sans 400 | `76229dea1a58946f3c9a66c5625ad562be7f38a70b7c711873cd014fdc4423f7` | 56 856 |
| `DMSans-500.ttf` | DM Sans 500 | `50ccb4522b935d58aa3d9f390d6d0a1645926dd0bfab4414614e988003600490` | 56 872 |
| `DMSans-700.ttf` | DM Sans 700 | `101ffda2cdec3588e029ed8c3102e7fed127b181f04deaccf8090178fd8ed754` | 56 784 |
| `BricolageGrotesque-700.ttf` | Bricolage Grotesque 700 | `928ab26afa7c49877d66895509515661105974664577eaefe416feae00608dd4` | 90 776 |
| `BricolageGrotesque-800.ttf` | Bricolage Grotesque 800 | `391b9fe3808d95918f6e65b74545ead6e651ef64530dfe6ee41cdf790ce6161c` | 90 792 |
| `licenses/dm_sans/OFL.txt` | Licencia SIL Open Font License 1.1 de DM Sans | `9af36190332437f5ecd09974de43c1f7c77a310a996cdd8ceb25628b458840e1` | 4 482 |
| `licenses/bricolage_grotesque/OFL.txt` | Licencia SIL Open Font License 1.1 de Bricolage Grotesque | `4b5a7d8f37f5602621c8a8d7358a6a2e71317e6c231c661e15aef0275d3e07ba` | 4 403 |

Los SHA-256 se calcularon con `sha256sum` sobre los archivos de esta carpeta el 2026-11-13. Coinciden con los de `_wt/RDM-MOB/assets/fonts/` y `assets/licenses/fonts/`.

## Procedencia

Copiada de la nota 8 y de las filas 28–29 de `_wt/RDM-MOB/assets/licenses/README.md`:

- **Licencias:**
  - DM Sans: `https://raw.githubusercontent.com/google/fonts/5b35b7208dd4100571326fdf37f030b32a524232/ofl/dmsans/OFL.txt`, commit `google/fonts` `5b35b7208dd4100571326fdf37f030b32a524232`.
  - Bricolage Grotesque: `https://raw.githubusercontent.com/google/fonts/6ce172f74aa355ea43eb964fa4a91570a4d3064d/ofl/bricolagegrotesque/OFL.txt`, commit `google/fonts` `6ce172f74aa355ea43eb964fa4a91570a4d3064d`.
- **Fuentes variables originales** (descargadas de `google/fonts` en esos mismos commits):
  - `ofl/dmsans/DMSans[opsz,wght].ttf`, SHA-256 `8cd08d97e89c24d0aa92edd2f0f4c8ee6195eee9b7c9f154865a58b02f0c1c0d`.
  - `ofl/bricolagegrotesque/BricolageGrotesque[opsz,wdth,wght].ttf`, SHA-256 `413e7357809ddd12fd80a96a8a396de0e401638d4acd3cb3e37532f0472ac682`.
- **Instancias:** los pesos se fijaron con `fontTools.varLib.instancer` (fonttools 4.68.0):
  - DM Sans: `wght=400/500/700`, `opsz=14`.
  - Bricolage Grotesque: `wght=700/800`, `opsz=32`, `wdth=100`.

  Según la OFL, una instancia es una «versión modificada». Ninguna de las dos fuentes declara «Reserved Font Name», así que conservan su nombre.

## Uso en la Web

`src/index.css` declara las cinco caras con `@font-face`, con `font-display: swap`:

- DM Sans es el texto (`--font-sans`).
- Bricolage Grotesque son los títulos y las cifras grandes (`--font-display`, utilidad `font-display`).

Si una cara no carga, se usan las fuentes del sistema. La OFL acompaña a los archivos en `licenses/` y se publica junto a ellos.

El service worker (`vite.config.ts`, `globPatterns`) no precachea `.ttf`. Por eso, sin conexión, la copia de la estimación puede verse con las fuentes del sistema. No se cambió `vite.config.ts` porque no forma parte del alcance de BASE.
