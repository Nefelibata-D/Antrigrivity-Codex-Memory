$ErrorActionPreference = "Stop"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js (>= 18) is required. Please install Node.js first."
  exit 1
}

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { "" }
$localInstaller = if ($scriptDir) { Join-Path $scriptDir "install.mjs" } else { "" }

if ($localInstaller -and (Test-Path $localInstaller)) {
  node $localInstaller @args
  exit $LASTEXITCODE
}

$repo = "Nefelibata-D/Antrigrivity-Codex-Memory"
$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("agy-memory-" + [System.Guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

try {
  Write-Host "[antigrivity-memory] Downloading latest release from GitHub..."
  $tarPath = Join-Path $tmpDir "release.tar.gz"
  $srcDir = Join-Path $tmpDir "src"
  New-Item -ItemType Directory -Force -Path $srcDir | Out-Null

  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{ "User-Agent" = "antigrivity-memory-installer" }
  $tarUrl = $release.tarball_url
  Write-Host "[antigrivity-memory] Latest version: $($release.tag_name)"
  Invoke-WebRequest -Uri $tarUrl -OutFile $tarPath -Headers @{ "User-Agent" = "antigrivity-memory-installer" }

  tar -xzf $tarPath -C $srcDir --strip-components=1
  node (Join-Path $srcDir "install.mjs") @args
} finally {
  Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
}
