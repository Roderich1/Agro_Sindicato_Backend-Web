# Captura cada hoja de los .xlsx de una carpeta tal como la muestra Excel (COM): copia el
# rango usado como imagen, lo pega en un gráfico temporal y lo exporta a PNG. No guarda
# ningún libro. Uso: powershell -File excel-png.ps1 <carpeta>
param([Parameter(Mandatory = $true)][string]$Folder)
$ErrorActionPreference = 'Stop'
$folder = (Resolve-Path $Folder).Path
$excel = New-Object -ComObject Excel.Application
# Excel debe estar visible para que CopyPicture/Paste produzcan una imagen; se cierra al terminar.
$excel.Visible = $true
$excel.DisplayAlerts = $false
try {
  foreach ($file in Get-ChildItem $folder -Filter '*.xlsx') {
    $book = $excel.Workbooks.Open($file.FullName, 0, $false)
    $index = 0
    foreach ($sheet in $book.Worksheets) {
      $index++
      $sheet.Activate()
      $used = $sheet.UsedRange
      # Hasta 14 columnas y 30 filas: suficiente para ver la identidad y los datos.
      $rows = [Math]::Min($used.Rows.Count, 30)
      $cols = [Math]::Min($used.Columns.Count, 14)
      $range = $sheet.Range($sheet.Cells.Item(1, 1), $sheet.Cells.Item($rows, $cols))
      $range.CopyPicture(1, 2) | Out-Null
      $chart = $sheet.ChartObjects().Add(0, 0, $range.Width, $range.Height)
      $chart.Activate() | Out-Null
      $chart.Chart.Paste()
      Start-Sleep -Milliseconds 400
      $png = Join-Path $folder ("{0}-{1}-{2}.png" -f $file.BaseName, $index, ($sheet.Name -replace '[^\p{L}\p{N}]+', '-'))
      $chart.Chart.Export($png, 'PNG') | Out-Null
      $chart.Delete()
      Write-Output ("PNG: {0}" -f $png)
    }
    $book.Close($false)
  }
} finally {
  $excel.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
