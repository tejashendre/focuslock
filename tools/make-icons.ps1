# =====================================================================
# FocusLock icon generator
# ---------------------------------------------------------------------
# Draws the padlock badge once at 512px, then downsamples with high
# quality bicubic to 16/32/48/128. Drawing small directly looks muddy;
# drawing big and shrinking keeps the shackle crisp at 16px.
#
# Re-run after changing the colours below:
#   powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
# =====================================================================

Add-Type -AssemblyName System.Drawing

$OutDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'icons'
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force $OutDir | Out-Null }

# --- palette -------------------------------------------------------
$RedTop    = [System.Drawing.Color]::FromArgb(255, 244, 63, 63)   # #f43f3f
$RedBottom = [System.Drawing.Color]::FromArgb(255, 159, 18, 18)   # #9f1212
$Keyhole   = [System.Drawing.Color]::FromArgb(255, 138, 16, 16)   # #8a1010
$Rim       = [System.Drawing.Color]::FromArgb(70, 0, 0, 0)        # soft dark edge

# Rounded-rectangle path helper.
function New-RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x,          $y,          $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y,          $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d,   0, 90)
  $p.AddArc($x,          $y + $h - $d, $d, $d,  90, 90)
  $p.CloseFigure()
  return $p
}

# --- master artwork at 512 -----------------------------------------
$S = 512
$master = New-Object System.Drawing.Bitmap($S, $S)
$g = [System.Drawing.Graphics]::FromImage($master)
$g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

# Squircle background with a vertical red gradient.
$inset  = [single]($S * 0.045)
$side   = [single]($S - 2 * $inset)
$radius = [single]($S * 0.225)
$bgPath = New-RoundedPath $inset $inset $side $side $radius

$p1 = New-Object System.Drawing.PointF([single]0, [single]$inset)
$p2 = New-Object System.Drawing.PointF([single]0, [single]($inset + $side))
$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($p1, $p2, $RedTop, $RedBottom)
$g.FillPath($grad, $bgPath)

# Hairline rim so the badge still reads on a white toolbar.
$rimPen = New-Object System.Drawing.Pen($Rim, [single]($S * 0.014))
$g.DrawPath($rimPen, $bgPath)

# --- padlock -------------------------------------------------------
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

# Shackle: top-half arc plus two straight legs down into the body.
$shacklePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [single]($S * 0.078))
$shacklePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$shacklePen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round

$aw = [single]($S * 0.255)                 # shackle width
$ax = [single](($S - $aw) / 2)
$ay = [single]($S * 0.255)                 # shackle top
$g.DrawArc($shacklePen, $ax, $ay, $aw, $aw, 180, 180)

$legTop    = [single]($ay + $aw / 2)
$legBottom = [single]($S * 0.475)
$g.DrawLine($shacklePen, $ax,       $legTop, $ax,       $legBottom)
$g.DrawLine($shacklePen, $ax + $aw, $legTop, $ax + $aw, $legBottom)

# Body: rounded rectangle.
$bw = [single]($S * 0.46)
$bh = [single]($S * 0.315)
$bx = [single](($S - $bw) / 2)
$by = [single]($S * 0.445)
$bodyPath = New-RoundedPath $bx $by $bw $bh ([single]($S * 0.055))
$g.FillPath($white, $bodyPath)

# Keyhole: circle plus a tapered slot, in a darker red so it reads as a cutout.
$khBrush = New-Object System.Drawing.SolidBrush($Keyhole)
$kr = [single]($S * 0.042)
$kcx = [single]($S / 2)
$kcy = [single]($by + $bh * 0.38)
$g.FillEllipse($khBrush, ($kcx - $kr), ($kcy - $kr), ($kr * 2), ($kr * 2))

$slot = New-Object System.Drawing.Drawing2D.GraphicsPath
$slot.AddPolygon(@(
  (New-Object System.Drawing.PointF(($kcx - $kr * 0.55), $kcy)),
  (New-Object System.Drawing.PointF(($kcx + $kr * 0.55), $kcy)),
  (New-Object System.Drawing.PointF(($kcx + $kr * 0.34), ($by + $bh * 0.80))),
  (New-Object System.Drawing.PointF(($kcx - $kr * 0.34), ($by + $bh * 0.80)))
))
$g.FillPath($khBrush, $slot)

$g.Dispose()

# --- downsample -----------------------------------------------------
foreach ($size in 16, 32, 48, 128) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $gg = [System.Drawing.Graphics]::FromImage($bmp)
  $gg.Clear([System.Drawing.Color]::Transparent)
  $gg.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $gg.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gg.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gg.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  # TileModeXY stops bicubic from sampling past the edge and leaving a
  # translucent 1px halo around the icon.
  $attr = New-Object System.Drawing.Imaging.ImageAttributes
  $attr.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
  $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
  $gg.DrawImage($master, $rect, 0, 0, $S, $S, [System.Drawing.GraphicsUnit]::Pixel, $attr)

  $gg.Dispose()
  $path = Join-Path $OutDir ("icon{0}.png" -f $size)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output ("wrote {0}" -f $path)
}

$master.Save((Join-Path $OutDir 'icon512.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$master.Dispose()
Write-Output "done"
