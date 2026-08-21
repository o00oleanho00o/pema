param(
  [string]$OutputRoot = (Join-Path $PSScriptRoot "..\release")
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifest = Get-Content -Raw (Join-Path $projectRoot "manifest.json") | ConvertFrom-Json
$version = $manifest.version
$packageName = "pema-extension-$version"
$packagePath = Join-Path $OutputRoot $packageName
$zipPath = Join-Path $OutputRoot "$packageName.zip"

$runtimeFiles = @(
  "manifest.json",
  "popup.html",
  "popup.js",
  "styles.css",
  "options.html",
  "options.js",
  "options.css",
  "preview.html",
  "preview.js",
  "preview.css",
  "catalog.js",
  "content.js",
  "default-catalog.json",
  "xlsx-importer.js",
  "jszip.min.js",
  "print-template.js"
)

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
if (Test-Path -LiteralPath $packagePath) {
  Remove-Item -LiteralPath $packagePath -Recurse -Force
}
if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

New-Item -ItemType Directory -Force -Path $packagePath | Out-Null
foreach ($relativePath in $runtimeFiles) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $relativePath) -Destination (Join-Path $packagePath $relativePath)
}
Copy-Item -LiteralPath (Join-Path $projectRoot "assets") -Destination $packagePath -Recurse

$installGuide = @"
PEMA - Tach don thuoc v$version

CAI DAT TREN CHROME / EDGE
1. Giai nen file ZIP nay ra mot thu muc co dinh.
2. Mo chrome://extensions (Chrome) hoac edge://extensions (Edge).
3. Bat Che do danh cho nha phat trien / Developer mode.
4. Chon Tai tien ich da giai nen / Load unpacked.
5. Chon dung thu muc $packageName (noi co file manifest.json).
6. Ghim icon PEMA tren thanh cong cu de su dung nhanh.

Luu y: Khong xoa hoac di chuyen thu muc sau khi cai. Khi co ban moi, giai nen
ban moi, chon Tai lai / Reload trong trang extensions, hoac cai lai tu thu muc moi.
"@
Set-Content -LiteralPath (Join-Path $packagePath "CAI-DAT.txt") -Value $installGuide -Encoding UTF8

Compress-Archive -LiteralPath $packagePath -DestinationPath $zipPath -CompressionLevel Optimal

Write-Output "Release folder: $packagePath"
Write-Output "Release ZIP:    $zipPath"
