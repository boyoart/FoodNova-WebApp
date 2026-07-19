param(
    [Parameter(Mandatory = $true)]
    [string]$SourceBoard
)

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;

public static class FoodNovaBackgroundRemover {
    public static void RemoveConnectedLightBackground(Bitmap bitmap) {
        var visited = new bool[bitmap.Width, bitmap.Height];
        var queue = new Queue<Point>();
        for (var x = 0; x < bitmap.Width; x++) { queue.Enqueue(new Point(x, 0)); queue.Enqueue(new Point(x, bitmap.Height - 1)); }
        for (var y = 0; y < bitmap.Height; y++) { queue.Enqueue(new Point(0, y)); queue.Enqueue(new Point(bitmap.Width - 1, y)); }
        while (queue.Count > 0) {
            var point = queue.Dequeue();
            if (point.X < 0 || point.Y < 0 || point.X >= bitmap.Width || point.Y >= bitmap.Height || visited[point.X, point.Y]) continue;
            visited[point.X, point.Y] = true;
            var pixel = bitmap.GetPixel(point.X, point.Y);
            var min = Math.Min(pixel.R, Math.Min(pixel.G, pixel.B));
            var max = Math.Max(pixel.R, Math.Max(pixel.G, pixel.B));
            var brightness = (pixel.R + pixel.G + pixel.B) / 3;
            if (max - min >= 45 || brightness <= 205) continue;
            bitmap.SetPixel(point.X, point.Y, Color.Transparent);
            queue.Enqueue(new Point(point.X - 1, point.Y)); queue.Enqueue(new Point(point.X + 1, point.Y));
            queue.Enqueue(new Point(point.X, point.Y - 1)); queue.Enqueue(new Point(point.X, point.Y + 1));
        }
    }
}
'@ -ReferencedAssemblies System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$dispatch = Join-Path $root 'foodnova-dispatch-app\assets\images'

function Crop-Image([System.Drawing.Bitmap]$source, [System.Drawing.Rectangle]$rect) {
    $result = New-Object System.Drawing.Bitmap $rect.Width, $rect.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($result)
    $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle 0, 0, $rect.Width, $rect.Height), $rect, [System.Drawing.GraphicsUnit]::Pixel)
    $graphics.Dispose()
    return $result
}

function Make-White-Transparent([System.Drawing.Bitmap]$source) {
    [FoodNovaBackgroundRemover]::RemoveConnectedLightBackground($source)
}

function Resize-Save([System.Drawing.Bitmap]$source, [int]$width, [int]$height, [string]$path) {
    $result = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($result)
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $scale = [Math]::Min($width / $source.Width, $height / $source.Height)
    $drawWidth = [int]($source.Width * $scale)
    $drawHeight = [int]($source.Height * $scale)
    $left = [int](($width - $drawWidth) / 2)
    $top = [int](($height - $drawHeight) / 2)
    $graphics.DrawImage($source, $left, $top, $drawWidth, $drawHeight)
    $graphics.Dispose()
    $result.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $result.Dispose()
}

function Resize-SavePadded([System.Drawing.Bitmap]$source, [int]$width, [int]$height, [double]$fill, [string]$path) {
    $canvas = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $targetWidth = [int]($width * $fill)
    $targetHeight = [int]($height * $fill)
    $scale = [Math]::Min($targetWidth / $source.Width, $targetHeight / $source.Height)
    $drawWidth = [int]($source.Width * $scale)
    $drawHeight = [int]($source.Height * $scale)
    $graphics.DrawImage($source, [int](($width - $drawWidth) / 2), [int](($height - $drawHeight) / 2), $drawWidth, $drawHeight)
    $graphics.Dispose()
    $canvas.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $canvas.Dispose()
}

function Save-Monochrome([System.Drawing.Bitmap]$source, [int]$size, [string]$path) {
    $mono = New-Object System.Drawing.Bitmap $source.Width, $source.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    for ($y = 0; $y -lt $source.Height; $y++) {
        for ($x = 0; $x -lt $source.Width; $x++) {
            $pixel = $source.GetPixel($x, $y)
            $chroma = [Math]::Max($pixel.R, [Math]::Max($pixel.G, $pixel.B)) - [Math]::Min($pixel.R, [Math]::Min($pixel.G, $pixel.B))
            $darkness = 255 - (($pixel.R + $pixel.G + $pixel.B) / 3)
            $alpha = [int][Math]::Min(255, [Math]::Max($chroma * 3, $darkness * 2.2))
            $mono.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, 255, 255, 255))
        }
    }
    Resize-Save $mono $size $size $path
    $mono.Dispose()
}

$board = [System.Drawing.Bitmap]::FromFile((Resolve-Path $SourceBoard))
if ($board.Width -ne 1536 -or $board.Height -ne 1024) {
    throw "Expected the supplied 1536x1024 master brand board; got $($board.Width)x$($board.Height)."
}

$horizontal = Crop-Image $board (New-Object System.Drawing.Rectangle 78, 45, 850, 285)
$mark = Crop-Image $board (New-Object System.Drawing.Rectangle 716, 482, 205, 205)
Make-White-Transparent $horizontal
Make-White-Transparent $mark

Resize-Save $horizontal 1600 520 (Join-Path $dispatch 'foodnova-dispatch-logo.png')
Resize-SavePadded $mark 1024 1024 0.66 (Join-Path $dispatch 'adaptive-icon.png')
Resize-SavePadded $mark 1024 1024 0.82 (Join-Path $dispatch 'icon.png')
Resize-Save $mark 512 512 (Join-Path $dispatch 'splash-image.png')
Resize-Save $mark 512 512 (Join-Path $dispatch 'launch-screen-branding.png')
Resize-Save $mark 96 96 (Join-Path $dispatch 'favicon.png')
Save-Monochrome $mark 432 (Join-Path $dispatch 'monochrome-icon.png')
Save-Monochrome $mark 96 (Join-Path $dispatch 'notification-icon.png')
$board.Save((Join-Path $dispatch 'branding-preview.png'), [System.Drawing.Imaging.ImageFormat]::Png)

$horizontal.Dispose()
$mark.Dispose()
$board.Dispose()

Write-Output 'Generated FoodNova assets directly from the supplied master brand board.'
