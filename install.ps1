<#
.SYNOPSIS
    Installs the Sticky Notes AI application's Python dependencies.

.DESCRIPTION
    Creates a local virtual environment, upgrades pip inside it, installs the
    requirements, and installs Ollama on Windows when it is not already found.

    Use -PullOllamaModel if you want this script to download the configured
    model after Ollama is installed.
#>

[CmdletBinding()]
param(
    [string]$OllamaModel = "llama3.2",
    [switch]$PullOllamaModel,
    [Alias("SkipOllamaCheck")]
    [switch]$SkipOllamaInstall
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Stop-Install {
    param([string]$Message)
    Write-Error $Message
    exit 1
}

function Find-OllamaExecutable {
    $ollamaCommand = Get-Command ollama -ErrorAction SilentlyContinue
    if ($ollamaCommand) {
        return $ollamaCommand.Source
    }

    $ollamaCandidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"),
        (Join-Path $env:ProgramFiles "Ollama\ollama.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Ollama\ollama.exe")
    )
    foreach ($candidate in $ollamaCandidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return $candidate
        }
    }
    return $null
}

function Install-Ollama {
    Write-Host "Ollama was not found. Downloading the official Windows installer script..." -ForegroundColor Yellow
    try {
        $installerScript = Invoke-RestMethod -Uri "https://ollama.com/install.ps1"
        if ([string]::IsNullOrWhiteSpace($installerScript)) {
            throw "The official installer returned no content."
        }
        & ([scriptblock]::Create($installerScript))
    } catch {
        Stop-Install "Ollama installation failed: $($_.Exception.Message)"
    }
}

function Test-OllamaModelInstalled {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Executable,
        [Parameter(Mandatory = $true)]
        [string]$Model
    )

    # Ollama can emit non-fatal log-rotation warnings on stderr while still
    # returning a valid model list. Do not let PowerShell's Stop preference
    # turn those warnings into an installer failure.
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $modelRows = @(& $Executable list 2>$null)
        $ollamaExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($ollamaExitCode -ne 0) {
        return $false
    }

    $escapedModel = [regex]::Escape($Model)
    return [bool]($modelRows | Where-Object { $_ -match "^\s*$escapedModel(?::|\s|$)" })
}

Write-Step "Checking Python"

$pythonCommand = $null
$pythonArguments = @()
$pythonOnPath = Get-Command python -ErrorAction SilentlyContinue

if ($pythonOnPath) {
    $pythonCommand = $pythonOnPath.Source
} else {
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        $pythonCommand = $pyLauncher.Source
        $pythonArguments = @("-3")
    }
}

if (-not $pythonCommand) {
    Stop-Install "Python 3.10 or newer is required. Install Python, then run this script again."
}

$versionOutput = (& $pythonCommand @pythonArguments --version 2>&1 | Out-String).Trim()
$versionMatch = [regex]::Match($versionOutput, "Python\s+(\d+)\.(\d+)")
if (-not $versionMatch.Success) {
    Stop-Install "Could not determine the Python version from '$versionOutput'."
}

$pythonMajor = [int]$versionMatch.Groups[1].Value
$pythonMinor = [int]$versionMatch.Groups[2].Value
if (($pythonMajor -lt 3) -or (($pythonMajor -eq 3) -and ($pythonMinor -lt 10))) {
    Stop-Install "Python 3.10 or newer is required. Found $pythonMajor.$pythonMinor."
}
Write-Host "Found $versionOutput"

$requirementsPath = Join-Path $projectRoot "requirements.txt"
if (-not (Test-Path -LiteralPath $requirementsPath -PathType Leaf)) {
    Stop-Install "requirements.txt was not found in $projectRoot."
}

$venvPath = Join-Path $projectRoot ".venv"
$venvPython = Join-Path $venvPath "Scripts\python.exe"
$createdVenv = $false

Write-Step "Creating the virtual environment"
if (-not (Test-Path -LiteralPath $venvPython -PathType Leaf)) {
    & $pythonCommand @pythonArguments -m venv $venvPath
    if ($LASTEXITCODE -ne 0) {
        Stop-Install "Python could not create the virtual environment."
    }
    $createdVenv = $true
} else {
    Write-Host "Using existing .venv"
}

Write-Step "Installing Python dependencies"
if ($createdVenv) {
    & $venvPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) {
        Stop-Install "pip could not be upgraded. Check your network connection and try again."
    }
} else {
    Write-Host "Using the existing pip installation"
}

# pip is reconciliation-based: it leaves packages alone when their versions
# already satisfy requirements.txt and changes only what is missing or out of range.
& $venvPython -m pip install -r $requirementsPath
if ($LASTEXITCODE -ne 0) {
    Stop-Install "Python dependencies could not be installed."
}

if (-not $SkipOllamaInstall) {
    Write-Step "Checking Ollama"
    $ollamaExecutable = Find-OllamaExecutable

    if (-not $ollamaExecutable) {
        Install-Ollama
        $ollamaExecutable = Find-OllamaExecutable
    }

    if (-not $ollamaExecutable) {
        Stop-Install "Ollama installation completed, but ollama.exe could not be found. Restart PowerShell and run this script again."
    }

    Write-Host "Found Ollama at $ollamaExecutable"
    if ($PullOllamaModel) {
        if (Test-OllamaModelInstalled -Executable $ollamaExecutable -Model $OllamaModel) {
            Write-Host "Ollama model '$OllamaModel' is already installed; skipping download."
        } else {
            Write-Step "Pulling Ollama model '$OllamaModel'"
            & $ollamaExecutable pull $OllamaModel
            if ($LASTEXITCODE -ne 0) {
                Stop-Install "Ollama could not pull '$OllamaModel'."
            }
        }
    } else {
        Write-Host "Model download skipped. To install it later, run: ollama pull $OllamaModel"
    }
} else {
    Write-Host "Ollama installation check skipped."
}

Write-Host "`nInstallation complete." -ForegroundColor Green
Write-Host "Start the app with:"
Write-Host "  .\.venv\Scripts\Activate.ps1"
Write-Host "  python app.py"
