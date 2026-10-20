<#
BE #151 §A, ítems 1–6 (2026-10-19): ejecuta contra Backblaze B2 real la secuencia completa de
b151_b2.cjs, cada paso con su clave temporal (crear_claves_b151.ps1) inyectada por con_b2.ps1 sólo en
el proceso de ese paso. Este script no lee, no imprime y no pasa por argv ninguna clave.

  powershell -ExecutionPolicy Bypass -File tool\f08_b2\b151_ejecutar.ps1 -Subcarpeta <nombre> -Salida <dir> [-ConC6] [-Limpiar]

  -Subcarpeta  carpeta nueva bajo ensayo-f08/b151-20261019/ (p. ej. a-20261019t2300); la herramienta
               se niega a cualquier otro prefijo y «preparar» exige que esté vacía
  -Salida      carpeta de los informes JSON y de texto (saneados)
  -ConC6       además, el ítem 6: C2 y C5 con rw; T-R5 con nodel; y T-R5 con la purga de la rotación
               rechazada por B2 (copias con rw, borrados de la rotación con nodel: el paso se lanza con
               nodel y se relanza a sí mismo bajo con_b2.ps1 con rw). Exige F08_BKP_PG_TEST_URL en el
               entorno (un PostgreSQL desechable; la suite crea su propia base aislada)
  -Limpiar     al final, borra con rw todas las versiones, marcadores y multipart de la subcarpeta

Orden: rw preparar · ro caso1 · nodel caso1 · rw casos2a5 · [rw c6 · nodel c6 · rotacion c6] · rw inventario · [rw limpiar].
Si un paso falla, se registra y la secuencia sigue; el código de salida es el número de pasos fallidos.
#>
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9][a-z0-9-]{0,40}$')][string]$Subcarpeta,
  [Parameter(Mandatory = $true)][string]$Salida,
  [switch]$ConC6,
  [switch]$Limpiar,
  [string]$Secretos = (Join-Path $env:LOCALAPPDATA 'Agrocuentas\secretos'),
  [string]$ConB2 = (Join-Path $PSScriptRoot '..\..\..\tools\secretos-b2\con_b2.ps1')
)
$ErrorActionPreference = 'Stop'
$herramienta = Join-Path $PSScriptRoot 'b151_b2.cjs'
if (-not (Test-Path $ConB2)) { throw "No se encuentra con_b2.ps1 en $ConB2 (usa -ConB2)." }
foreach ($p in 'rw', 'ro', 'nodel') {
  if (-not (Test-Path (Join-Path $Secretos "b151-$p.clixml"))) { throw "Falta la clave b151-$p.clixml en $Secretos (crear_claves_b151.ps1)." }
}
if ($ConC6 -and -not $env:F08_BKP_PG_TEST_URL) { throw '-ConC6 necesita F08_BKP_PG_TEST_URL en el entorno.' }
New-Item -ItemType Directory -Force -Path $Salida | Out-Null
$Salida = (Resolve-Path $Salida).Path
$env:BACKUP_S3_PREFIX = "ensayo-f08/b151-20261019/$Subcarpeta/"

# Cada paso: clave con la que se lanza, perfil para la herramienta, paso y argumentos extra.
$pasos = @(@('rw', 'rw', 'preparar'), @('ro', 'ro', 'caso1'), @('nodel', 'nodel', 'caso1'), @('rw', 'rw', 'casos2a5'))
if ($ConC6) { $pasos += , @('rw', 'rw', 'c6'); $pasos += , @('nodel', 'nodel', 'c6'); $pasos += , @('nodel', 'rotacion', 'c6') }
$pasos += , @('rw', 'rw', 'inventario')
if ($Limpiar) { $pasos += , @('rw', 'rw', 'limpiar', 'confirmar') }
# Rutas (no secretos) para que el paso de la rotación se relance con la clave rw.
$env:F08_B151_CON_B2 = (Resolve-Path $ConB2).Path
$env:F08_B151_RW_CLIXML = (Resolve-Path (Join-Path $Secretos 'b151-rw.clixml')).Path

$fallidos = 0
try {
  foreach ($paso in $pasos) {
    $clave = $paso[0]; $perfil = $paso[1]
    Write-Host ''
    Write-Host ("== {0} · perfil {1} · clave {2} · prefijo {3}" -f $paso[2], $perfil, $clave, $env:BACKUP_S3_PREFIX) -ForegroundColor Cyan
    $argumentos = @($herramienta, 'b2', $perfil, $paso[2], $Salida) + @($paso | Select-Object -Skip 3)
    & powershell -NoProfile -ExecutionPolicy Bypass -File $ConB2 -Ruta (Join-Path $Secretos "b151-$clave.clixml") node @argumentos
    if ($LASTEXITCODE -ne 0) { $fallidos++; Write-Host ("   paso {0} ({1}) terminó con código {2}" -f $paso[2], $perfil, $LASTEXITCODE) -ForegroundColor Yellow }
  }
} finally {
  foreach ($n in 'BACKUP_S3_PREFIX', 'F08_B151_CON_B2', 'F08_B151_RW_CLIXML') { Remove-Item "Env:$n" -ErrorAction SilentlyContinue }
}
Write-Host ''
Write-Host ("Pasos con fallos: {0} de {1}. Informes en {2}" -f $fallidos, $pasos.Count, $Salida)
exit $fallidos
