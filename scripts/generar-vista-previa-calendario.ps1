Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap(1260, 1500)
$grafico = [System.Drawing.Graphics]::FromImage($bitmap)
$grafico.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$grafico.Clear([System.Drawing.Color]::FromArgb(248, 246, 240))
$fuenteTitulo = New-Object System.Drawing.Font("Arial", 18, [System.Drawing.FontStyle]::Bold)
$fuenteMes = New-Object System.Drawing.Font("Arial", 15, [System.Drawing.FontStyle]::Bold)
$fuenteDia = New-Object System.Drawing.Font("Arial", 8, [System.Drawing.FontStyle]::Bold)
$fuenteNumero = New-Object System.Drawing.Font("Arial", 10, [System.Drawing.FontStyle]::Bold)
$fuenteLeyenda = New-Object System.Drawing.Font("Arial", 8, [System.Drawing.FontStyle]::Bold)
$fuenteLeyendaTitulo = New-Object System.Drawing.Font("Arial", 11, [System.Drawing.FontStyle]::Bold)
$tinta = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(38, 51, 47))
$arcilla = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200, 117, 81))
$muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(120, 130, 126))
$papel = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 253, 249))
$borde = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(232, 230, 223), 1)
$colores = @("#C87551", "#315B50", "#D99B45", "#8B7597", "#4F7F92", "#B85C7A", "#A35B9A", "#9A6A35")
$nombres = @("Lunes tarde", "Martes torno", "Miercoles", "Jueves manana", "Viernes A", "Viernes B", "Sabado", "Grupo arcilla")
$dias = @("LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM")
$logo = [System.Drawing.Image]::FromFile((Join-Path $PSScriptRoot "..\assets\mundo-ceramica-logo.png"))

function Dibujar-Mes($x, $y, $titulo, $anio, $mes, $filas) {
  $grafico.FillRectangle($papel, $x, $y, 380, 1410)
  $grafico.DrawImage($logo, $x + 20, $y + 13, 55, 55)
  $grafico.DrawString("TALLER DE CERAMICA", $fuenteDia, $arcilla, $x + 88, $y + 20)
  $grafico.DrawString($titulo.ToUpper(), $fuenteMes, $tinta, $x + 88, $y + 42)
  for ($col = 0; $col -lt 7; $col++) {
    $grafico.DrawString($dias[$col], $fuenteDia, $muted, $x + 22 + ($col * 49), $y + 84)
  }
  $primero = ([int](Get-Date -Year $anio -Month $mes -Day 1).DayOfWeek + 6) % 7
  $cantidad = [DateTime]::DaysInMonth($anio, $mes)
  $celdaW = 49
  $alturaBase = if ($filas -eq 4) { 78 } elseif ($filas -eq 5) { 65 } else { 55 }
  $celdaH = [Math]::Max($alturaBase, 75)
  $gridY = $y + 108
  for ($indice = 0; $indice -lt ($filas * 7); $indice++) {
    $cx = $x + 18 + (($indice % 7) * $celdaW)
    $cy = $gridY + ([Math]::Floor($indice / 7) * $celdaH)
    $grafico.DrawRectangle($borde, $cx, $cy, $celdaW, $celdaH)
    $numero = $indice - $primero + 1
    if ($numero -ge 1 -and $numero -le $cantidad) {
      $grafico.DrawString([string]$numero, $fuenteNumero, $tinta, $cx + 18, $cy + 6)
      $cantidadMarcas = if ($numero -eq 11) { 6 } elseif (($numero % 4) -eq 0) { 2 } elseif (($numero % 3) -eq 0) { 1 } else { 0 }
      for ($marca = 0; $marca -lt $cantidadMarcas; $marca++) {
        $color = [System.Drawing.ColorTranslator]::FromHtml($colores[($numero + $marca) % $colores.Count])
        $pincel = New-Object System.Drawing.SolidBrush($color)
        $grafico.FillRectangle($pincel, $cx + 5, $cy + 25 + ($marca * 8), 39, 6)
        $pincel.Dispose()
      }
    }
  }
  $leyendaY = $gridY + ($filas * $celdaH) + 25
  $grafico.DrawString("GRUPOS DEL TALLER", $fuenteLeyendaTitulo, $tinta, $x + 20, $leyendaY)
  for ($i = 0; $i -lt $colores.Count; $i++) {
    $lx = $x + 20 + (($i % 2) * 175)
    $ly = $leyendaY + 28 + ([Math]::Floor($i / 2) * 48)
    $pincel = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($colores[$i]))
    $grafico.FillRectangle($pincel, $lx, $ly, 10, 31)
    $grafico.DrawString($nombres[$i], $fuenteLeyenda, $tinta, $lx + 18, $ly)
    $grafico.DrawString("Dia - 18:00", $fuenteDia, $muted, $lx + 18, $ly + 17)
    $pincel.Dispose()
  }
}

$grafico.DrawString("REVISION VISUAL - CALENDARIO COMPARTIBLE", $fuenteTitulo, $tinta, 24, 14)
Dibujar-Mes 20 55 "Febrero 2021 - 4 filas" 2021 2 4
Dibujar-Mes 440 55 "Septiembre 2026 - 5 filas" 2026 9 5
Dibujar-Mes 860 55 "Marzo 2026 - 6 filas" 2026 3 6
$salida = Join-Path $PSScriptRoot "..\docs\calendario-compartible-vista-previa.png"
$bitmap.Save($salida, [System.Drawing.Imaging.ImageFormat]::Png)
$grafico.Dispose(); $bitmap.Dispose()
$fuenteTitulo.Dispose(); $fuenteMes.Dispose(); $fuenteDia.Dispose(); $fuenteNumero.Dispose(); $fuenteLeyenda.Dispose(); $fuenteLeyendaTitulo.Dispose()
$tinta.Dispose(); $arcilla.Dispose(); $muted.Dispose(); $papel.Dispose(); $borde.Dispose()
$logo.Dispose()
Write-Output $salida
