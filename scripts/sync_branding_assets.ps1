# The web public asset is the authoritative, unmodified approved artwork.
$ErrorActionPreference = 'Stop'
$brandRepo = Split-Path -Parent $PSScriptRoot
$brandSource = Join-Path $brandRepo 'frontend/public/branding/foodnova-logo.png'
$brandTargets = @(
    'foodnova-customer-app/assets/brand/foodnova-logo.png',
    'foodnova-dispatch-app/assets/images/foodnova-dispatch-logo.png'
)
foreach ($brandTarget in $brandTargets) {
    Copy-Item -LiteralPath $brandSource -Destination (Join-Path $brandRepo $brandTarget)
}
Write-Output 'Synchronized original logo bytes. No mobile build or packaging was performed.'
