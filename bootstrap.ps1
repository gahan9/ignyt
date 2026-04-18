<#
.SYNOPSIS
  One-shot, idempotent GCP/Firebase bootstrap for Ignyt.

.DESCRIPTION
  Executes every non-interactive checklist phase (APIs, Firestore, Storage,
  IAM, Secrets, Firebase Web App registration, generating frontend/.env.local,
  and the organizer-claim grant) against your two GCP projects.

  Re-runnable: every step probes current state and prints PASS / SKIP / FAIL.

.PREREQUISITES  (run these ONCE, interactively, BEFORE bootstrap.ps1)
    gcloud auth login
    gcloud auth application-default login --project ignyt-39f6e
    gcloud auth application-default set-quota-project ignyt-39f6e
    firebase login

  The operator email you pass in -OperatorEmail MUST have signed in to the
  web app at least once, otherwise the grant_organizer step cannot find them.

.PARAMETER OperatorEmail
  Sign-in email of the user to promote to 'organizer'. Required.

.PARAMETER GeminiApiKey
  Optional. If provided, uploaded to Secret Manager as ignyt-gemini-key.
  Omit to upload later manually.

.PARAMETER BackendProjectId
  Project id for Cloud Run + Artifact Registry + Secrets. Default: ignyt-493612.

.PARAMETER FrontendProjectId
  Project id for Firebase Auth + Firestore + Hosting + GCS. Default: ignyt-39f6e.

.PARAMETER Region
  Regional services region. Default: us-central1 (matches deploy.ps1).

.PARAMETER FirestoreLocation
  Firestore location. 'nam5' is multi-region US (recommended for HA).
  'us-central1' is regional (cheaper, slightly lower latency from us-central1 Run).

.PARAMETER SkipOrganizerGrant
  Skip Phase 9. Useful if backend venv isn't set up yet.

.EXAMPLE
  .\bootstrap.ps1 -OperatorEmail me@example.com -GeminiApiKey "AIza..."

.EXAMPLE
  # Minimal (skip secret upload and organizer grant)
  .\bootstrap.ps1 -OperatorEmail me@example.com -SkipOrganizerGrant
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$OperatorEmail,
  [string]$GeminiApiKey = "",
  [string]$BackendProjectId = "ignyt-493612",
  [string]$FrontendProjectId = "ignyt-39f6e",
  [string]$Region = "us-central1",
  [ValidateSet("nam5", "us-central1", "us-east1", "us-west1", "eur3")]
  [string]$FirestoreLocation = "nam5",
  [switch]$SkipOrganizerGrant
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$script:RepoRoot = $PSScriptRoot
$script:Failures = @()

# --------------------------------------------------------------------------- #
# PATH: add common tool locations so the script works in a fresh shell.
# --------------------------------------------------------------------------- #
$toolPaths = @(
  "C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin",
  "C:\Program Files\nodejs",
  "$env:APPDATA\npm"
)
foreach ($p in $toolPaths) {
  if ((Test-Path $p) -and ($env:PATH -notlike "*$p*")) {
    $env:PATH = "$p;$env:PATH"
  }
}

# --------------------------------------------------------------------------- #
# Logging helpers
# --------------------------------------------------------------------------- #
function Section($msg) {
  Write-Host ""
  Write-Host "=== $msg ===" -ForegroundColor Cyan
}
function Pass($msg) { Write-Host "  [ok]   $msg" -ForegroundColor Green }
function Skip($msg) { Write-Host "  [skip] $msg" -ForegroundColor DarkGray }
function Warn($msg) { Write-Host "  [warn] $msg" -ForegroundColor Yellow }
function Fail($msg) {
  Write-Host "  [fail] $msg" -ForegroundColor Red
  $script:Failures += $msg
}
function Die($msg) {
  Write-Host "[fatal] $msg" -ForegroundColor Red
  exit 1
}

