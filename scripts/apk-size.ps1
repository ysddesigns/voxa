<#
.SYNOPSIS
  Estimates what one phone downloads from Google Play for an APK: only one ABI's
  native libraries, with every file compressed (Play compresses the download even
  where the APK stores files uncompressed). Checks it against the 60 MB gate.

.EXAMPLE
  .\scripts\apk-size.ps1                                   # the release APK, arm64-v8a
  .\scripts\apk-size.ps1 -Apk path\to.apk -Abi armeabi-v7a
#>
param(
  [string]$Apk = "android\app\build\outputs\apk\release\app-release.apk",
  [string]$Abi = 'arm64-v8a',
  [double]$GateMb = 60
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not [System.IO.Path]::IsPathRooted($Apk)) { $Apk = Join-Path $root $Apk }
if (-not (Test-Path $Apk)) { Write-Host "No APK at $Apk" -ForegroundColor Red; exit 1 }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-DeflatedSize($entry) {
  $in = $entry.Open()
  $mem = New-Object System.IO.MemoryStream
  $deflate = New-Object System.IO.Compression.DeflateStream($mem, [System.IO.Compression.CompressionLevel]::Optimal, $true)
  try { $in.CopyTo($deflate) } finally { $in.Dispose(); $deflate.Dispose() }
  $size = $mem.Length
  $mem.Dispose()
  $size
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($Apk)
$total = 0
$groups = @{}
try {
  foreach ($e in $zip.Entries) {
    $name = $e.FullName
    if ($name -like 'lib/*' -and $name -notlike "lib/$Abi/*") { continue }
    # Stored (uncompressed) entries, such as native libraries and models: measure them compressed.
    $size = if ($e.CompressedLength -ge $e.Length -and $e.Length -gt 0) { Get-DeflatedSize $e } else { $e.CompressedLength }
    $total += $size
    $group = if ($name -like 'lib/*') { 'native libraries' }
             elseif ($name -like 'assets/voxa-models/*') { 'models/' + $name.Split('/')[2] }
             elseif ($name -like '*.dex') { 'code (dex)' }
             elseif ($name -eq 'assets/index.android.bundle') { 'JavaScript bundle' }
             else { 'other' }
    $groups[$group] = $groups[$group] + $size
  }
} finally { $zip.Dispose() }

$apkMb = (Get-Item $Apk).Length / 1MB
Write-Host ("APK file: {0:N1} MB (all ABIs, libraries stored uncompressed)" -f $apkMb)
Write-Host ("Estimated download for one {0} phone:" -f $Abi)
$groups.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object {
  Write-Host ("  {0,7:N1} MB  {1}" -f ($_.Value / 1MB), $_.Key)
}
$mb = $total / 1MB
$colour = if ($mb -le $GateMb) { 'Green' } else { 'Red' }
$verdict = if ($mb -le $GateMb) { 'passes' } else { 'FAILS' }
Write-Host ("  {0,7:N1} MB  total, {1} the {2} MB gate" -f $mb, $verdict, $GateMb) -ForegroundColor $colour
if ($mb -gt $GateMb) { exit 2 }
