# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Litecard Admin

## Overview

Litecard Admin is a Next.js-based web application that replaced a CSV-driven Node script. It provides an admin dashboard for issuing digital wallet passes (Apple Wallet, Google Pay) without managing CSV files directly.

**Type**: Full-stack web application (Next.js 15 + React 19)  
**Platform**: Browser-based admin UI with Node.js backend  
**Deployment**: AWS Amplify SSR  

## Build & Development Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Build for production
npm start            # Start production server
npm run legacy:csv   # Run legacy CSV-based runner (Node script)
```

## High-Level Architecture

### Core Flow

The application orchestrates a three-step workflow for each member:
1. **Litecard API**: Create a digital pass (Apple/Google Wallet)
2. **Salesforce**: Update contact record with Litecard pass ID
3. **Postmark**: Send welcome and loyalty template emails

### Key Frameworks & Libraries

- **Next.js 15**: React framework with App Router, API routes, middleware
- **React 19**: UI components with hooks
- **jsforce**: Salesforce OAuth2 JWT auth and SOQL queries
- **jsonwebtoken**: JWT signing for Salesforce authentication
- **node-fetch**: HTTP client for Litecard and Postmark APIs

## Directory Structure

```
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── cards/process/route.js        # Main batch processing endpoint
│   │   └── salesforce/litecard/route.js  # Salesforce webhook endpoint
│   ├── layout.js                 # Root layout
│   ├── page.js                   # Home page
│   └── globals.css               # Global styles
├── components/
│   └── admin-dashboard.js        # Main client component (React 19)
├── lib/
│   ├── server/
│   │   ├── env.js                # Environment config (server-only)
│   │   ├── litecard.js           # Litecard API client with token caching
│   │   ├── litecard-email.js     # Email orchestration for Litecard flow
│   │   ├── salesforce.js         # Salesforce OAuth2 & contact updates
│   │   ├── postmark.js           # Postmark email API client
│   │   ├── log.js                # File logging to logs/web-YYYY-MM-DD.log
│   │   ├── process-batch.js      # Batch processor with concurrency limiter
│   │   ├── process-record.js     # Single-record workflow orchestrator
│   │   └── retry.js              # Exponential backoff retry utility
│   ├── shared/
│   │   ├── records.js            # Record validation & normalization
│   │   └── csv.js                # CSV parsing (RFC 4180 compliant)
│   └── ... (legacy files)
├── middleware.js                 # Security headers
├── next.config.mjs               # Next.js config
├── .env.example                  # Template env vars
├── .env.local                    # Local development secrets
├── .env.production               # Production secrets (written by Amplify)
└── amplify.yml                   # AWS Amplify build config
```

## Environment Variables

**Required (will error if missing)**:
- `LITECARD_TEMPLATE_ID` - Wallet pass template ID from Litecard
- `LITECARD_USERNAME` - Litecard API credentials (username)
- `LITECARD_PASSWORD` - Litecard API credentials (password)
- `SF_CONSUMER_KEY` - Salesforce OAuth2 client ID
- `SF_USER_NAME` - Salesforce system user for JWT auth
- `SF_JWT_SECRET_KEY` - PEM-encoded private key (newlines as `\n`)
- `POSTMARK_API_TOKEN` - Postmark email service API token
- `POSTMARK_LOYALTY_TEMPLATE_ID` - Postmark template for loyalty card email
- `POSTMARK_WELCOME_TEMPLATE_ID` - Postmark template for welcome email

**Optional (with defaults)**:
- `LITECARD_BASE_URL` - Defaults to `https://bff-api.enterprise.litecard.io/api/v1`
- `SF_BASE_URL` - Defaults to `https://login.salesforce.com`
- `SF_WEBHOOK_SECRET` - Secret for `/api/salesforce/litecard` webhook auth
- `WORKER_CONCURRENCY` - Concurrent record processing (default: 5)
- `MAX_BATCH_SIZE` - Maximum records per batch upload (default: 50)

**Local Dev Setup**:
```bash
cp .env.example .env.local
# Fill in all required variables
source ~/.nvm/nvm.sh  # If using NVM
npm install
npm run dev
```

## API Routes & Entry Points

### 1. `POST /api/cards/process` - Batch Processing

Main admin interface for processing member records.

