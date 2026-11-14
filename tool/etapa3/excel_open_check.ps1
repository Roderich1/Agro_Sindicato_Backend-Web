# Abre cada .xlsx en Microsoft Excel (sólo lectura), recorre sus hojas y captura la ventana de
# Excel en PNG; además registra lo que Excel dice de cada hoja (filtro, panel inmovilizado, rango
# usado, formato numérico de las primeras celdas con valor y anchos). No modifica los archivos.
#   powershell -File excel_open_check.ps1 -Files a.xlsx,b.xlsx -OutDir <carpeta>
param([string[]]$Files, [string]$OutDir)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class W {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public struct R { public int L, T, Rt, B; }
}
"@
[W]::SetProcessDPIAware() | Out-Null
New-Item -ItemType Directory -Force $OutDir | Out-Null
$report = @()
$xl = New-Object -ComObject Excel.Application
try {
  $xl.Visible = $true
  $xl.DisplayAlerts = $false
  $xl.WindowState = -4137
  foreach ($file in $Files) {
    $wb = $xl.Workbooks.Open($file, 0, $true)
    $base = [IO.Path]::GetFileNameWithoutExtension($file) -replace '[^A-Za-z0-9_-]', '_'
    $i = 0
    foreach ($ws in $wb.Worksheets) {
      $i++
      $ws.Activate()
      $xl.ActiveWindow.ScrollRow = 1; $xl.ActiveWindow.ScrollColumn = 1
      Start-Sleep -Milliseconds 900
      [W]::SetForegroundWindow([IntPtr]$xl.Hwnd) | Out-Null
      Start-Sleep -Milliseconds 600
      $r = New-Object W+R
      [W]::GetWindowRect([IntPtr]$xl.Hwnd, [ref]$r) | Out-Null
      $w = $r.Rt - $r.L; $h = $r.B - $r.T
      $bmp = New-Object Drawing.Bitmap $w, $h
      $g = [Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size)
      $png = Join-Path $OutDir ("excel_{0}_{1:00}.png" -f $base, $i)
      $bmp.Save($png, [Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
      $used = $ws.UsedRange
      $formats = @()
      foreach ($c in $used.Cells) { if ($c.Value2 -ne $null -and $c.Row -gt 1 -and $formats.Count -lt 6) { $formats += "$($c.Address($false,$false))=$($c.NumberFormat)" } }
      $report += [pscustomobject]@{
        file = [IO.Path]::GetFileName($file); sheet = $ws.Name; filter = [bool]$ws.AutoFilterMode
        frozen = [bool]$xl.ActiveWindow.FreezePanes; split_row = $xl.ActiveWindow.SplitRow; used = $used.Address($false, $false)
        formats = ($formats -join '; '); col_widths = ((1..[Math]::Min(6, $used.Columns.Count)) | ForEach-Object { [Math]::Round($ws.Columns.Item($_).ColumnWidth, 1) }) -join ','
        shot = [IO.Path]::GetFileName($png)
      }
    }
    $wb.Close($false)
  }
} finally {
  $xl.Quit()
  [Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
$report | ConvertTo-Json -Depth 3 | Set-Content -Encoding utf8 (Join-Path $OutDir 'excel_open_check.json')
$report | Format-Table file, sheet, filter, frozen, split_row, used -AutoSize | Out-String -Width 220