function Invoke-Gcloud {
  param([string[]]$GcArgs, [switch]$IgnoreFailure)
  $output = & gcloud @GcArgs 2>&1
  if ($LASTEXITCODE -ne 0 -and -not $IgnoreFailure) {
    Fail "gcloud $($GcArgs -join ' ') -> $($output -join '; ')"
    return $null
  }
  return $output
}

# --------------------------------------------------------------------------- #
# Phase 0: Verify CLI + auth state
# --------------------------------------------------------------------------- #
Section "Phase 0 - Verify CLI + auth"

foreach ($cli in @("gcloud", "firebase", "node", "npm")) {
  if (-not (Get-Command $cli -ErrorAction SilentlyContinue)) {
    Die "$cli is not on PATH. See PREREQUISITES in the script header."
  }
}
Pass "gcloud, firebase, node, npm all present"

$activeAccount = (& gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null) | Select-Object -First 1
if (-not $activeAccount) {
  Die "gcloud has no active account. Run: gcloud auth login"
}
Pass "gcloud active account: $activeAccount"

try {
  $adcToken = & gcloud auth application-default print-access-token 2>$null
  if (-not $adcToken -or $adcToken.ToString().Length -lt 50) { throw "short" }
  Pass "Application Default Credentials configured"
} catch {
  Die "ADC missing. Run: gcloud auth application-default login --project $FrontendProjectId"
}

$fbAccounts = & firebase login:list 2>&1
if ($fbAccounts -match "No authorized accounts" -or $LASTEXITCODE -ne 0) {
  Die "firebase CLI not authenticated. Run: firebase login"
}
Pass "firebase CLI authenticated"

foreach ($projId in @($FrontendProjectId, $BackendProjectId)) {
  $proj = & gcloud projects describe $projId --format="value(projectId)" 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $proj) {
    Die "Cannot access project '$projId' with account $activeAccount. Verify ownership or switch accounts."
  }
  Pass "access verified: $projId"
}

# --------------------------------------------------------------------------- #
# Phase 2: APIs on Frontend (Firestore/Auth/Hosting) project
# --------------------------------------------------------------------------- #
Section "Phase 2 - Enable APIs on $FrontendProjectId"

$frontendApis = @(
  "firebase.googleapis.com",
  "identitytoolkit.googleapis.com",
  "firestore.googleapis.com",
  "firebaserules.googleapis.com",
  "firebasehosting.googleapis.com",
  "storage.googleapis.com",
  "serviceusage.googleapis.com"
)
foreach ($api in $frontendApis) {
  Invoke-Gcloud @("services", "enable", $api, "--project", $FrontendProjectId) | Out-Null
  if ($LASTEXITCODE -eq 0) { Pass "enabled $api" }
}

# --------------------------------------------------------------------------- #
# Phase 3: APIs on Backend (Cloud Run) project
# --------------------------------------------------------------------------- #
Section "Phase 3 - Enable APIs on $BackendProjectId"

$backendApis = @(
  "run.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "secretmanager.googleapis.com",
  "generativelanguage.googleapis.com",
  "vision.googleapis.com",
  "firestore.googleapis.com",
  "serviceusage.googleapis.com"
)
foreach ($api in $backendApis) {
  Invoke-Gcloud @("services", "enable", $api, "--project", $BackendProjectId) | Out-Null
  if ($LASTEXITCODE -eq 0) { Pass "enabled $api" }
}

# --------------------------------------------------------------------------- #
# Phase 5: Firestore database + rules + indexes
# --------------------------------------------------------------------------- #
Section "Phase 5 - Firestore on $FrontendProjectId"

$dbExists = & gcloud firestore databases describe --database="(default)" --project $FrontendProjectId 2>$null
if ($LASTEXITCODE -eq 0 -and $dbExists) {
  Skip "Firestore '(default)' database already exists"
} else {
  Invoke-Gcloud @("firestore", "databases", "create",
    "--location=$FirestoreLocation",
    "--project=$FrontendProjectId") | Out-Null
  if ($LASTEXITCODE -eq 0) { Pass "Created Firestore database in $FirestoreLocation" }
}

