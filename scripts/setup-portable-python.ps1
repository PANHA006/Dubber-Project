<#
.SYNOPSIS
    Sets up a 100% self-contained, portable Python 3.11 runtime inside python-runtime/
    for zero-dependency standalone distribution of FREE Dubber Pro.
#>

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$RuntimeDir = Join-Path $ProjectRoot "python-runtime"
$TempDir = Join-Path $ProjectRoot "storage\temp"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  📦 SETTING UP PORTABLE PYTHON RUNTIME (STANDALONE)     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if (-not (Test-Path $TempDir)) {
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
}

$PythonExe = Join-Path $RuntimeDir "python.exe"
if (Test-Path $PythonExe) {
    Write-Host "✅ Portable Python executable already present at: $PythonExe" -ForegroundColor Green
} else {
    Write-Host "⬇️ Downloading Python 3.11.9 64-bit Embeddable Zip from python.org..." -ForegroundColor Yellow
    $ZipUrl = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip"
    $ZipPath = Join-Path $TempDir "python-3.11.9-embed-amd64.zip"

    Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath -UseBasicParsing
    Write-Host "📦 Extracting into $RuntimeDir..." -ForegroundColor Yellow
    Expand-Archive -Path $ZipPath -DestinationPath $RuntimeDir -Force
    Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
}

# Ensure import site is enabled in python311._pth
$PthFile = Join-Path $RuntimeDir "python311._pth"
if (Test-Path $PthFile) {
    Write-Host "🔧 Configuring $PthFile for site-packages support..." -ForegroundColor Yellow
    $pthContent = Get-Content $PthFile
    $newContent = $pthContent -replace '^#\s*import site', 'import site'
    if (-not ($newContent -match '^import site')) {
        $newContent += "`nimport site"
    }
    Set-Content -Path $PthFile -Value $newContent -Encoding Ascii
}

# Check if pip is installed inside python-runtime
$GetPipScript = Join-Path $TempDir "get-pip.py"
$PipExe = Join-Path $RuntimeDir "Scripts\pip.exe"
if (-not (Test-Path $PipExe)) {
    Write-Host "⬇️ Downloading get-pip.py..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $GetPipScript -UseBasicParsing

    Write-Host "⚡ Installing pip into portable runtime..." -ForegroundColor Yellow
    & "$PythonExe" "$GetPipScript" --no-warn-script-location
    Remove-Item $GetPipScript -Force -ErrorAction SilentlyContinue
}

Write-Host "📥 Installing required AI packages (edge-tts, faster-whisper, ctranslate2)..." -ForegroundColor Yellow
& "$PythonExe" -m pip install --no-warn-script-location edge-tts faster-whisper ctranslate2

Write-Host "🧪 Verifying portable Python AI imports..." -ForegroundColor Yellow
$verifyOutput = & "$PythonExe" -c "import edge_tts; print('SUCCESS: edge-tts successfully imported into portable runtime!')"
Write-Host $verifyOutput -ForegroundColor Green

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  🎉 PORTABLE PYTHON RUNTIME READY!                       " -ForegroundColor Green
Write-Host "  Location: $RuntimeDir                                   " -ForegroundColor Green
Write-Host "==========================================================`n" -ForegroundColor Green
