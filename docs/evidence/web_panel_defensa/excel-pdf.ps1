# Abre cada .xlsx de una carpeta con Microsoft Excel (COM, sólo lectura), comprueba que
# no haya reparación, vuelca un resumen de hojas y celdas y exporta el libro a PDF
# para revisarlo visualmente. Uso: powershell -File excel-pdf.ps1 <carpeta>
param([Parameter(Mandatory = $true)][string]$Folder)
$ErrorActionPreference = 'Stop'
$folder = (Resolve-Path $Folder).Path
$errorsBefore = @(Get-ChildItem $env:TEMP -Filter 'error*.xml' -ErrorAction SilentlyContinue).Count
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  foreach ($file in Get-ChildItem $folder -Filter '*.xlsx') {
    $book = $excel.Workbooks.Open($file.FullName, 0, $true)
    Write-Output ("== {0}: {1} hojas" -f $file.Name, $book.Worksheets.Count)
    foreach ($sheet in $book.Worksheets) {
      $used = $sheet.UsedRange
      $numbers = 0
      foreach ($c in $used.Cells) { if ($c.Value2 -is [double]) { $numbers++ } }
      Write-Output ("  - {0}: rango {1}, {2} celdas numéricas, pestaña color {3}" -f $sheet.Name, $used.Address($false, $false), $numbers, $sheet.Tab.Color)
      $r = 5; $c = 1
      $header = @()
      while ($sheet.Cells.Item($r, $c).Text -ne '' -and $c -le 14) { $header += $sheet.Cells.Item($r, $c).Text; $c++ }
      if ($header.Count -gt 0) { Write-Output ("    encabezados: {0}" -f ($header -join ' | ')) }
      $row = 6
      while ($sheet.Cells.Item($row, 1).Text -ne '' -and $row -le 12) {
        $vals = @()
        for ($k = 1; $k -le [Math]::Max($header.Count, 2); $k++) { $vals += $sheet.Cells.Item($row, $k).Text }
        Write-Output ("    fila {0}: {1}" -f $row, ($vals -join ' | '))
        $row++
      }
    }
    $pdf = Join-Path $folder ($file.BaseName + '.pdf')
    $book.ExportAsFixedFormat(0, $pdf)
    Write-Output ("  PDF: {0}" -f $pdf)
    $book.Close($false)
  }
} finally {
  $excel.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
$errorsAfter = @(Get-ChildItem $env:TEMP -Filter 'error*.xml' -ErrorAction SilentlyContinue).Count
Write-Output ("archivos de reparación en TEMP: antes {0}, después {1}" -f $errorsBefore, $errorsAfter)
