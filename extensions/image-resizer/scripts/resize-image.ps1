param(
    [Parameter(Mandatory = $true)] [string]$InputPath,
    [Parameter(Mandatory = $true)] [string]$OutputPath,
    [Parameter(Mandatory = $true)] [int]$Width,
    [Parameter(Mandatory = $true)] [int]$Height,
    [int]$Quality = 85
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile($InputPath)
$dst = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
try {
    $g = [System.Drawing.Graphics]::FromImage($dst)
    try {
        $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        # Clamp edges so the border pixels do not fade to transparent.
        $attr = New-Object System.Drawing.Imaging.ImageAttributes
        $attr.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
        $rect = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
        $g.DrawImage($src, $rect, 0, 0, $src.Width, $src.Height, [System.Drawing.GraphicsUnit]::Pixel, $attr)
        $attr.Dispose()
    } finally {
        $g.Dispose()
    }

    $ext = [System.IO.Path]::GetExtension($OutputPath).ToLowerInvariant()
    if ($ext -eq '.jpg' -or $ext -eq '.jpeg') {
        $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
        $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]$Quality)
        # JPEG has no alpha: flatten onto white first.
        $flat = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
        $fg = [System.Drawing.Graphics]::FromImage($flat)
        $fg.Clear([System.Drawing.Color]::White)
        $fg.DrawImageUnscaled($dst, 0, 0)
        $fg.Dispose()
        $flat.Save($OutputPath, $encoder, $params)
        $flat.Dispose()
        $params.Dispose()
    } elseif ($ext -eq '.bmp') {
        $dst.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
    } else {
        $dst.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
} finally {
    $dst.Dispose()
    $src.Dispose()
}

Write-Output ('{"width":' + $Width + ',"height":' + $Height + '}')
