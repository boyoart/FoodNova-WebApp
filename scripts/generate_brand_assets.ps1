param(
    [Parameter(Mandatory = $true)]
    [string]$SourceBoard
)

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$dispatch = Join-Path $root 'foodnova-dispatch-app\assets\images'
$customer = Join-Path $root 'foodnova-customer-app\assets\brand'

function Crop-Image([System.Drawing.Bitmap]$source, [System.Drawing.Rectangle]$rect) {
    $result = New-Object System.Drawing.Bitmap $rect.Width, $rect.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($result)
    $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle 0, 0, $rect.Width, $rect.Height), $rect, [System.Drawing.GraphicsUnit]::Pixel)
    $graphics.Dispose()
    return $result
}

function Make-White-Transparent([System.Drawing.Bitmap]$source) {
    for ($y = 0; $y -lt $source.Height; $y++) {
        for ($x = 0; $x -lt $source.Width; $x++) {
            $pixel = $source.GetPixel($x, $y)
            $minimum = [Math]::Min($pixel.R, [Math]::Min($pixel.G, $pixel.B))
            $maximum = [Math]::Max($pixel.R, [Math]::Max($pixel.G, $pixel.B))
            $brightness = ($pixel.R + $pixel.G + $pixel.B) / 3
            if (($maximum - $minimum) -lt 80 -and $brightness -gt 120) {
                $source.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
            }
        }
    }
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
Resize-Save $mark 1024 1024 (Join-Path $dispatch 'adaptive-icon.png')
Resize-Save $mark 1024 1024 (Join-Path $dispatch 'icon.png')
Resize-Save $mark 512 512 (Join-Path $dispatch 'splash-image.png')
Resize-Save $mark 512 512 (Join-Path $dispatch 'launch-screen-branding.png')
Resize-Save $mark 96 96 (Join-Path $dispatch 'favicon.png')
Save-Monochrome $mark 432 (Join-Path $dispatch 'monochrome-icon.png')
Save-Monochrome $mark 96 (Join-Path $dispatch 'notification-icon.png')
Resize-Save $mark 1024 1024 (Join-Path $customer 'foodnova-logo.png')

# Customer launcher and web assets use the same unmodified brand mark.
Resize-Save $mark 48 48 (Join-Path $root 'foodnova-customer-app\android\app\src\main\res\mipmap-mdpi\ic_launcher.png')
Resize-Save $mark 72 72 (Join-Path $root 'foodnova-customer-app\android\app\src\main\res\mipmap-hdpi\ic_launcher.png')
Resize-Save $mark 96 96 (Join-Path $root 'foodnova-customer-app\android\app\src\main\res\mipmap-xhdpi\ic_launcher.png')
Resize-Save $mark 144 144 (Join-Path $root 'foodnova-customer-app\android\app\src\main\res\mipmap-xxhdpi\ic_launcher.png')
Resize-Save $mark 192 192 (Join-Path $root 'foodnova-customer-app\android\app\src\main\res\mipmap-xxxhdpi\ic_launcher.png')
Resize-Save $mark 16 16 (Join-Path $root 'foodnova-customer-app\macos\Runner\Assets.xcassets\AppIcon.appiconset\app_icon_16.png')
Resize-Save $mark 32 32 (Join-Path $root 'foodnova-customer-app\macos\Runner\Assets.xcassets\AppIcon.appiconset\app_icon_32.png')
Resize-Save $mark 64 64 (Join-Path $root 'foodnova-customer-app\macos\Runner\Assets.xcassets\AppIcon.appiconset\app_icon_64.png')
Resize-Save $mark 128 128 (Join-Path $root 'foodnova-customer-app\macos\Runner\Assets.xcassets\AppIcon.appiconset\app_icon_128.png')
Resize-Save $mark 256 256 (Join-Path $root 'foodnova-customer-app\macos\Runner\Assets.xcassets\AppIcon.appiconset\app_icon_256.png')
Resize-Save $mark 512 512 (Join-Path $root 'foodnova-customer-app\macos\Runner\Assets.xcassets\AppIcon.appiconset\app_icon_512.png')
Resize-Save $mark 1024 1024 (Join-Path $root 'foodnova-customer-app\macos\Runner\Assets.xcassets\AppIcon.appiconset\app_icon_1024.png')
Resize-Save $mark 1024 1024 (Join-Path $root 'foodnova-customer-app\ios\Runner\Assets.xcassets\AppIcon.appiconset\Icon-App-1024x1024@1x.png')
Resize-Save $mark 20 20 (Join-Path $root 'foodnova-customer-app\ios\Runner\Assets.xcassets\AppIcon.appiconset\Icon-App-20x20@1x.png')
Resize-Save $mark 40 40 (Join-Path $root 'foodnova-customer-app\ios\Runner\Assets.xcassets\AppIcon.appiconset\Icon-App-20x20@2x.png')
Resize-Save $mark 60 60 (Join-Path $root 'foodnova-customer-app\ios\Runner\Assets.xcassets\AppIcon.appiconset\Icon-App-20x20@3x.png')
Resize-Save $mark 29 29 (Join-Path $root 'foodnova-customer-app\ios\Runner\Assets.xcassets\AppIcon.appiconset\Icon-App-29x29@1x.png')
Resize-Save $mark 58 58 (Join-Path $root 'foodnova-customer-app\ios\Runner\Assets.xcassets\AppIcon.appiconset\Icon-App-29x29@2x.png')
Resize-Save $mark 87 87 (Join-Path $root 'foodnova-customer-app\ios\Runner\Assets.xcassets\AppIcon.appiconset\Icon-App-29x29@3x.png')
Resize-Save $mark 40 40 (Join-Path $root 'foodnova-customer-app\ios\Runner\Assets.xcassets\AppIcon.appiconset\Icon-App-40x40@1x.png')
Resize-Save $mark 80 80 (Join-Path $root 'foodnova-customer-app\ios\Runner\Assets.xcassets\AppIcon.appiconset\Icon-App-40x40@2x.png')
Resize-Save $mark 120 120 (Join-Path $root 'foodnova-customer-app\ios\Runner\Assets.xcassets\AppIcon.appiconset\Icon-App-40x40@3x.png')
Resize-Save $mark 120 120 (Join-Path $root 'foodnova-customer-app\ios\Runner\Assets.xcassets\AppIcon.appiconset\Icon-App-60x60@2x.png')
Resize-Save $mark 180 180 (Join-Path $root 'foodnova-customer-app\ios\Runner\Assets.xcassets\AppIcon.appiconset\Icon-App-60x60@3x.png')
Resize-Save $mark 76 76 (Join-Path $root 'foodnova-customer-app\ios\Runner\Assets.xcassets\AppIcon.appiconset\Icon-App-76x76@1x.png')
Resize-Save $mark 152 152 (Join-Path $root 'foodnova-customer-app\ios\Runner\Assets.xcassets\AppIcon.appiconset\Icon-App-76x76@2x.png')
Resize-Save $mark 167 167 (Join-Path $root 'foodnova-customer-app\ios\Runner\Assets.xcassets\AppIcon.appiconset\Icon-App-83.5x83.5@2x.png')
Resize-Save $mark 192 192 (Join-Path $root 'foodnova-customer-app\web\icons\Icon-192.png')
Resize-Save $mark 512 512 (Join-Path $root 'foodnova-customer-app\web\icons\Icon-512.png')
Resize-Save $mark 192 192 (Join-Path $root 'foodnova-customer-app\web\icons\Icon-maskable-192.png')
Resize-Save $mark 512 512 (Join-Path $root 'foodnova-customer-app\web\icons\Icon-maskable-512.png')
Resize-Save $mark 96 96 (Join-Path $root 'foodnova-customer-app\web\favicon.png')

$board.Save((Join-Path $dispatch 'branding-preview.png'), [System.Drawing.Imaging.ImageFormat]::Png)

$horizontal.Dispose()
$mark.Dispose()
$board.Dispose()

Write-Output 'Generated FoodNova assets directly from the supplied master brand board.'
