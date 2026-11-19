[CmdletBinding()]
param(
    [switch]$NoTunnel,
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Devtools = Join-Path $Root ".devtools"
$Bin = Join-Path $Devtools "bin"
$UvCache = Join-Path $Devtools "uv-cache"
$Backend = Join-Path $Root "backend"
$Web = Join-Path $Root "web"
$NgrokLog = Join-Path $Devtools "logs\ngrok.log"

New-Item -ItemType Directory -Force -Path $Bin, (Join-Path $Devtools "logs") | Out-Null

function Refresh-Path {
    $candidates = [System.Collections.Generic.List[string]]@(
        $Bin,
        (Join-Path $Devtools "node"),
        (Join-Path $env:USERPROFILE ".local\bin"),
        (Join-Path $env:USERPROFILE ".cargo\bin")
    )

    # Include all versioned Python user Scripts dirs (e.g. Python314\Scripts, Python312\Scripts)
    $pyBase = Join-Path $env:APPDATA "Python"
    if (Test-Path $pyBase) {
        Get-ChildItem -Path $pyBase -Directory -Filter "Python*" -ErrorAction SilentlyContinue | ForEach-Object {
            $scriptsDir = Join-Path $_.FullName "Scripts"
            if (Test-Path $scriptsDir) { $candidates.Add($scriptsDir) }
        }
    }

    foreach ($path in $candidates) {
        if ((Test-Path $path) -and (($env:Path -split ';') -notcontains $path)) {
            $env:Path = "$path;$env:Path"
        }
    }
}

function Find-Command([string]$Name) {
    Refresh-Path
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    return $null
}

function Require-Command([string]$Name, [string]$InstallHint) {
    $path = Find-Command $Name
    if (-not $path) {
        throw "$Name is required but was not found. $InstallHint"
    }
    return $path
}

function Ensure-Uv {
    if (Find-Command "uv") { return }

    Write-Host "Installing uv..." -ForegroundColor Cyan
    if (Find-Command "python") {
        & python -m pip install --user uv
        Refresh-Path   # re-scan Python user Scripts paths after pip install
    }

    # If uv is still missing (pip path not picked up, or python absent), use the official installer
    if (-not (Find-Command "uv")) {
        $installer = Join-Path $env:TEMP "install-uv.ps1"
        Invoke-WebRequest "https://astral.sh/uv/install.ps1" -OutFile $installer
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer
        Remove-Item $installer -Force -ErrorAction SilentlyContinue
        Refresh-Path
    }

    Require-Command "uv" "Install it from https://docs.astral.sh/uv/" | Out-Null
}

function Ensure-Node {
    if (Find-Command "node") { return }

    Write-Host "Installing a portable Node.js LTS runtime..." -ForegroundColor Cyan
    $nodeRoot = Join-Path $Devtools "node"
    $index = Invoke-RestMethod "https://nodejs.org/dist/index.json"
    $release = $index | Where-Object { $_.lts -and ($_.files -contains "win-x64-zip") } | Select-Object -First 1
    if (-not $release) { throw "Could not find a Node.js LTS Windows x64 download." }

    $version = $release.version
    $archive = Join-Path $env:TEMP "node-$version-win-x64.zip"
    $url = "https://nodejs.org/dist/$version/node-$version-win-x64.zip"
    Invoke-WebRequest $url -OutFile $archive
    $extract = Join-Path $env:TEMP "auralis-node-extract"
    Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
    Expand-Archive $archive -DestinationPath $extract -Force
    Remove-Item $nodeRoot -Recurse -Force -ErrorAction SilentlyContinue
    Move-Item (Join-Path $extract "node-$version-win-x64") $nodeRoot
    Remove-Item $archive, $extract -Recurse -Force -ErrorAction SilentlyContinue
    Refresh-Path
    Require-Command "node" "Install Node.js 20.9+ from https://nodejs.org/" | Out-Null
}

function Ensure-Ngrok {
    $existing = Find-Command "ngrok"
    if ($existing) { return $existing }

    Write-Host "Downloading ngrok..." -ForegroundColor Cyan
    $archive = Join-Path $env:TEMP "ngrok-windows-amd64.zip"
    $url = "https://bin.ngrok.com/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip"
    Invoke-WebRequest $url -OutFile $archive
    Expand-Archive $archive -DestinationPath $Bin -Force
    Remove-Item $archive -Force -ErrorAction SilentlyContinue
    Refresh-Path
    return (Require-Command "ngrok" "Install it from https://ngrok.com/download/windows")
}

function Invoke-ProjectPython([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments) {
    & uv run --project $Backend --no-sync python @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Project Python command failed with exit code $LASTEXITCODE." }
}

function Ensure-Environment {
    $envFile = Join-Path $Root ".env"
    if (-not (Test-Path $envFile)) {
        Copy-Item (Join-Path $Root ".env.example") $envFile
        Write-Host "Created .env from .env.example"
    }

    Ensure-Uv
    Ensure-Node
    New-Item -ItemType Directory -Force -Path $UvCache | Out-Null
    $env:UV_CACHE_DIR = $UvCache
    $env:AURALIS_WORKER_CONCURRENCY = "9"
    $env:AURALIS_API_URL = "http://127.0.0.1:8000"

    Write-Host "Checking Python 3.13..." -ForegroundColor Cyan
    & uv python install 3.13
    if ($LASTEXITCODE -ne 0) { throw "Python 3.13 installation failed." }

    Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
    & uv sync --project $Backend
    if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed." }

    Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
    if (Test-Path (Join-Path $Web "node_modules\next\package.json")) {
        Write-Host "Frontend dependencies already installed; skipping npm install."
    } else {
        Push-Location $Web
        try {
            & npm.cmd install --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed." }
        } finally {
            Pop-Location
        }
    }
}

function Ensure-Database {
    $pgctl = Join-Path $Devtools "pg\Library\bin\pg_ctl.exe"
    if (Test-Path $pgctl) {
        Write-Host "Starting/checking the local PostgreSQL database..." -ForegroundColor Cyan
        Invoke-ProjectPython (Join-Path $Root "scripts\devdb.py") "init"
        return
    }

    $docker = Find-Command "docker"
    if ($docker) {
        Write-Host "Starting PostgreSQL with Docker..." -ForegroundColor Cyan
        Push-Location $Root
        try { & docker compose up -d db } finally { Pop-Location }
        if ($LASTEXITCODE -ne 0) { throw "Docker PostgreSQL startup failed." }
        $env:AURALIS_SKIP_DEVDATABASE = "1"
        return
    }

    throw "PostgreSQL is not available. Install Docker Desktop or PostgreSQL 16+ and run this launcher again."
}

function Start-Tunnel([string]$Ngrok) {
    $ngrokConfig = Join-Path $Devtools "ngrok.yml"
    $token = Read-Host "Enter your ngrok authtoken (press Enter if already configured)"
    if ($token) {
        & $Ngrok config add-authtoken $token --config $ngrokConfig
        if ($LASTEXITCODE -ne 0) { throw "ngrok authtoken configuration failed." }
    }

    $out = Join-Path $Devtools "logs\ngrok.stdout.log"
    $err = Join-Path $Devtools "logs\ngrok.stderr.log"
    $process = Start-Process -FilePath $Ngrok -ArgumentList @("--config", $ngrokConfig, "http", "3000", "--log=stdout") `
        -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden -PassThru
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 1
        try {
            $tunnels = Invoke-RestMethod "http://127.0.0.1:4040/api/tunnels"
            $public = $tunnels.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1
            if ($public) { return @{ Process = $process; Url = $public.public_url } }
        } catch { }
        if ($process.HasExited) { break }
    }

    $details = if (Test-Path $err) { Get-Content $err -Tail 10 -ErrorAction SilentlyContinue } else { "" }
    throw "ngrok did not start. Configure a valid token at https://dashboard.ngrok.com/get-started/your-authtoken. $details"
}

try {
    Ensure-Environment
    Ensure-Database

    if ($CheckOnly) {
        Write-Host "Prerequisite check completed successfully." -ForegroundColor Green
        exit 0
    }

    Write-Host "Starting Auralis with 9 workers..." -ForegroundColor Cyan
    Invoke-ProjectPython (Join-Path $Root "scripts\dev.py") "up"

    $tunnel = $null
    if (-not $NoTunnel) {
        $ngrok = Ensure-Ngrok
        $tunnel = Start-Tunnel $ngrok
    }

    Write-Host ""
    Write-Host "Auralis is running." -ForegroundColor Green
    Write-Host "Local:  http://localhost:3000"
    Start-Process "http://localhost:3000"
    if ($tunnel) { Write-Host "Public: $($tunnel.Url)" -ForegroundColor Green }
    Write-Host "API:    http://localhost:8000/api/docs"
    Read-Host "Press Enter to stop Auralis"

    if ($tunnel -and $tunnel.Process -and -not $tunnel.Process.HasExited) {
        Stop-Process -Id $tunnel.Process.Id -Force -ErrorAction SilentlyContinue
    }
    Invoke-ProjectPython (Join-Path $Root "scripts\dev.py") "down"
} catch {
    Write-Error $_
    exit 1
}