Push-Location $script:RepoRoot
try {
  & firebase deploy --only firestore:rules --project $FrontendProjectId --non-interactive 2>&1 | Out-Host
  if ($LASTEXITCODE -eq 0) { Pass "Deployed firestore.rules" } else { Fail "firestore:rules deploy failed" }

  & firebase deploy --only firestore:indexes --project $FrontendProjectId --non-interactive 2>&1 | Out-Host
  if ($LASTEXITCODE -eq 0) { Pass "Deployed firestore.indexes.json" } else { Fail "firestore:indexes deploy failed" }
} finally {
  Pop-Location
}

# --------------------------------------------------------------------------- #
# Phase 6: Cloud Storage bucket + CORS + lifecycle
# --------------------------------------------------------------------------- #
Section "Phase 6 - Cloud Storage on $FrontendProjectId"

$bucket = "$FrontendProjectId-photos"
& gcloud storage buckets describe "gs://$bucket" --project $FrontendProjectId 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  Skip "Bucket gs://$bucket already exists"
} else {
  Invoke-Gcloud @("storage", "buckets", "create", "gs://$bucket",
    "--project=$FrontendProjectId",
    "--location=$Region",
    "--uniform-bucket-level-access") | Out-Null
  if ($LASTEXITCODE -eq 0) { Pass "Created gs://$bucket" }
}

$corsFile = Join-Path $env:TEMP "ignyt-cors-$([guid]::NewGuid()).json"
@"
[
  {
    "origin": ["https://$FrontendProjectId.web.app", "https://$FrontendProjectId.firebaseapp.com", "http://localhost:5173"],
    "method": ["GET", "POST", "PUT"],
    "responseHeader": ["Content-Type", "Authorization"],
    "maxAgeSeconds": 3600
  }
]
"@ | Out-File -FilePath $corsFile -Encoding ascii
Invoke-Gcloud @("storage", "buckets", "update", "gs://$bucket", "--cors-file=$corsFile") | Out-Null
Remove-Item $corsFile -Force
if ($LASTEXITCODE -eq 0) { Pass "CORS policy applied" }

$lcFile = Join-Path $env:TEMP "ignyt-lifecycle-$([guid]::NewGuid()).json"
@'
{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}
'@ | Out-File -FilePath $lcFile -Encoding ascii
Invoke-Gcloud @("storage", "buckets", "update", "gs://$bucket", "--lifecycle-file=$lcFile") | Out-Null
Remove-Item $lcFile -Force
if ($LASTEXITCODE -eq 0) { Pass "30-day lifecycle rule applied (auto-delete old photos)" }

# --------------------------------------------------------------------------- #
# Phase 7: IAM bindings (least privilege, cross-project)
# --------------------------------------------------------------------------- #
Section "Phase 7 - IAM bindings"

$projectNumber = & gcloud projects describe $BackendProjectId --format="value(projectNumber)" 2>$null
if (-not $projectNumber) { Die "Could not resolve project number for $BackendProjectId" }
$runSa = "$projectNumber-compute@developer.gserviceaccount.com"
Pass "Cloud Run runtime service account: $runSa"

# Human admin: firebaseauth.admin on the frontend project (needed for grant_organizer.py).
Invoke-Gcloud @("projects", "add-iam-policy-binding", $FrontendProjectId,
  "--member=user:$activeAccount",
  "--role=roles/firebaseauth.admin",
  "--condition=None") -IgnoreFailure | Out-Null
Pass "user:$activeAccount => roles/firebaseauth.admin on $FrontendProjectId"

# Cloud Run SA: cross-project Firestore writes.
Invoke-Gcloud @("projects", "add-iam-policy-binding", $FrontendProjectId,
  "--member=serviceAccount:$runSa",
  "--role=roles/datastore.user",
  "--condition=None") -IgnoreFailure | Out-Null
Pass "serviceAccount:$runSa => roles/datastore.user on $FrontendProjectId"

# Cloud Run SA: cross-project Storage writes.
Invoke-Gcloud @("projects", "add-iam-policy-binding", $FrontendProjectId,
  "--member=serviceAccount:$runSa",
  "--role=roles/storage.objectAdmin",
  "--condition=None") -IgnoreFailure | Out-Null
