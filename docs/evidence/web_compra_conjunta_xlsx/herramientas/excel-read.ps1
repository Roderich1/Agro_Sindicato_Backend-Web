# Abre un archivo en Excel (COM, invisible) y vuelca valores, tipos y texto mostrado.
# Uso: excel-read.ps1 -Path <archivo> [-Mode open|bolivia] [-MaxRows 20] [-MaxCols 30]
param([string]$Path, [string]$Mode = 'open', [int]$MaxRows = 20, [int]$MaxCols = 30)
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false
$before = @(Get-ChildItem $env:TEMP -Filter 'error*.xml' -ErrorAction SilentlyContinue).Count
try {
  if ($Mode -eq 'bolivia') {
    # Emula es-BO (lista ';', decimal ',', miles '.') sólo para esta apertura: OpenText con
    # separadores explícitos, sin tocar la configuración regional ni la de Excel.
    # Origin 65001 = UTF-8; DataType 1 = delimitado; Semicolon = true, Comma = false.
    $xl.Workbooks.OpenText($Path, 65001, 1, 1, 1, $false, $false, $true, $false, $false, $false, [Type]::Missing, [Type]::Missing, [Type]::Missing, ',', '.', [Type]::Missing, $true)
    $wb = $xl.ActiveWorkbook
  } elseif ($Mode -eq 'bolivia-ansi') {
    $xl.Workbooks.OpenText($Path, 1252, 1, 1, 1, $false, $false, $true, $false, $false, $false, [Type]::Missing, [Type]::Missing, [Type]::Missing, ',', '.', [Type]::Missing, $true)
    $wb = $xl.ActiveWorkbook
  } else {
    $wb = $xl.Workbooks.Open($Path, 0, $true, [Type]::Missing, [Type]::Missing, [Type]::Missing, $true, [Type]::Missing, [Type]::Missing, $false, $false, [Type]::Missing, $false, $true)
  }
  "libro='$($wb.Name)' hojas=$($wb.Worksheets.Count)"
  foreach ($ws in $wb.Worksheets) {
    "alturas filas 1-6: " + ((1..6 | ForEach-Object { $ws.Rows.Item($_).RowHeight }) -join ',')
    $used = $ws.UsedRange
    "=== Hoja '$($ws.Name)' usada=$($used.Address(0,0)) autofilter=$($ws.AutoFilterMode) $(if ($ws.AutoFilterMode) { $ws.AutoFilter.Range.Address(0,0) })"
    $rows = [Math]::Min($used.Row + $used.Rows.Count - 1, $MaxRows)
    $cols = [Math]::Min($used.Column + $used.Columns.Count - 1, $MaxCols)
    for ($r = 1; $r -le $rows; $r++) {
      $cells = @()
      for ($c = 1; $c -le $cols; $c++) {
        $cell = $ws.Cells.Item($r, $c)
        $v = $cell.Value2
        if ($null -eq $v) { continue }
        $t = $v.GetType().Name
        $cells += "[$($cell.Address(0,0))] $t=$v | txt='$($cell.Text)' fmt='$($cell.NumberFormat)' w=$($ws.Columns.Item($c).ColumnWidth)"
      }
      if ($cells.Count) { $cells -join "`n" }
    }
  }
  $wb.Close($false)
  $after = @(Get-ChildItem $env:TEMP -Filter 'error*.xml' -ErrorAction SilentlyContinue).Count
  "registros de reparación de Excel en TEMP: antes=$before después=$after"
} finally {
  $xl.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
