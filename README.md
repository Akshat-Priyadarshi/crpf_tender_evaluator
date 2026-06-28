# CRPF Tender Evaluation Platform

> **AI-Based Tender Evaluation & Eligibility Analysis for Government Procurement**  
> Decision-Support Platform for CRPF · Round 1 Proposal · Team Conviction  
> Indian Institute of Technology Kharagpur

---

## Table of Contents

1. [What We Are Building](#1-what-we-are-building)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Part 1 — Backend: Layer 1 Secure Ingestion](#5-part-1--backend-layer-1-secure-ingestion)
   - [Prerequisites](#prerequisites)
   - [Environment Setup](#environment-setup)
   - [Boot the Infrastructure](#boot-the-infrastructure)
   - [Verification Checklist](#verification-checklist)
   - [API Reference](#api-reference)
6. [Part 2 — Frontend: Next.js Dashboard](#6-part-2--frontend-nextjs-dashboard)
   - [Prerequisites](#prerequisites-1)
   - [Setup](#setup)
   - [Pages & Routes](#pages--routes)
   - [Authentication](#authentication)
7. [End-to-End Test Walkthrough](#7-end-to-end-test-walkthrough)
8. [Design Philosophy](#8-design-philosophy)
9. [Database Schema](#9-database-schema)
10. [Troubleshooting](#10-troubleshooting)
11. [Team & Division of Work](#11-team--division-of-work)
12. [Roadmap — Layers 2–7](#12-roadmap--layers-27)

---

## 1. What We Are Building

Most hackathon solutions treat this as a "document Q&A" problem. It is not. This is an **explainable, auditable, adversarial-robust decision-support problem** inside a regulated procurement workflow.

The platform:
- Extracts eligibility criteria from tender documents
- Parses heterogeneous bidder submissions (scanned PDFs, photographs, Excel, Hindi certificates)
- Produces explainable, criterion-level verdicts
- Preserves a **courtroom-grade audit trail** defensible under CVC audit or judicial review
- Keeps the procurement officer in authority at every step — the AI supports, never decides

Six core commitments:
1. Reduce evaluation time from days to hours, without reducing rigour
2. Produce identical verdicts when the same bid is evaluated twice on the same system version
3. Zero silent rejections — every borderline case is escalated, never buried
4. Every verdict traces to: which criterion → which document → which page → which value → which rule → which confidence
5. Work on scanned, photographed, handwritten, bilingual, and stamped Indian documents
6. Be auditable years later — the full decision trail must be reproducible bit-for-bit

---

## 2. System Architecture

```
L7  Reporting, Audit Trail, RTI-Ready Export
L6  Human-in-the-Loop Console (review, override, sign-off)
L5  Evaluation Engine — Hybrid (deterministic rules + LLM judgment)
L4  Matching Layer — Criterion ←→ Evidence Graph
L3  L3a: Tender Criterion Extractor | L3b: Bidder Evidence Extractor
L2  Document Processing — OCR, Layout, Table, Stamp, Signature, QR
L1  Secure Ingestion — hashing, virus scan, classification, vault     ← BUILT ✅
```

**Cross-cutting concerns:**
- `Immutable Audit Ledger` — hash-chained, append-only, touches every layer
- `External Verification APIs` — GSTN, MCA21, ICAI UDIN, DigiLocker

**Current build status:**
- ✅ Layer 1 — Secure Ingestion (Backend + Frontend)
- ✅ Frontend Dashboard — Criterion Evaluation View + Committee Grid
- 🔄 Layer 2 — Document Processing (planned)
- 🔄 Layers 3–7 — Planned

---

## 3. Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| Backend API | Python 3.10 + FastAPI + Uvicorn | High-performance async, clean OpenAPI docs |
| Database | PostgreSQL 15 (Alpine) | Append-only audit ledger, relational RBAC |
| Virus Scanner | ClamAV (Official Docker Image) + pyclamd | Real scan, not mocked — proves security |
| Hashing | Python `hashlib` SHA-256 | Document identity, deduplication |
| ORM | SQLAlchemy 2.0 | Type-safe DB access |
| Orchestration | Docker + Docker Compose | Identical local and cloud VM behaviour |
| Frontend | Next.js 16 (App Router) + TypeScript | SSR, file-based routing, Edge middleware |
| Styling | Tailwind CSS + CSS custom properties | Design tokens, dark/light mode |
| HTTP Client | Axios | Promise-based, interceptor support |
| Auth | Cookie-based (`crpf_auth`) + Next.js proxy middleware | Edge-runtime route protection |

---

## 4. Project Structure

```
crpf_tender_evaluator/
│
├── docker-compose.yml              ← Wires PostgreSQL + ClamAV + FastAPI
├── .env                            ← Environment secrets (never commit)
├── .env.example                    ← Template — copy to .env
│
├── infra/
│   └── init.sql                    ← PostgreSQL schema (3 tables, auto-runs on first boot)
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                     ← FastAPI app entry point
│   ├── models/
│   │   └── db.py                   ← SQLAlchemy ORM models
│   ├── routers/
│   │   └── ingest.py               ← POST /api/v1/ingest endpoint
│   └── services/
│       ├── virus_scanner.py        ← ClamAV TCP scan
│       ├── hasher.py               ← SHA-256 + dedup check
│       ├── classifier.py           ← Three-tier document classifier
│       ├── vault.py                ← RBAC-enforced file write
│       └── audit.py               ← Hash-chained ledger writer
│
└── frontend/
    ├── proxy.ts                    ← Next.js Edge middleware (route protection)
    ├── app/
    │   ├── layout.tsx              ← Root layout + Navbar
    │   ├── globals.css             ← Design tokens (CSS variables)
    │   ├── page.tsx                ← Dashboard (/)
    │   ├── login/page.tsx          ← Login page (/login)
    │   ├── upload/page.tsx         ← Document ingestion (/upload)
    │   ├── evaluate/page.tsx       ← 3-panel criterion view (/evaluate)
    │   └── committee/page.tsx      ← Committee grid (/committee)
    └── components/
        └── Navbar.tsx              ← Sticky navigation bar
```

---

## 5. Part 1 — Backend: Layer 1 Secure Ingestion

### Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose v2 (included with Docker Desktop)
- At least **6GB RAM** available to Docker (ClamAV alone needs 1–2GB for virus definitions)
- Ports `5432`, `8000` free on your machine

### Environment Setup

```bash
# From the project root (crpf_tender_evaluator/)
cp .env.example .env
```

Edit `.env` and set your passwords:

```dotenv
POSTGRES_USER=crpf
POSTGRES_PASSWORD=your_strong_password_here
POSTGRES_DB=crpf_ingestion
SECRET_KEY=generate_with_python_secrets_token_hex_32
```

Generate a strong secret key:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### Boot the Infrastructure

```bash
# From crpf_tender_evaluator/ (where docker-compose.yml lives)
docker compose up -d --build
```

** CRITICAL — Wait for ClamAV on first boot:**

ClamAV downloads ~250MB of virus definitions on first startup. This takes 2–5 minutes. Do not proceed until it's ready.

```bash
# Watch ClamAV startup progress
docker logs -f crpf_clamav
```

Wait until you see this exact line:
```
socket found, clamd started.
```

Then press `Ctrl+C` to stop following logs.

### Verification Checklist

Run each check in order. All must pass before moving to the frontend.

**Check 1 — All three containers are running:**
```bash
docker compose ps
```
Expected output:
```
NAME             STATUS
crpf_fastapi     Up
crpf_postgres    Up (healthy)
crpf_clamav      Up
```

**Check 2 — FastAPI health endpoint:**
```bash
curl http://localhost:8000/
```
Expected response:
```json
{
  "status": "Layer 1 Ingestion API is LIVE",
  "platform": "CRPF Tender Evaluation Platform",
  "layer": "Layer 1 — Secure Ingestion"
}
```
Or open `http://localhost:8000` in your browser.

**Check 3 — Swagger UI is accessible:**

Open `http://localhost:8000/docs` in your browser. You should see the interactive API documentation with the `POST /api/v1/ingest` endpoint listed.

**Check 4 — Audit chain is intact:**
```bash
curl http://localhost:8000/api/v1/audit/verify
```
Expected response:
```json
{
  "valid": true,
  "total_entries": 1,
  "broken_at_id": null,
  "message": "Audit chain intact. All entries verified."
}
```

**Check 5 — PostgreSQL has all 3 tables:**
```bash
docker exec crpf_postgres psql -U crpf -d crpf_ingestion -c "\dt"
```
Expected output:
```
          List of relations
 Schema |    Name      | Type  | Owner
--------+--------------+-------+-------
 public | audit_ledger | table | crpf
 public | documents    | table | crpf
 public | vault_access | table | crpf
```

**Check 6 — Upload a real file (the full pipeline test):**
```bash
# Upload any PDF from your machine
curl -X POST http://localhost:8000/api/v1/ingest \
  -F "file=@/path/to/any/document.pdf" \
  -F "tender_id=TENDER_CRPF_2026_034" \
  -F "actor_role=officer"
```

Expected `201` response:
```json
{
  "status": "INGESTED",
  "document_hash": "a3f2b1...<64 hex chars>",
  "filename": "document.pdf",
  "vault_path": "TENDER_CRPF_2026_034/a3f2b1....pdf",
  "classification": {
    "doc_type": "tender",
    "classification_status": "confirmed",
    "confidence_tier": 1,
    "reason": "Tier 1 regex matched tender pattern in 'document.pdf'"
  },
  "virus_scan": "clean",
  "file_size_bytes": 12345
}
```

**Check 7 — Deduplication works (upload the same file again):**
```bash
# Run the exact same curl command again
curl -X POST http://localhost:8000/api/v1/ingest \
  -F "file=@/path/to/any/document.pdf" \
  -F "tender_id=TENDER_CRPF_2026_034" \
  -F "actor_role=officer"
```
Expected `200` response with `"status": "DUPLICATE"` — proving the SHA-256 dedup works.

**Check 8 — Virus scan rejects infected files (EICAR test):**
```bash
# Create the EICAR test file (safe — not a real virus)
echo 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > eicar.txt

curl -X POST http://localhost:8000/api/v1/ingest \
  -F "file=@eicar.txt"
```
Expected `406 Not Acceptable` response:
```json
{
  "detail": {
    "error": "VIRUS_DETECTED",
    "threat": "Eicar-Signature",
    "message": "File rejected. Threat detected by ClamAV."
  }
}
```

**Check 9 — Audit chain grows with each action:**
```bash
curl http://localhost:8000/api/v1/audit/verify
```
`total_entries` should now be higher than 1, and `valid` must still be `true`.

---

### API Reference

#### `POST /api/v1/ingest`

Ingests a single document through the full Layer 1 pipeline.

**Request** — `multipart/form-data`:

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File | ✅ | The document (PDF, JPG, PNG, TIFF, XLSX, DOCX) — max 50MB |
| `tender_id` | string | No | Portal-provided tender identifier |
| `bidder_id` | string | No | Portal-provided bidder identifier |
| `actor_role` | string | No | `officer` / `evaluator` / `admin` (default: `officer`) |
| `actor_id` | string | No | Session/user ID for audit trail |

**Response codes:**

| Code | Meaning |
|---|---|
| `201` | Document successfully ingested |
| `200` | Duplicate — document already exists |
| `406` | Virus detected or scan error — file rejected |
| `403` | RBAC permission denied for this tender |
| `413` | File exceeds 50MB limit |
| `500` | Internal error |

#### `GET /api/v1/audit/verify`

Walks the entire audit ledger and verifies the hash chain is unbroken. Use during CVC audit or to demonstrate tamper-evidence.

#### `GET /`

Health check. Returns platform status.

#### `GET /docs`

Interactive Swagger UI — test all endpoints from the browser.

---

## 6. Part 2 — Frontend: Next.js Dashboard

### Prerequisites

- Node.js 20+ installed locally, OR Docker (for WSL2 users)
- Backend must be running (`docker compose up -d`) before testing the upload page

### Setup

**Option A — Local Node.js:**
```bash
cd frontend
npm install
npm run dev
```

**Option B — Docker (recommended for WSL2 to avoid filesystem bottlenecks):**
```bash
# From crpf_tender_evaluator/ root
docker run --rm -it -v $(pwd)/frontend:/app -w /app node:20 npm install
cd frontend
npm run dev
```

Frontend runs at `http://localhost:3000`.

### Pages & Routes

| Route | Page | Description |
|---|---|---|
| `/login` | Login | Auth gate. Credentials: `CRPF-ADMIN` / `admin123` |
| `/` | Dashboard | Stats overview + layer status + quick navigation |
| `/upload` | Ingest Documents | Drag-drop upload → real-time pipeline animation → ingestion report |
| `/evaluate` | Criterion Evaluation | 3-panel view: bidder list + criterion table + evidence drill-down |
| `/committee` | Committee Grid | Full matrix: all bidders × all criteria with filter tabs |

### Authentication

Route protection is handled by `proxy.ts` (Next.js Edge Middleware). Every request to a protected route is checked for the `crpf_auth` cookie before the page loads.

**Login credentials for demo:**
```
Username: CRPF-ADMIN
Password: admin123
```

To log out, clear the `crpf_auth` cookie from browser DevTools → Application → Cookies.

**Note for teammates:** Replace the hardcoded credential check in `app/login/page.tsx` with a real API call when JWT auth is implemented. The cookie name and middleware check pattern are already in place.

---

## 7. End-to-End Test Walkthrough

Follow these steps in order to verify the complete system works:

**Step 1 — Start the backend:**
```bash
# From crpf_tender_evaluator/
docker compose up -d
docker logs -f crpf_clamav  # Wait for "socket found, clamd started."
```

**Step 2 — Start the frontend:**
```bash
cd frontend
npm run dev
```

**Step 3 — Open the app:**

Navigate to `http://localhost:3000`. You will be redirected to `/login`.

**Step 4 — Log in:**

Enter `CRPF-ADMIN` / `admin123`. Click **AUTHENTICATE**. You should land on the dashboard at `/`.

**Step 5 — Ingest a document:**

1. Click **Ingest Documents** in the navbar or on the dashboard card
2. Drag any PDF onto the dropzone
3. Enter `TENDER_CRPF_2026_034` in the Tender ID field
4. Leave Bidder ID blank
5. Keep Actor Role as `officer`
6. Click **INGEST DOCUMENT →**
7. Watch the 7-step pipeline animate: Receive → Scan → Hash → Dedup → Classify → Vault → Audit
8. Verify the green ingestion report appears with the SHA-256 hash, vault path, and classification

**Step 6 — Test deduplication:**

Upload the exact same file again. You should get an amber **DUPLICATE** response instantly.

**Step 7 — Explore the evaluation view:**

Navigate to `/evaluate`. Click different bidders in the left panel to switch between them. Click different criteria rows to update the evidence drill-down on the right. Try clicking **Override** — it will require a mandatory reason string before proceeding.

**Step 8 — Explore the committee grid:**

Navigate to `/committee`. Use the filter tabs (Mandatory Only, Financial, Technical, Compliance) to filter rows. Observe that the OVERALL row updates based on mandatory logic — any mandatory FAIL means overall FAIL.

**Step 9 — Verify the audit chain:**
```bash
curl http://localhost:8000/api/v1/audit/verify
```
Confirm `valid: true` and that `total_entries` reflects all the actions taken during your test.

---
## 8. Design Philosophy

### Paranoia Over Speed

The single biggest trade-off is speed vs paranoia. We consistently choose paranoia. A faster system that silently mis-qualifies a bidder is, in this domain, strictly worse than a slower system that escalates. Government procurement is an error-averse context.

### Zero Trust on Filenames

Filenames are **untrusted bidder input**. A file named `CA_Certificate.pdf` is not confirmed as a CA certificate — it could be anything. Our three-tier classifier:

1. **Tier 1 — Regex** on portal metadata (fastest, most reliable when portal conventions hold)
2. **Tier 2 — Keyword heuristics** on filename and metadata (fallback for ambiguous filenames)
3. **Tier 3 — PENDING_CONTENT_REVIEW** (file is safely vaulted; Layer 2 OCR will finalise classification)

### The Officer Is Always in Authority

The system is a decision-support tool. It must make the officer faster and more consistent without ever taking her authority away. Every verdict carries a mandatory "subject to officer sign-off" notice. Overrides are logged with a mandatory reason string — not silently dropped.

### Immutable Audit Trail

Every document hash, extraction, rule firing, verdict, and officer override is appended to a hash-chained ledger. Each entry references the SHA-256 of the previous entry. You cannot rewrite history without the chain breaking. This is the single feature that makes the system defensible years later under CVC audit or judicial review.

---

## 9. Database Schema

### `documents` table

Stores every successfully ingested document. The `document_hash` (SHA-256) is the primary identity — not the filename.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `document_hash` | VARCHAR(64) | SHA-256 hex — unique document identity |
| `original_filename` | TEXT | Untrusted bidder filename (stored for reference only) |
| `file_size_bytes` | BIGINT | File size |
| `doc_type` | VARCHAR(32) | `tender` / `bid` / `corrigendum` / `unknown` |
| `classification_status` | VARCHAR(32) | `confirmed` / `pending_content_review` |
| `bidder_id` | TEXT | Portal-provided bidder ID (NULL for tenders) |
| `tender_id` | TEXT | Portal-provided tender ID |
| `vault_path` | TEXT | Relative path inside evidence vault |
| `submitted_by_role` | VARCHAR(32) | RBAC role of uploader |
| `submitted_at` | TIMESTAMPTZ | Submission timestamp |
| `virus_scan_result` | VARCHAR(16) | `clean` / `infected` / `error` |

### `audit_ledger` table

Hash-chained, append-only. Protected by `NO DELETE` and `NO UPDATE` rules at the PostgreSQL level.

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL | Monotonic sequence |
| `entry_uuid` | UUID | Unique entry identifier |
| `previous_entry_hash` | VARCHAR(64) | SHA-256 of previous row — forms the chain |
| `action` | VARCHAR(64) | Action constant (see below) |
| `document_hash` | VARCHAR(64) | Document this action relates to |
| `actor_role` | VARCHAR(32) | Who performed the action |
| `detail` | JSONB | Flexible payload per action type |
| `occurred_at` | TIMESTAMPTZ | When it happened |

**Action constants:** `FILE_RECEIVED` → `VIRUS_SCAN_STARTED` → `VIRUS_SCAN_CLEAN` / `VIRUS_SCAN_INFECTED` → `HASH_COMPUTED` → `DUPLICATE_DETECTED` / `CLASSIFIED` → `VAULT_WRITTEN` → `FILE_INGESTED`

### `vault_access` table

RBAC: which roles can access which tender's documents.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `tender_id` | TEXT | Tender identifier (`*` = wildcard for admin) |
| `role` | VARCHAR(32) | `officer` / `evaluator` / `admin` |
| `granted_by` | TEXT | Who granted this access |
| `granted_at` | TIMESTAMPTZ | When access was granted |
| `expires_at` | TIMESTAMPTZ | NULL = no expiry |

---

## 10. Troubleshooting

### `FATAL: database "crpf" does not exist`
Your `.env` file has mismatched values. Ensure `POSTGRES_DB=crpf_ingestion` and run:
```bash
docker compose down -v
docker compose up -d --build
```

### `ModuleNotFoundError: No module named 'clamd'`
Your `requirements.txt` has `pyclamd` but the code imports `clamd`. Verify `requirements.txt` contains `pyclamd==0.4.0` (not `python-clamd`). Then force rebuild:
```bash
docker compose down
docker compose up -d --build --no-cache
```

### ClamAV never says "socket found, clamd started"
This is normal on slow connections — definitions are ~250MB. Wait up to 10 minutes. Check progress:
```bash
docker logs -f crpf_clamav
```

### FastAPI starts but `/docs` shows no routes
The old dummy `main.py` is still in your `backend/` folder. Verify `backend/main.py` imports from `routers.ingest` and `services.*`. Check:
```bash
docker exec crpf_fastapi ls -la /app/routers /app/services
```

### Next.js 404 after login
Ensure `proxy.ts` (not `middleware.ts`) exists in the `frontend/` root. Next.js 16 uses `proxy.ts` as the middleware convention. Run:
```bash
ls -la frontend/proxy.ts
```

### Upload page cannot reach the backend
CORS is configured for `localhost:3000` in `backend/main.py`. Ensure both frontend (`npm run dev`) and backend (`docker compose up`) are running simultaneously. Check browser DevTools → Network for CORS errors.

### `docker compose` vs `docker-compose`
This project uses Docker Compose V2 (`docker compose` with a space). If you get `command not found`, update Docker Desktop or install the Compose plugin.

---

## 11. Team & Division of Work

| Member | Responsibility |
|---|---|
| **Akshat Priyadarshi** | Layer 1 Backend (Secure Ingestion), Frontend Dashboard |
| **Saksham Sinha** | Layer 2 (Document Processing — OCR, Layout) |
| **Jasmeet Singh Chadda** | Layer 3-4(Criterion & Evidence Extraction, Evidence Graph) |
| **Rudra Pratap** | Layers 5 (Evaluation Engine) |

---

## 12. Roadmap — Layers 2–7

### Layer 2 — Document Processing (Next)

**Owner:** Saksham Sinha

Pipeline: Raw Document → Deskew & Denoise → Orientation Detection → OCR → Layout → Table Extraction → Stamp & Signature Detection → QR/Barcode Reader

Output: `(document_hash, page, bbox, value, confidence, extraction_method)` tuple per extracted value

Key tools:
- Primary OCR: `docTR` or `PaddleOCR` (open-source, on-prem, CPU-friendly)
- Layout: `LayoutLMv3` or `Donut`
- Tables: `Camelot` + `TableTransformer`
- Stamp/Signature: YOLO-based detection head
- QR: Native decoder + live GSTN/ICAI/DigiLocker verification

Integration point: Layer 2 also finalises `classification_status` for documents flagged `pending_content_review` by Layer 1 — completing the three-tier classifier handoff.

### Layer 3 — Criterion & Evidence Extraction

**Owner:** Rudra Pratap

3a — Tender Criterion Extractor: Outputs structured Criterion DNA schema (see proposal Section 6)
3b — Bidder Evidence Extractor: Criterion-driven extraction with dual-path (regex + LLM) and disagreement escalation

### Layers 4–5 — Evidence Graph & Evaluation Engine

**Owner:** Akshat Priyadarshi

Layer 4: Bipartite weighted Evidence Graph — criterion nodes ↔ evidence nodes, weighted edges, satisfaction threshold at 1.0
Layer 5: Hybrid engine — deterministic rules for ~80% of criteria, LLM-backed judgment only for semantic similarity and ambiguous cases. Confidence-gated routing with isotonic regression calibration.

### Layer 6 — Human-in-the-Loop Console

Connects to the existing `/evaluate` and `/committee` frontend pages. Replace mock data with real API calls once Layers 3–5 are complete.

### Layer 7 — Reporting & RTI Export

One-button RTI-disclosable PDF per bidder — redacted of other bidders' commercial data, complete audit trail, clean of internal scratch-work.

---

> **Every verdict is subject to procurement officer sign-off.**  
> This system is a decision-support tool, not a decision-maker.  
> Prepared for Round 1 Submission · Team Conviction · IIT Kharagpur
