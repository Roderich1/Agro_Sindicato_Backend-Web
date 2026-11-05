# Emula cómo Excel con configuración es-BO (lista ';', decimal ',', miles '.') importa un CSV,
# sin tocar la configuración regional ni las opciones de Excel: una QueryTable de texto con los
# separadores explícitos en un libro nuevo. -Delim semicolon|comma aísla el separador de los
# decimales; -Origin 65001 (UTF-8) o 1252 (ANSI, lo que Excel asume en un CSV sin BOM).
param([string]$Path, [string]$Delim = 'semicolon', [int]$Origin = 65001, [string]$Cells = 'A1,B1,R2,A5,A6,H6,P7,F2', [string]$Dec = ',', [string]$Thou = '.')
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false
try {
  $wb = $xl.Workbooks.Add(); $ws = $wb.Worksheets.Item(1)
  $qt = $ws.QueryTables.Add("TEXT;$Path", $ws.Range('A1'))
  $qt.TextFilePlatform = $Origin
  $qt.TextFileParseType = 1
  $qt.TextFileTextQualifier = 1
  $qt.TextFileSemicolonDelimiter = ($Delim -eq 'semicolon')
  $qt.TextFileCommaDelimiter = ($Delim -eq 'comma')
  $qt.TextFileDecimalSeparator = $Dec
  $qt.TextFileThousandsSeparator = $Thou
  [void]$qt.Refresh($false)
  "usada=$($ws.UsedRange.Address(0,0)) delim=$Delim origin=$Origin dec='$Dec' miles='$Thou'"
  foreach ($a in $Cells.Split(',')) { $c = $ws.Range($a); $v = $c.Value2; $t = if ($null -eq $v) { 'null' } else { $v.GetType().Name }; $s = "$v"; if ($s.Length -gt 70) { $s = $s.Substring(0,70) + '…' }; "[$a] $t=$s | txt='$($c.Text)'" }
  $wb.Close($false)
} finally { $xl.Quit(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl); [GC]::Collect() }