**Request**:
```json
{
  "records": [
    {
      "id": "003...",          // Salesforce Contact ID
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "memberId": "12345"
    }
  ]
}
```

**Response**:
```json
{
  "summary": {
    "total": 1,
    "succeeded": 1,
    "failed": 0,
    "concurrency": 5
  },
  "results": [
    {
      "index": 0,
      "status": "success",
      "input": { ... },
      "output": {
        "pass": { "cardId": "...", "appleLink": "...", "googleLink": "..." },
        "salesforce": { ... },
        "email": { "messageId": "...", "submittedAt": "..." }
      }
    }
  ]
}
```

**Validation**:
- Content-Type must be `application/json`
- All records must have: `id`, `firstName`, `lastName`, `email`, `memberId`
- Email validation: basic RFC pattern check
- Batch size capped at `MAX_BATCH_SIZE`
- Same-origin request verification (using `origin` header or forwarded headers)

### 2. `GET /api/cards/process` - Config Probe

Returns server-side configuration for client UI.

**Response**:
```json
{
  "maxBatchSize": 50,
  "requiredFields": ["id", "firstName", "lastName", "email", "memberId"],
  "workerConcurrency": 5
}
```

### 3. `POST /api/salesforce/litecard` - Salesforce Webhook

Triggered by Salesforce Flow when new members are created.

**Request**:
```json
{
  "first_name": "Jane",
  "last_name": "Smith",
  "email": "jane@example.com",
  "member_id": "67890"
}
```

**Auth**:
- Header: `Authorization: Bearer <SF_WEBHOOK_SECRET>` OR
- Header: `x-api-key: <SF_WEBHOOK_SECRET>`

**Response**:
```json
{
  "response": {
    "message": "ok",
    "passId": "card-id-123"
  },
  "statusCode": 200
}
```

**Note**: Does NOT require Salesforce contact ID (different from batch endpoint).

## Patterns & Key Design Decisions

### 1. Server-Side Validation & Security

- **"server-only" imports**: Prevent accidental import of server code into client bundles
- **Environment validation**: `getServerConfig()` caches and validates all required env vars on first call
- **Security headers middleware**: Applies no-cache, no-frame-options, no-sniff headers globally
- **Origin validation**: CSRF protection via same-origin header checks

### 2. Token Caching & Connection Pooling

**Litecard Token Caching** (`lib/server/litecard.js`):
- Cache expires 30s before actual expiry (leeway)
- Falls back to 1-hour TTL if API doesn't specify
- Single cached token reused across all requests

**Salesforce Connection Caching** (`lib/server/salesforce.js`):
- JWT-based OAuth2 (no refresh tokens needed)
- Cache expires after 10 minutes
- "Inflight promise" pattern prevents duplicate auth requests during concurrent use

### 3. Retry Strategy with Exponential Backoff

`lib/server/retry.js` provides configurable retry logic:

```javascript
withRetry(() => createPass(payload), {
  retries: 3,           // Total attempts
  delayMs: 1000,        // Initial delay (1s)
  backoffFactor: 2,     // Exponential: 1s, 2s, 4s, ...
  onRetry: (error, attempt, wait) => { ... }
});
```

Each phase has its own retry config:
- **Litecard**: 3 retries, 1s initial delay
- **Salesforce**: 2 retries, 750ms initial delay
- **Postmark**: 3 retries, 1s initial delay

All retries are logged to `logs/web-YYYY-MM-DD.log`.

### 4. Batch Processing with Concurrency Control

`lib/server/process-batch.js`:
- Creates a limiter queue with configurable `WORKER_CONCURRENCY` (default: 5)
- Processes records in parallel up to the limit
- No Promise.all() on full list (avoids memory spikes on large batches)
- Returns detailed per-record results with pass links or errors

**Large File Handling**:
- Client-side chunking: Splits CSV uploads into chunks of `MAX_BATCH_SIZE`
- Sequential chunk processing: Submits chunks one at a time via `/api/cards/process`
- Aggregates results and tracks progress for UI

### 5. CSV Parsing (RFC 4180 Compliant)

`lib/shared/csv.js`:
- Handles quoted fields and escaped quotes (`""`)
- Validates balanced quotes before processing (prevents malformed data)
- Strips BOM from header line
- Normalizes line endings (`\r\n`, `\r` -> `\n`)

