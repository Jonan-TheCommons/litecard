# Litecard Admin

This project has been migrated from a CSV-driven Node script into a Next.js web application for admin users.

## What changed

- The primary workflow now runs through a browser-based admin UI.
- Admin users can enter one or many members in a single batch.
- Admin users can also upload the legacy CSV format directly from the UI. Large CSV uploads are split into sequential batches based on `MAX_BATCH_SIZE`.
- The backend still executes the original sequence for each member:
  1. Create the Litecard pass
  2. Update the Salesforce contact
  3. Send the Postmark template email
- A legacy CSV runner is still available through `npm run legacy:csv`.

## Environment variables

Copy `.env.example` to `.env.local` and fill in the integration credentials.

- `LITECARD_BASE_URL`
- `LITECARD_TEMPLATE_ID`
- `LITECARD_USERNAME`
- `LITECARD_PASSWORD`
- `SF_BASE_URL`
- `SF_CONSUMER_KEY`
- `SF_USER_NAME`
- `SF_JWT_SECRET_KEY`
- `POSTMARK_API_TOKEN`
- `POSTMARK_TEMPLATE_ID`
- `WORKER_CONCURRENCY`
- `MAX_BATCH_SIZE`

## Local development

```bash
source ~/.nvm/nvm.sh
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## AWS Amplify

If you deploy this app with AWS Amplify SSR, the build must write the required server environment variables into `.env.production` before `npm run build`. The repo-level `amplify.yml` already does this for the Litecard, Salesforce, Postmark, and batch settings used by the server runtime.

## Notes

- Protect the admin app at the hosting layer before exposing it publicly.
- Server-side logs are written to the `logs/` directory.
