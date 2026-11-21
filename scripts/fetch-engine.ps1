<#
.SYNOPSIS
  Downloads the sherpa-onnx Android library and the on-device models used by
  modules/voxa-engine, and copies only what the app needs into the module.
  The files are large and are ignored by Git; run this after cloning.

.EXAMPLE
  .\scripts\fetch-engine.ps1          # download what is missing, then install
  .\scripts\fetch-engine.ps1 -Force   # download everything again

  Sources (all from https://github.com/k2-fsa/sherpa-onnx/releases):
    sherpa-onnx-2.0.1.aar                                           Apache-2.0
    sherpa-onnx-streaming-zipformer-en-20M-2023-02-17-mobile.tar.bz2  Apache-2.0
    kitten-nano-en-v0_8-int8.tar.bz2                                Apache-2.0
    lexicon-en-us.txt   English pronunciations for Kitten (built from CMUdict)
    silero_vad_v5.onnx                                              MIT
    sherpa-onnx-pyannote-segmentation-3-0.tar.bz2  (speaker turns)  MIT
    3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx (who speaks)  Apache-2.0
    0-four-speakers-zh.wav   test clip with four speakers, for the speaker-label benchmark
    vits-piper-en_US-amy-low-int8.tar.bz2   Piper voice, benchmark only. Model MIT; the
                                            Amy recordings' licence is unclear, do not ship it.
    sherpa-onnx-online-punct-en-2024-08-06.tar.bz2   punctuation and capitals for transcripts
                                            (Edge-Punct-Casing; licence to be checked)

  sherpa-onnx 2.x no longer uses espeak-ng (GPL-3.0). Kitten reads words through
  lexicon-en-us.txt instead; the espeak-ng-data folder in the Kitten package is
  not copied into the app. Words missing from the lexicon are not spoken yet.
#>
param(
  [string]$SherpaVersion = '2.0.1',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$cache = Join-Path $root '.engine-cache'
$module = Join-Path $root 'modules\voxa-engine\android'
$abis = @('arm64-v8a', 'armeabi-v7a')   # phones only, no x86/x86_64 emulator code
$base = 'https://github.com/k2-fsa/sherpa-onnx/releases/download'

$files = @(
  @{ Key = 'aar';  Url = "$base/v$SherpaVersion/sherpa-onnx-$SherpaVersion.aar";                                      Name = "sherpa-onnx-$SherpaVersion.aar" },
  @{ Key = 'asr';  Url = "$base/asr-models/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17-mobile.tar.bz2";          Name = 'sherpa-onnx-streaming-zipformer-en-20M-2023-02-17-mobile.tar.bz2' },
  @{ Key = 'tts';  Url = "$base/tts-models/kitten-nano-en-v0_8-int8.tar.bz2";                                         Name = 'kitten-nano-en-v0_8-int8.tar.bz2' },
  @{ Key = 'lex';  Url = "$base/tts-models/lexicon-en-us.txt";                                                  Name = 'lexicon-en-us.txt' },
  @{ Key = 'vad';  Url = "$base/asr-models/silero_vad_v5.onnx";                                                       Name = 'silero_vad_v5.onnx' },
  @{ Key = 'seg';  Url = "$base/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2";          Name = 'sherpa-onnx-pyannote-segmentation-3-0.tar.bz2' },
  # The release tag really is spelled "recongition".
  @{ Key = 'emb';  Url = "$base/speaker-recongition-models/3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx";      Name = '3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx' },
  @{ Key = 'diarwav'; Url = "$base/speaker-segmentation-models/0-four-speakers-zh.wav";                               Name = '0-four-speakers-zh.wav' },
  @{ Key = 'piper'; Url = "$base/tts-models/vits-piper-en_US-amy-low-int8.tar.bz2";                              Name = 'vits-piper-en_US-amy-low-int8.tar.bz2' },
  @{ Key = 'punct'; Url = "$base/punctuation-models/sherpa-onnx-online-punct-en-2024-08-06.tar.bz2";                Name = 'sherpa-onnx-online-punct-en-2024-08-06.tar.bz2' }
)

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Fresh($dir) { if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }; New-Item -ItemType Directory -Force $dir | Out-Null; $dir }

# --- Download: each file into its own folder -----------------------------------------
foreach ($f in $files) {
  $dir = Join-Path $cache "downloads\$($f.Key)"
  $out = Join-Path $dir $f.Name
  if ((Test-Path $out) -and -not $Force) { Write-Host "have $($f.Name)"; continue }
  Step "Downloading $($f.Name)"
  Fresh $dir | Out-Null
  & curl.exe -L --fail --retry 3 -o $out $f.Url
  if ($LASTEXITCODE) { throw "Download failed: $($f.Url)" }
  Write-Host ("  {0:N1} MB" -f ((Get-Item $out).Length / 1MB))
}

$tar = "$env:SystemRoot\System32\tar.exe"
function Unpack($key, $name) {
  $dst = Fresh (Join-Path $cache "extract\$key")
  & $tar -xf (Join-Path $cache "downloads\$key\$name") -C $dst
  if ($LASTEXITCODE) { throw "Could not unpack $name" }
  $dst
}

# --- Library: Kotlin classes + native libraries for phone ABIs ---------------------------
Step 'Installing the sherpa-onnx library'
$aar = Unpack 'aar' "sherpa-onnx-$SherpaVersion.aar"
$libs = Fresh (Join-Path $module 'libs')
Copy-Item (Join-Path $aar 'classes.jar') (Join-Path $libs 'sherpa-onnx-classes.jar')
foreach ($abi in $abis) {
  $src = Join-Path $aar "jni\$abi"
  if (-not (Test-Path $src)) { throw "The AAR has no $abi libraries" }
  $dst = Fresh (Join-Path $module "src\main\jniLibs\$abi")
  # The Kotlin API only loads the JNI library, which needs only onnxruntime.
  Copy-Item "$src\libsherpa-onnx-jni.so", "$src\libonnxruntime.so" $dst
  Get-ChildItem $dst | ForEach-Object { Write-Host ("  {0}/{1}  {2:N1} MB" -f $abi, $_.Name, ($_.Length / 1MB)) }
}

# --- Models --------------------------------------------------------------------------
$assets = Join-Path $module 'src\main\assets\voxa-models'
New-Item -ItemType Directory -Force $assets | Out-Null

Step 'Installing the streaming speech model (int8 only)'
$asr = Get-ChildItem (Unpack 'asr' $files[1].Name) -Directory | Select-Object -First 1
$asrDst = Fresh (Join-Path $assets 'asr')
function PickOnnx($dir, $part) {
  $all = Get-ChildItem $dir.FullName -Filter "*$part*.onnx"
  $int8 = $all | Where-Object Name -like '*int8*' | Select-Object -First 1
  if ($int8) { $int8 } else { $all | Select-Object -First 1 }
}
foreach ($part in 'encoder', 'decoder', 'joiner') {
  $file = PickOnnx $asr $part
  if (-not $file) { throw "No $part model in $($asr.Name)" }
  Copy-Item $file.FullName (Join-Path $asrDst "$part.onnx")
}
Copy-Item (Join-Path $asr.FullName 'tokens.txt') $asrDst
$wav = Get-ChildItem (Join-Path $asr.FullName 'test_wavs') -Filter '*.wav' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($wav) { Copy-Item $wav.FullName (Join-Path $asrDst 'benchmark.wav') }

Step 'Installing the Kitten voice'
$tts = Get-ChildItem (Unpack 'tts' $files[2].Name) -Directory | Select-Object -First 1
$ttsDst = Fresh (Join-Path $assets 'tts')
$model = Get-ChildItem $tts.FullName -Filter '*.onnx' | Select-Object -First 1
Copy-Item $model.FullName (Join-Path $ttsDst 'model.onnx')
Copy-Item (Join-Path $tts.FullName 'voices.bin') $ttsDst
Copy-Item (Join-Path $tts.FullName 'tokens.txt') $ttsDst
Copy-Item (Join-Path $cache 'downloads\lex\lexicon-en-us.txt') (Join-Path $ttsDst 'lexicon.txt')

Step 'Installing the voice activity detector'
$vadDst = Fresh (Join-Path $assets 'vad')
Copy-Item (Join-Path $cache "downloads\vad\silero_vad_v5.onnx") (Join-Path $vadDst 'silero_vad.onnx')

Step 'Installing the speaker-label models'
$seg = Get-ChildItem (Unpack 'seg' 'sherpa-onnx-pyannote-segmentation-3-0.tar.bz2') -Directory | Select-Object -First 1
$diarDst = Fresh (Join-Path $assets 'diar')
$segModel = Get-ChildItem $seg.FullName -Filter '*int8*.onnx' | Select-Object -First 1
if (-not $segModel) { $segModel = Get-ChildItem $seg.FullName -Filter 'model.onnx' | Select-Object -First 1 }
Copy-Item $segModel.FullName (Join-Path $diarDst 'segmentation.onnx')
Copy-Item (Join-Path $cache 'downloads\emb\3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx') (Join-Path $diarDst 'embedding.onnx')
Copy-Item (Join-Path $cache 'downloads\diarwav\0-four-speakers-zh.wav') (Join-Path $diarDst 'benchmark.wav')

Step 'Installing the Piper voice (benchmark only, no espeak-ng-data)'
$piper = Get-ChildItem (Unpack 'piper' 'vits-piper-en_US-amy-low-int8.tar.bz2') -Directory | Select-Object -First 1
$piperDst = Fresh (Join-Path $assets 'piper')
$piperModel = Get-ChildItem $piper.FullName -Filter '*.onnx' | Select-Object -First 1
Copy-Item $piperModel.FullName (Join-Path $piperDst 'model.onnx')
Copy-Item (Join-Path $piper.FullName 'tokens.txt') $piperDst

Step 'Installing the punctuation model (int8 only)'
$punct = Get-ChildItem (Unpack 'punct' 'sherpa-onnx-online-punct-en-2024-08-06.tar.bz2') -Directory | Select-Object -First 1
$punctDst = Fresh (Join-Path $assets 'punct')
Copy-Item (Join-Path $punct.FullName 'model.int8.onnx') (Join-Path $punctDst 'model.onnx')
Copy-Item (Join-Path $punct.FullName 'bpe.vocab') $punctDst

Step 'Done'
Get-ChildItem $assets -Directory | ForEach-Object {
  $mb = (Get-ChildItem $_.FullName -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
  Write-Host ("  models/{0}  {1:N1} MB" -f $_.Name, $mb)
}