Pass "serviceAccount:$runSa => roles/storage.objectAdmin on $FrontendProjectId"

# Cloud Run SA: Secret Manager access on backend project.
Invoke-Gcloud @("projects", "add-iam-policy-binding", $BackendProjectId,
  "--member=serviceAccount:$runSa",
  "--role=roles/secretmanager.secretAccessor",
  "--condition=None") -IgnoreFailure | Out-Null
Pass "serviceAccount:$runSa => roles/secretmanager.secretAccessor on $BackendProjectId"

# --------------------------------------------------------------------------- #
# Phase 8: Secret Manager - ignyt-gemini-key
# --------------------------------------------------------------------------- #
Section "Phase 8 - Secret Manager on $BackendProjectId"

& gcloud secrets describe ignyt-gemini-key --project $BackendProjectId 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  Skip "Secret 'ignyt-gemini-key' already exists"
} else {
  Invoke-Gcloud @("secrets", "create", "ignyt-gemini-key",
    "--project=$BackendProjectId",
    "--replication-policy=automatic") | Out-Null
  if ($LASTEXITCODE -eq 0) { Pass "Created secret 'ignyt-gemini-key'" }
}

if ($GeminiApiKey -and $GeminiApiKey.Length -gt 10) {
  $keyFile = Join-Path $env:TEMP "gemini-key-$([guid]::NewGuid()).txt"
  # -NoNewline is critical: a trailing LF corrupts the API key.
  [IO.File]::WriteAllText($keyFile, $GeminiApiKey)
  try {
    Invoke-Gcloud @("secrets", "versions", "add", "ignyt-gemini-key",
      "--project=$BackendProjectId",
      "--data-file=$keyFile") | Out-Null
    if ($LASTEXITCODE -eq 0) { Pass "Uploaded new Gemini key version" }
  } finally {
    Remove-Item $keyFile -Force -ErrorAction SilentlyContinue
  }
} else {
  Skip "No Gemini API key supplied (-GeminiApiKey). Add later: gcloud secrets versions add ignyt-gemini-key --data-file=..."
}

# --------------------------------------------------------------------------- #
# Firebase Web App + frontend/.env.local
# Firebase Auth providers themselves must be enabled in the console (Phase 4).
# This block does the parts that CAN be automated: registering a web app and
# writing the public Firebase config into .env.local so `npm run dev` works.
# --------------------------------------------------------------------------- #
Section "Frontend - Firebase Web App + .env.local"

$webAppsRaw = & firebase apps:list WEB --project $FrontendProjectId --json 2>$null
$appId = $null
if ($LASTEXITCODE -eq 0 -and $webAppsRaw) {
  try {
    $parsed = $webAppsRaw | ConvertFrom-Json
    if ($parsed.result -and $parsed.result.Count -gt 0) {
      $appId = $parsed.result[0].appId
      Skip "Web App already registered: $appId"
    }
  } catch {
    # Older CLI may return non-JSON; fall through to create.
  }
}
if (-not $appId) {
  $createRaw = & firebase apps:create WEB "Ignyt Web" --project $FrontendProjectId --json 2>&1
  try {
    $created = $createRaw | ConvertFrom-Json
    $appId = $created.result.appId
  } catch {}
  if ($appId) { Pass "Created Web App: $appId" } else { Fail "Could not create Firebase Web App ($createRaw)" }
}

