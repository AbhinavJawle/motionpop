---
inclusion: auto
name: security-and-cost
description: Secrets, BYOK API keys, auth, AWS IAM, rate limits, AI model routing and cost control. Use when touching environment variables, credentials, API routes, AI calls, AWS resources or infrastructure.
---

# Security and cost

## Secrets
- Never put secrets in code, steering, specs, tests, logs or commits. Read them from environment variables; document names (with placeholders) in `.env.example`.
- `.env*` (except `.env.example`) is in `.gitignore` and `.kiroignore`.

## BYOK (user's Anthropic key)
- Sent once over HTTPS, encrypted with AWS KMS, stored only as ciphertext. Decrypted server-side per request, never sent back to the client.
- Never logged, never included in error messages or analytics. Redact anything matching `sk-ant-` in log output.
- Validated with one cheap test call on save. Deletable at any time (hard delete).

## Server boundaries
- AI and AWS SDK calls only in route handlers / server actions (`import "server-only"`).
- Validate every request body with zod at the boundary. Scope every data access by the authenticated user's workspace id.
- Rate limit generation endpoints per user.

## AWS
- Least-privilege IAM per function. S3 buckets private; downloads via signed URLs.
- AWS Budgets alert before any paid resource is deployed.

## AI cost
- Route by task via the single routing table in `packages/engine`. Never default to the most expensive model.
- Refinements are JSON patches from the fast tier; never regenerate the whole scene for an edit.
- Cache the static catalog prompt. Keep outputs JSON-only and small.
- Retries: at most 2, with validation errors fed back; then fall back to safe defaults.
