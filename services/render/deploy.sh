#!/usr/bin/env bash
# Builds the render image with Cloud Build and points the Cloud Run job at it (spec 08 design §17).
# Run from anywhere inside the repository. Needs gcloud signed in with deploy rights.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
PROJECT="${MP_GCP_PROJECT:-${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}}"
PROJECT="${PROJECT:-motionpop-48409}"
REGION=us-central1
IMAGE=us-central1-docker.pkg.dev/${PROJECT}/motionpop/render
TAG=$(git rev-parse --short HEAD)

gcloud builds submit --project "${PROJECT}" --region "${REGION}" \
  --config services/render/cloudbuild.yaml --substitutions "_IMAGE=${IMAGE},_TAG=${TAG}" .

# One task per execution, never retried (a render is charged once, R9.1), scales to zero.
gcloud run jobs deploy motionpop-render --project "${PROJECT}" --region "${REGION}" \
  --image "${IMAGE}:${TAG}" \
  --tasks 1 --max-retries 0 --task-timeout 150m --cpu 4 --memory 8Gi \
  --service-account "render-job@${PROJECT}.iam.gserviceaccount.com" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT},STORAGE_BUCKET=${PROJECT}.firebasestorage.app"