if ($appId) {
  $sdkRaw = & firebase apps:sdkconfig WEB $appId --project $FrontendProjectId --json 2>$null
  try {
    $sdk = ($sdkRaw | ConvertFrom-Json).result.sdkConfig
    $envPath = Join-Path $script:RepoRoot "frontend\.env.local"
    $envContent = @"
# Generated by bootstrap.ps1 on $(Get-Date -Format o).
# These are public Firebase project identifiers, NOT secrets. Committing them
# is technically safe, but .env.local is gitignored so we treat this as a
# per-developer artifact.
VITE_FIREBASE_API_KEY=$($sdk.apiKey)
VITE_FIREBASE_AUTH_DOMAIN=$($sdk.authDomain)
VITE_FIREBASE_PROJECT_ID=$($sdk.projectId)
VITE_FIREBASE_STORAGE_BUCKET=$($sdk.storageBucket)
VITE_FIREBASE_MESSAGING_SENDER_ID=$($sdk.messagingSenderId)
VITE_FIREBASE_APP_ID=$($sdk.appId)

# Leave blank in dev; Vite proxies /api to http://localhost:8080 (see vite.config.ts).
VITE_API_URL=
"@
    Set-Content -Path $envPath -Value $envContent -Encoding UTF8
    Pass "Wrote frontend\.env.local (projectId=$($sdk.projectId))"
  } catch {
    Fail "Could not parse SDK config: $_"
  }
}

# --------------------------------------------------------------------------- #
# Phase 9: Grant organizer claim (optional)
# --------------------------------------------------------------------------- #
if ($SkipOrganizerGrant) {
  Section "Phase 9 - Organizer grant skipped (-SkipOrganizerGrant)"
} else {
  Section "Phase 9 - Grant organizer claim to $OperatorEmail"

  Push-Location (Join-Path $script:RepoRoot "backend")
  try {
    if (-not (Test-Path ".venv\Scripts\python.exe")) {
      Write-Host "  Creating backend venv..."
      & py -3 -m venv .venv
      if ($LASTEXITCODE -ne 0) { Fail "Could not create venv"; return }
      Pass "Created backend\.venv"
    }
    Write-Host "  Installing backend dependencies (may take ~60s on first run)..."
    & .\.venv\Scripts\python.exe -m pip install -q --upgrade pip 2>&1 | Out-Null
    & .\.venv\Scripts\python.exe -m pip install -q -e . 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "pip install -e . failed"; return }

    $grantOut = & .\.venv\Scripts\python.exe scripts\grant_organizer.py `
      --project-id $FrontendProjectId --email $OperatorEmail 2>&1
    Write-Host ($grantOut | Out-String)
    if ($LASTEXITCODE -eq 0) {
      Pass "Granted 'organizer' claim to $OperatorEmail"
      Write-Host "  Note: $OperatorEmail must sign out + back in to pick up the new claim." -ForegroundColor Yellow
    } else {
      Fail "grant_organizer.py failed. Common causes:"
      Write-Host "         * User has never signed in -> sign in once at the web app, retry." -ForegroundColor Yellow
      Write-Host "         * ADC quota project mismatch -> run: gcloud auth application-default set-quota-project $FrontendProjectId" -ForegroundColor Yellow
      Write-Host "         * Firebase Auth provider not enabled -> see console follow-ups below." -ForegroundColor Yellow
    }
  } finally {
    Pop-Location
  }
}

# --------------------------------------------------------------------------- #
# Summary + manual follow-ups
# --------------------------------------------------------------------------- #
Section "Bootstrap complete"

if ($script:Failures.Count -gt 0) {
  Write-Host ""
  Write-Host "The following steps reported failures:" -ForegroundColor Red
  $script:Failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  Write-Host ""
}

Write-Host "Manual follow-ups (console-only, cannot be automated):" -ForegroundColor Yellow
Write-Host "  1. Firebase Auth providers:"
Write-Host "       https://console.firebase.google.com/project/$FrontendProjectId/authentication/providers"
Write-Host "       Enable 'Email/Password' and 'Google' (set a support email)."
Write-Host ""
Write-Host "  2. Billing budget (`$3 cap):"
Write-Host "       https://console.cloud.google.com/billing/budgets"
Write-Host "       Create a `$3/month budget on your billing account with alerts at 50/90/100%."
Write-Host ""
Write-Host "  3. Once the budget + Auth providers are live, deploy the app:"
Write-Host "       .\deploy.ps1 -BackendProjectId $BackendProjectId -FrontendProjectId $FrontendProjectId" -ForegroundColor Cyan

if ($script:Failures.Count -gt 0) { exit 1 }
