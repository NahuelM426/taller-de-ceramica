$taskRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$taskAssets = Join-Path $taskRoot "assets"
$taskOutput = Join-Path $taskRoot "play-store"
$taskLogoPath = Join-Path $taskAssets "mundo-ceramica-logo.png"
$taskWheelPath = Join-Path $taskAssets "torno-ceramica.png"

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $taskLogoPath)) {
  throw "No se encontro el logo de Mundo Ceramica."
}
if (-not (Test-Path -LiteralPath $taskWheelPath)) {
  throw "No se encontro la ilustracion del torno."
}
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null

function Save-Png([System.Drawing.Bitmap]$bitmap, [string]$path) {
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Draw-CroppedCircle(
  [System.Drawing.Graphics]$graphics,
  [System.Drawing.Image]$image,
  [System.Drawing.RectangleF]$rectangle
) {
  $state = $graphics.Save()
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  try {
    $path.AddEllipse($rectangle)
    $graphics.SetClip($path)
    $graphics.DrawImage($image, $rectangle)
  } finally {
    $graphics.Restore($state)
    $path.Dispose()
  }
}

$logo = [System.Drawing.Image]::FromFile($taskLogoPath)
$wheel = [System.Drawing.Image]::FromFile($taskWheelPath)
try {
  $icon = [System.Drawing.Bitmap]::new(512, 512)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($icon)
    try {
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.DrawImage($logo, [System.Drawing.Rectangle]::new(0, 0, 512, 512))
    } finally {
      $graphics.Dispose()
    }
    Save-Png $icon (Join-Path $taskOutput "icono-512.png")
  } finally {
    $icon.Dispose()
  }

  $feature = [System.Drawing.Bitmap]::new(1024, 500)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($feature)
    try {
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
      $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#F8F6F0"))

      $softGreen = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#E3EEE9"))
      $softClay = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#F6E7DF"))
      $green = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#315B50"))
      $ink = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#26332F"))
      $muted = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#66736E"))
      $clayPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml("#C87551"), 9)
      $titleFont = [System.Drawing.Font]::new("Segoe UI", 43, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
      $subtitleFont = [System.Drawing.Font]::new("Segoe UI", 25, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
      $eyebrowFont = [System.Drawing.Font]::new("Segoe UI", 17, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
      try {
        $graphics.FillEllipse($softGreen, 695, -145, 430, 430)
        $graphics.FillEllipse($softClay, 750, 290, 310, 310)
        $graphics.DrawArc($clayPen, 735, 330, 240, 110, 190, 155)

        Draw-CroppedCircle $graphics $logo ([System.Drawing.RectangleF]::new(64, 64, 372, 372))
        Draw-CroppedCircle $graphics $wheel ([System.Drawing.RectangleF]::new(822, 300, 150, 150))

        $taskBrand = "MUNDO CER$([char]0x00C1)MICA"
        $taskSeparator = [char]0x00B7
        $graphics.DrawString($taskBrand, $eyebrowFont, $green, 505, 126)
        $graphics.DrawString("Tu taller,`norganizado", $titleFont, $ink, 500, 163)
        $graphics.DrawString("Grupos $taskSeparator clases $taskSeparator modelos $taskSeparator vacantes", $subtitleFont, $muted, 503, 300)
      } finally {
        $softGreen.Dispose()
        $softClay.Dispose()
        $green.Dispose()
        $ink.Dispose()
        $muted.Dispose()
        $clayPen.Dispose()
        $titleFont.Dispose()
        $subtitleFont.Dispose()
        $eyebrowFont.Dispose()
      }
    } finally {
      $graphics.Dispose()
    }
    Save-Png $feature (Join-Path $taskOutput "grafico-funciones-1024x500.png")
  } finally {
    $feature.Dispose()
  }
} finally {
  $logo.Dispose()
  $wheel.Dispose()
}

Write-Host "Recursos de Google Play generados en $taskOutput" -ForegroundColor Green
