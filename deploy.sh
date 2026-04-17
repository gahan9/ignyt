#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${EP_GCP_PROJECT_ID:?Set EP_GCP_PROJECT_ID}"
REGION="us-central1"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/eventpulse/api"

echo "=== Building backend container ==="
cd backend
gcloud builds submit --tag "$IMAGE" --project "$PROJECT_ID"

echo "=== Deploying to Cloud Run (min=0, max=2, CPU-throttled) ==="
gcloud run deploy eventpulse-api \
  --image "$IMAGE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --min-instances 0 \
  --max-instances 2 \
  --cpu-throttling \
  --memory 512Mi \
  --allow-unauthenticated \
  --set-env-vars "EP_GCP_PROJECT_ID=$PROJECT_ID"
cd ..

echo "=== Building frontend ==="
cd frontend
npm run build
cd ..

echo "=== Deploying to Firebase Hosting ==="
firebase deploy --only hosting --project "$PROJECT_ID"

echo "=== Deploying Firestore rules and indexes ==="
firebase deploy --only firestore --project "$PROJECT_ID"

echo "=== Done ==="
BACKEND_URL=$(gcloud run services describe eventpulse-api \
  --region "$REGION" --project "$PROJECT_ID" --format 'value(status.url)')
echo "Backend:  $BACKEND_URL"
echo "Frontend: https://$PROJECT_ID.web.app"