### 6. Record Validation & Normalization

`lib/shared/records.js`:
- Required fields: `id`, `firstName`, `lastName`, `email`, `memberId`
- Whitespace trimming on all fields
- Email pattern validation: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Empty records are filtered out silently
- Custom `ValidationError` class for client feedback

### 7. Logging Strategy

`lib/server/log.js`:
- Appends to `logs/web-YYYY-MM-DD.log` (one file per day)
- Includes ISO timestamp, message, and optional JSON data
- Also logs to stdout (console)
- Auto-creates `logs/` directory if missing

### 8. Email Orchestration

For batch/manual processing (`process-record.js`):
- Creates single Litecard pass
- Updates Salesforce with pass ID
- Sends single loyalty email

For Salesforce webhook (`sendSalesforceLitecardEmailsWithRetry`):
- Creates Litecard pass
- Sends welcome template email (with app store links)
- Sends loyalty template email (with wallet links)
- Both emails have independent retry logic

## Client-Side UI (React 19)

`components/admin-dashboard.js`:

**Features**:
- Dual-mode input: Manual entry (form rows) or CSV upload
- Real-time row management (add 1/5, remove individual)
- CSV parsing validation (headers check, sanitization)
- Live batch processing with chunking progress
- Results modal showing per-record success/failure with pass links
- Fetches server config on mount (max batch size, required fields, concurrency)

**State Management**:
- `rows`: Array of draft records (client-side state)
- `csvUpload`: Parsed CSV data (fileName + records)
- `results`: Detailed batch results for modal display
- `processingStatus`: Live progress (current chunk, processed count)
- Tab switching between manual/CSV modes

**Data Flow**:
1. User enters records or uploads CSV
2. Client validates and chunks data
3. Submits chunks sequentially to `/api/cards/process`
4. Displays results in modal with per-record details
5. Admin can retry failures by re-uploading CSV or copying failed rows

## Deployment (AWS Amplify)

`amplify.yml` configures the build:
- Writes `LITECARD_*`, `SF_*`, `POSTMARK_*`, `WORKER_CONCURRENCY`, `MAX_BATCH_SIZE` to `.env.production` before build
- Runs `npm run build`
- Starts app with `npm start`

**Security Note**: Admin UI must be protected at hosting layer (auth, IP whitelist, VPN, etc.).

## Notable Implementation Details

### No Default Export in Shared Modules
- `lib/shared/records.js` and `lib/shared/csv.js` use named exports only
- Prevents accidental bundling of server-only code

### Postmark Template Variables
- **Loyalty email**: `litecard_apple_url`, `litecard_google_url`, `litecard_download_url` (optional)
- **Welcome email**: `setpasswordlink`, `appstorelink`, `playstorelink` (hardcoded)

### Error Handling Strategy
- `ValidationError`: 400 status (client-side fix needed)
- `UnauthorizedError`: 401 status (auth header required)
- Generic errors: 500 status (server logging provided)
- Partial failures on multi-chunk uploads show processed + failed results

### Legacy Files Still Present
- `index.js`, `handler.js`, `lite-card.js`, `post-mark.js`, `sales-force.js`, `logger.js`, `parseCSV.js`, `retry.js`, `progress-tracker.js`
- These are from the original CSV-driven Node script
- Only `npm run legacy:csv` uses them; web app uses `lib/` modules

## Security Considerations

1. **Admin UI Protection**: Protect at hosting layer (not built-in auth)
2. **Environment Secrets**: SF_JWT_SECRET_KEY requires newline-escaped format
3. **CORS & CSRF**: Same-origin validation on batch endpoint
4. **Webhook Auth**: SF_WEBHOOK_SECRET via Bearer token or x-api-key header
5. **No Server-Side Session**: Stateless batch processing (safe for horizontal scaling)
6. **Security Headers**: Applied via middleware (no-cache, no-frame-options, nosniff, no-referrer)

## Testing Entry Points

- `GET /api/cards/process` - Test config availability
- `POST /api/cards/process` with test records - End-to-end batch flow
- Manual form entry in UI - Client-side validation
- CSV upload with malformed data - CSV parser error handling
- Large CSV (> MAX_BATCH_SIZE) - Chunking behavior
