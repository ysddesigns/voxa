<#
.SYNOPSIS
  Builds the Voxa Android app on Windows (see docs/build-guide.md).

.EXAMPLE
  .\scripts\build-android.ps1                     # debug APK for real phones (arm64-v8a, armeabi-v7a)
  .\scripts\build-android.ps1 -Install            # build, then install on the USB-connected phone
  .\scripts\build-android.ps1 -Release            # release APK (JS bundled in, no dev server needed), then its per-phone size
  .\scripts\build-android.ps1 -WithEmulator       # also include x86_64 for the Android emulator
  .\scripts\build-android.ps1 -Prebuild           # regenerate android/ first (after app.json or icon changes)
#>
param(
  [switch]$WithEmulator,
  [switch]$PhoneOnly,  # kept for old commands; phone-only is now the default
  [switch]$Release,
  [switch]$Install,
  [switch]$Prebuild,
  [switch]$Clean,
  [switch]$AllowLabModels,  # release only: allow the models fetch-engine.ps1 -BundleAll adds
  [string]$Sdk = "$env:LOCALAPPDATA\Android\Sdk",
  [string]$Jdk = "C:\Program Files\Java\jdk-25",
  [string]$CMakeVersion = ""
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }
function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# --- Checks -------------------------------------------------------------------
Step "Checking tools"
if (-not (Test-Path "$Sdk\platform-tools\adb.exe")) { Fail "Android SDK not found at $Sdk. Pass -Sdk <path>." }
if (-not (Test-Path "$Jdk\bin\java.exe")) { Fail "JDK not found at $Jdk. Pass -Jdk <path>." }
if (-not $CMakeVersion) {
  # Pick the newest CMake 3.31+ / 4.x in the SDK. 3.22.1's ninja cannot handle long Windows paths.
  $CMakeVersion = Get-ChildItem "$Sdk\cmake" -Directory -ErrorAction SilentlyContinue |
    Where-Object { [version]$_.Name -ge [version]'3.31.0' } |
    Sort-Object { [version]$_.Name } -Descending |
    Select-Object -First 1 -ExpandProperty Name
  if (-not $CMakeVersion) { Fail "No CMake 3.31+ in $Sdk\cmake. Install it: Android Studio > SDK Manager > SDK Tools > CMake (Show Package Details)." }
}
Write-Host "SDK:   $Sdk"
Write-Host "JDK:   $Jdk"
Write-Host "CMake: $CMakeVersion"

# A release must not carry the lab models: listening, speaker labels and Kitten are packs.
# They are bundled only after fetch-engine.ps1 -BundleAll, which is for lab builds.
if ($Release -and -not $AllowLabModels) {
  $labModels = @('asr', 'tts', 'vad', 'diar') |
    Where-Object { Test-Path "modules\voxa-engine\android\src\main\assets\voxa-models\$_" }
  if ($labModels) {
    Fail ("The app would bundle lab models ($($labModels -join ', ')) and miss the 60 MB gate. " +
      "Run .\scripts\fetch-engine.ps1 (slim, no -BundleAll) first, or pass -AllowLabModels for a lab release.")
  }
}

if (-not (Test-Path "node_modules")) { Step "Installing packages (npm ci)"; npm ci; if ($LASTEXITCODE) { Fail "npm ci failed" } }

# --- Native project ---------------------------------------------------------------
if ($Prebuild -or -not (Test-Path "android")) {
  Step "Generating the native Android project (expo prebuild)"
  $env:CI = "1"
  npx expo prebuild --platform android --no-install
  if ($LASTEXITCODE) { Fail "expo prebuild failed" }
  Remove-Item Env:CI
}

# expo prebuild deletes local.properties, so write it every time.
$sdkFwd = ($Sdk -replace '\\', '/') -replace '^([A-Za-z]):', '$1\:'
@(
  "sdk.dir=$sdkFwd",
  "cmake.dir=$sdkFwd/cmake/$CMakeVersion"
) | Set-Content -Encoding ascii "android\local.properties"

# --- Build ---------------------------------------------------------------------
$env:JAVA_HOME = $Jdk
$env:ANDROID_HOME = $Sdk
$variant = if ($Release) { 'Release' } else { 'Debug' }
$archs = if ($WithEmulator) { 'arm64-v8a,armeabi-v7a,x86_64' } else { 'arm64-v8a,armeabi-v7a' }

$gradleArgs = @()
if ($Clean) { $gradleArgs += 'clean' }
$gradleArgs += "assemble$variant", "-PreactNativeArchitectures=$archs", "-Dorg.gradle.java.home=$Jdk", '--console=plain'

Step "Building $variant APK for $archs"
Push-Location android
try {
  & .\gradlew.bat @gradleArgs
  if ($LASTEXITCODE) { Fail "Gradle build failed. See the output above and docs/build-guide.md > Troubleshooting." }
} finally { Pop-Location }

$apk = "android\app\build\outputs\apk\$($variant.ToLower())\app-$($variant.ToLower()).apk"
if (-not (Test-Path $apk)) { Fail "Build finished but $apk is missing." }
$mb = [math]::Round((Get-Item $apk).Length / 1MB, 1)
Write-Host "`nAPK: $apk ($mb MB)" -ForegroundColor Green
if ($Release) {
  Step "Per-phone download size (60 MB gate)"
  & "$PSScriptRoot\apk-size.ps1" -Apk $apk
}

# --- Install ---------------------------------------------------------------------
if ($Install) {
  Step "Installing on the connected phone"
  $adb = "$Sdk\platform-tools\adb.exe"
  $devices = & $adb devices | Select-String "`tdevice$"
  if (-not $devices) { Fail "No phone found. Connect it by USB with USB debugging on, and accept the prompt on the phone." }
  & $adb install -r $apk
  if ($LASTEXITCODE) { Fail "adb install failed" }
  if (-not $Release) {
    & $adb reverse tcp:8081 tcp:8081 | Out-Null
    Write-Host "Installed. Now run 'npm start' and open Voxa on the phone." -ForegroundColor Green
  } else {
    Write-Host "Installed. The release build runs without the dev server." -ForegroundColor Green
  }
}
