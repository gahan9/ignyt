#!/usr/bin/env bash
#
# Ignyt deploy script. Requires:
#   - EP_GCP_PROJECT_ID                (GCP project)
#   - A Secret Manager secret named "ignyt-gemini-key" holding the Gemini API key
#     (create once: gcloud secrets create ignyt-gemini-key --data-file=-)
#   - The Cloud Run runtime service account granted roles/secretmanager.secretAccessor
#
set -euo pipefail

PROJECT_ID="${EP_GCP_PROJECT_ID:?Set EP_GCP_PROJECT_ID}"
REGION="${EP_REGION:-us-central1}"
SERVICE_NAME="${EP_SERVICE_NAME:-ignyt-api}"
GEMINI_SECRET="${EP_GEMINI_SECRET:-ignyt-gemini-key}"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/ignyt/api"

echo "=== Building backend container ==="
cd backend
gcloud builds submit --tag "$IMAGE" --project "$PROJECT_ID"

echo "=== Deploying to Cloud Run (min=0, max=2, CPU-throttled) ==="
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --min-instances 0 \
  --max-instances 2 \
  --cpu-throttling \
  --memory 512Mi \
  --allow-unauthenticated \
  --set-env-vars "EP_GCP_PROJECT_ID=$PROJECT_ID" \
  --update-secrets "EP_GEMINI_API_KEY=${GEMINI_SECRET}:latest,EP_RECAPTCHA_SECRET_KEY=ignyt-recaptcha-key:latest"
cd ..

echo "=== Building frontend ==="
cd frontend
export VITE_RECAPTCHA_SITE_KEY="6LeYTMEsAAAAAGfjx77BsrfJUga1y94YyW5zk-Ky"
npm run build
cd ..

echo "=== Deploying to Firebase Hosting ==="
firebase deploy --only hosting --project "$PROJECT_ID"

echo "=== Deploying Firestore rules and indexes ==="
firebase deploy --only firestore --project "$PROJECT_ID"

echo "=== Done ==="
BACKEND_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" --project "$PROJECT_ID" --format 'value(status.url)')
echo "Backend:  $BACKEND_URL"
echo "Frontend: https://$PROJECT_ID.web.app"
