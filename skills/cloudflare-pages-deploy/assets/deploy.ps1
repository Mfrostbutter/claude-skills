<#
.SYNOPSIS
  Headless Cloudflare Pages deploy. Auth by env var, no `wrangler login`.

.EXAMPLE
  .\deploy.ps1 -Project my-site -DeployDir dist
  .\deploy.ps1 -Project my-site -DeployDir dist -Branch main -FunctionsDir functions

.NOTES
  Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment.
  Wrangler writes progress to stderr; PowerShell 5.1 wraps that in
  NativeCommandError and sets $? to false on a clean exit. This script checks
  $LASTEXITCODE instead, which reflects the real exit code.
#>
param(
  [Parameter(Mandatory = $true)][string]$Project,
  [Parameter(Mandatory = $true)][string]$DeployDir,
  [string]$Branch = "main",
  [string]$FunctionsDir = ""
)

$ErrorActionPreference = "Stop"

# Both vars are mandatory. A Pages-scoped token cannot discover its own account.
if (-not $env:CLOUDFLARE_API_TOKEN) { throw "CLOUDFLARE_API_TOKEN is not set" }
if (-not $env:CLOUDFLARE_ACCOUNT_ID) {
  throw "CLOUDFLARE_ACCOUNT_ID is not set (scoped tokens cannot auto-discover it)"
}
if (-not (Test-Path $DeployDir)) { throw "deploy dir not found: $DeployDir" }

# Strip stray CR/LF from a token captured through a secrets CLI.
$env:CLOUDFLARE_API_TOKEN = $env:CLOUDFLARE_API_TOKEN.Trim()

# Pre-flight: separates "auth is broken" from "the deploy is broken".
Write-Host "==> verifying auth"
npx wrangler pages project list | Out-Null
if ($LASTEXITCODE -ne 0) { throw "auth check failed (exit $LASTEXITCODE)" }

# Functions only ship if they live inside the uploaded directory.
if ($FunctionsDir) {
  Write-Host "==> staging functions from $FunctionsDir"
  $dest = Join-Path $DeployDir "functions"
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  Copy-Item -Recurse $FunctionsDir $dest
}

# --branch is what routes to production. Without it this is a preview deploy.
Write-Host "==> deploying $DeployDir to $Project (branch=$Branch)"
npx wrangler pages deploy $DeployDir --project-name $Project --branch=$Branch
if ($LASTEXITCODE -ne 0) { throw "deploy failed (exit $LASTEXITCODE)" }

Write-Host "==> done. Verify the CUSTOM DOMAIN, not the pages.dev URL."
Write-Host "    Red NativeCommandError text above is wrangler stderr, not a failure."
