# Ignyt Deployment Script for Windows (PowerShell)
# Usage: ./deploy.ps1 -ProjectId ignyt

param (
    [string]$BackendProjectId = "ignyt-493612",
    [string]$FrontendProjectId = "ignyt-39f6e",
    [string]$Region = "us-central1"
)

# Refresh PATH from registry, then prepend common tool dirs that may be missing
# on a freshly-spawned shell (Cloud SDK, Node, and the per-user npm global dir).
# Using $env:APPDATA keeps this portable across workstations / logged-in users.
$MachinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$UserPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:PATH = "$MachinePath;$UserPath;C:\Program Files\nodejs;$env:APPDATA\npm"

$GCloudPath = "C:\Google\Cloud SDK\google-cloud-sdk\bin"
if (Test-Path $GCloudPath) {
    if ($env:PATH -notlike "*$GCloudPath*") {
        $env:PATH = "$GCloudPath;$env:PATH"
    }
}

if (-not $BackendProjectId -or -not $FrontendProjectId) {
    Write-Error "Project IDs not specified."
    exit 1
}

$Image = "$Region-docker.pkg.dev/$BackendProjectId/ignyt/api"

Write-Host "=== Building backend container (Project: $BackendProjectId) ===" -ForegroundColor Cyan
Set-Location backend
gcloud builds submit --tag "$Image" --project "$BackendProjectId"
if ($LASTEXITCODE -ne 0) { Write-Error "Backend build failed"; exit 1 }

Write-Host "=== Deploying to Cloud Run (Project: $BackendProjectId) ===" -ForegroundColor Cyan
gcloud run deploy ignyt-api `
  --image "$Image" `
  --region "$Region" `
  --project "$BackendProjectId" `
  --min-instances 0 `
  --max-instances 2 `
  --cpu-throttling `
  --memory 512Mi `
  --allow-unauthenticated `
  --set-env-vars "EP_GCP_PROJECT_ID=$FrontendProjectId,EP_CORS_ORIGINS=https://$FrontendProjectId.web.app;https://$FrontendProjectId.firebaseapp.com" `
  --set-secrets "EP_GEMINI_API_KEY=ignyt-gemini-key:latest"
if ($LASTEXITCODE -ne 0) { Write-Error "Cloud Run deployment failed"; exit 1 }

$BackendUrl = gcloud run services describe ignyt-api `
  --region "$Region" --project "$BackendProjectId" --format 'value(status.url)'
Set-Location ..

if (Get-Command npm -ErrorAction SilentlyContinue) {
    Write-Host "=== Building frontend (Targeting: $BackendUrl) ===" -ForegroundColor Cyan
    Set-Location frontend
    # Inject backend URL into frontend build
    $env:VITE_API_URL = "$BackendUrl/api/v1"
    npm install
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed"; exit 1 }
    Set-Location ..

    if (Get-Command firebase -ErrorAction SilentlyContinue) {
        Write-Host "=== Deploying to Firebase (Project: $FrontendProjectId) ===" -ForegroundColor Cyan
        firebase deploy --only hosting --project "$FrontendProjectId"
        firebase deploy --only firestore --project "$FrontendProjectId"
    } else {
        Write-Warning "firebase command not found. Skipping frontend deployment."
    }
} else {
    Write-Warning "npm command not found. Skipping frontend build/deployment."
}

Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Backend:  $BackendUrl"
Write-Host "Frontend: https://$FrontendProjectId.web.app"
