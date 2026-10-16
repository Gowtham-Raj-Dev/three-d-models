<#
  Builds the Patti Veedu Android app on Windows (the same steps as build.sh / android/build.sh, which need Linux):
  copies game/ into android/assets/game, then aapt -> javac -> d8 -> zipalign -> apksigner, signed with android/kolusu.keystore.
  The first run downloads what it needs into %LOCALAPPDATA%\kolusu-android-tools (about 450 MB: Temurin JDK 17, the Android
  command-line tools, build-tools 34 and platform 34 - installing the SDK parts means accepting Google's Android SDK licence).

    powershell -ExecutionPolicy Bypass -File build-android.ps1 -VersionCode 15 -VersionName 10.5
    ... -Publish ..\..\games.codelove.in      also copies the APK + its info JSON into that site's public\downloads\patti-veedu.*

  Each release needs a HIGHER versionCode than the last (10.4 was 14). KEEP android\kolusu.keystore: updates must be signed with it.
#>
param(
  [Parameter(Mandatory = $true)][int]$VersionCode,
  [Parameter(Mandatory = $true)][string]$VersionName,
  [string]$Publish = ""
)
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
if ($Publish) { $Publish = (Resolve-Path $Publish).Path }
$T = Join-Path $env:LOCALAPPDATA 'kolusu-android-tools'
New-Item -ItemType Directory -Force $T | Out-Null
function Fetch($url, $dest) { if (-not (Test-Path $dest)) { Write-Host "downloading $url"; & curl.exe -L --fail -sS -o $dest $url; if ($LASTEXITCODE) { Remove-Item $dest -ErrorAction SilentlyContinue; throw "download failed: $url" } } }
function Run { param([string]$exe) & $exe @args; if ($LASTEXITCODE) { throw "$exe failed ($LASTEXITCODE)" } }

# --- JDK 17
$jdk = Get-ChildItem $T -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $jdk) {
  Fetch 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse' "$T\jdk.zip"
  Expand-Archive "$T\jdk.zip" $T -Force; Remove-Item "$T\jdk.zip"
  $jdk = Get-ChildItem $T -Directory -Filter 'jdk-17*' | Select-Object -First 1
}
$env:JAVA_HOME = $jdk.FullName; $env:PATH = "$($jdk.FullName)\bin;$env:PATH"

# --- Android SDK pieces
$SDK = "$T\sdk"; $BT = "$SDK\build-tools\34.0.0"; $JAR = "$SDK\platforms\android-34\android.jar"
if (-not ((Test-Path "$BT\aapt.exe") -and (Test-Path $JAR))) {
  if (-not (Test-Path "$SDK\cmdline-tools\latest\bin\sdkmanager.bat")) {
    Fetch 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' "$T\cmdtools.zip"
    Expand-Archive "$T\cmdtools.zip" "$T\cmdtools-tmp" -Force
    New-Item -ItemType Directory -Force "$SDK\cmdline-tools" | Out-Null
    Move-Item "$T\cmdtools-tmp\cmdline-tools" "$SDK\cmdline-tools\latest" -Force
    Remove-Item "$T\cmdtools-tmp", "$T\cmdtools.zip" -Recurse -Force
  }
  $sm = "$SDK\cmdline-tools\latest\bin\sdkmanager.bat"
  (1..30 | ForEach-Object { 'y' }) | & $sm --sdk_root=$SDK --licenses | Out-Null
  (1..30 | ForEach-Object { 'y' }) | & $sm --sdk_root=$SDK 'build-tools;34.0.0' 'platforms;android-34'
  if ($LASTEXITCODE) { throw 'sdkmanager failed' }
}

# --- version + the game
Set-Location "$Root\android"
$mf = Get-Content AndroidManifest.xml -Raw
$mf = $mf -replace 'android:versionCode="\d+"', "android:versionCode=`"$VersionCode`"" -replace 'android:versionName="[0-9.]+"', "android:versionName=`"$VersionName`""
[IO.File]::WriteAllText("$Root\android\AndroidManifest.xml", $mf, (New-Object Text.UTF8Encoding $false))
Remove-Item assets\game -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force assets\game\js, assets\game\fonts | Out-Null
Copy-Item "$Root\game\index.html", "$Root\game\three.min.js", "$Root\game\THIRD_PARTY.txt" assets\game\
Copy-Item "$Root\game\fonts\*" assets\game\fonts\
Copy-Item "$Root\game\js\*.js" assets\game\js\

# --- build
Remove-Item build -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force build\gen, build\obj, build\dex | Out-Null
Run "$BT\aapt.exe" package -f -m -J build\gen -M AndroidManifest.xml -S res -I $JAR --min-sdk-version 24 --target-sdk-version 34
$src = Get-ChildItem src, build\gen -Recurse -Filter *.java | ForEach-Object FullName
Run javac -nowarn '-Xlint:-options' -source 8 -target 8 -bootclasspath $JAR -classpath $JAR -d build\obj @src
$classes = Get-ChildItem build\obj -Recurse -Filter *.class | ForEach-Object FullName
Run "$BT\d8.bat" --lib $JAR --min-api 24 --output build\dex @classes
Run "$BT\aapt.exe" package -f -M AndroidManifest.xml -S res -A assets -I $JAR --min-sdk-version 24 --target-sdk-version 34 -0 neu -F build\unsigned.apk
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open("$Root\android\build\unsigned.apk", 'Update')
[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$Root\android\build\dex\classes.dex", 'classes.dex', 'Optimal')
$zip.Dispose()
Run "$BT\zipalign.exe" -p -f 4 build\unsigned.apk build\aligned.apk
if (-not (Test-Path kolusu.keystore)) { throw 'android\kolusu.keystore is missing: do NOT make a new one, installed apps could not update' }
Run "$BT\apksigner.bat" sign --ks kolusu.keystore --ks-pass pass:kolusu123 --key-pass pass:kolusu123 --ks-key-alias kolusu --min-sdk-version 24 --out Kolusu.apk build\aligned.apk
Run "$BT\apksigner.bat" verify --print-certs Kolusu.apk
New-Item -ItemType Directory -Force "$Root\out" | Out-Null
Copy-Item Kolusu.apk "$Root\out\PattiVeedu.apk" -Force
$apk = Get-Item "$Root\out\PattiVeedu.apk"
$sha = (Get-FileHash $apk.FullName -Algorithm SHA256).Hash.ToLower()
Write-Host ("APK: {0} ({1:N1} MB) v{2} ({3}) sha256 {4}" -f $apk.FullName, ($apk.Length / 1MB), $VersionName, $VersionCode, $sha)

if ($Publish) {
  $dl = Join-Path (Resolve-Path $Publish) 'public\downloads'
  New-Item -ItemType Directory -Force $dl | Out-Null
  Copy-Item $apk.FullName "$dl\patti-veedu.apk" -Force
  $json = [ordered]@{ version = $VersionName; versionCode = $VersionCode; bytes = $apk.Length; sha256 = $sha; minAndroid = '7.0'; built = (Get-Date -Format 'yyyy-MM-dd') } | ConvertTo-Json
  [IO.File]::WriteAllText("$dl\patti-veedu.json", $json + "`n", (New-Object Text.UTF8Encoding $false))
  Write-Host "published to $dl"
}
