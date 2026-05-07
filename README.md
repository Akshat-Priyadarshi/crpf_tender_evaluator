# CRPF Tender Evaluator - Full Project Documentation

This document contains the complete documentation for the Layer 1 Secure Ingestion Backend, followed by the exact setup instructions and initial codebase for the Next.js Frontend.

---

## PART 1: Secure Ingestion Engine (Layer 1 Backend)

Built with a **"Zero Trust"** and **"Paranoia Over Speed"** philosophy, this microservice architecture ensures that no unverified vendor document touches the main processing pipeline or the server's hard drive without strict security and cryptographic checks.

### 🏗️ Architecture & Core Features

- **FastAPI Gateway:** High-performance async API that holds incoming `multipart/form-data` strictly in memory.
- **Real ClamAV Daemon:** Documents are streamed directly to an isolated ClamAV Docker container via TCP socket. If an infection is found, the system fails secure (`406 Not Acceptable`) before any disk write occurs.
- **Cryptographic Deduplication:** Generates a SHA-256 hash of the file bytes. Prevents processing the exact same document twice, saving heavy Layer 2 ML resources.
- **Flexible Heuristic Classifier:** Uses regex patterns against portal metadata and chaotic vendor filenames to tag documents (e.g., `TENDER_RULESET`, `BID_SUBMISSION`, or `PENDING_CONTENT_REVIEW`).
- **Secure Evidence Vault:** Clean files are sealed in a mounted Docker volume, permanently renamed to their SHA-256 hash.
- **Immutable Audit Ledger (PostgreSQL):** Every ingestion event is written to a relational database. To make it tamper-evident, each row mathematically locks the previous row in place using a `previous_hash` column, creating a blockchain-style chain of custody.

### 🛠️ Technology Stack

- **Backend:** Python 3.10, FastAPI, Uvicorn, SQLAlchemy
- **Database:** PostgreSQL 15 (Alpine)
- **Security:** ClamAV (Official Docker Image), `pyclamd`, Python `hashlib` (SHA-256)
- **Orchestration:** Docker & Docker Compose

### 🚀 Deployment & Replication Steps

**1. Build and Start the Infrastructure**
From the root directory containing the `docker-compose.yml`, run:

```bash
docker compose up -d --build
```

_CRITICAL NOTE ON STARTUP:_ The infrastructure utilizes a _real_ ClamAV daemon. Upon the first boot, the `clamav` container will download the latest virus definitions (~1GB). Monitor the startup progress by running: `docker logs -f crpf_clamav`. The system is fully armed once you see: `socket found, clamd started.`

**2. Verify the Services**

- **Swagger API Documentation:** Navigate to `http://localhost:8000/docs`
- **Database:** The PostgreSQL container automatically provisions the `audit_ledger` and `vault_access` tables on startup.

### 🔌 API Usage (`POST /api/v1/ingest`)

**cURL Request:**

```bash
curl -X 'POST' \
  'http://localhost:8000/api/v1/ingest' \
  -H 'accept: application/json' \
  -H 'Content-Type: multipart/form-data' \
  -F 'file=@sample_document.pdf;type=application/pdf'
```

**Success Response (200 OK):**

```json
{
  "status": "success",
  "message": "File securely ingested and vaulted.",
  "data": {
    "original_filename": "sample_document.pdf",
    "document_hash": "3957ee9d5415e40023da27188db57e057aec941b4e826425d442fe0189b336b7",
    "classification": "PENDING_CONTENT_REVIEW",
    "vault_path": "/evidence_vault/3957ee9d5415e40023da27188db57e057aec941b4e826425d442fe0189b336b7.pdf"
  }
}
```

---

## PART 2: Next.js Frontend Setup (WSL-Optimized)

Due to known WSL2 filesystem I/O bottlenecks when writing thousands of `node_modules` files to a mounted Windows drive (`/mnt/e/`), we use Docker to securely bypass the network and file translation layers during setup.

### 1. Initialize Next.js via Docker

Run this from your root `crpf_tender_evaluator` folder. It creates the `frontend` directory safely.

```bash
docker run --rm -it -v $(pwd):/app -w /app node:20 npx create-next-app@latest frontend --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```

### 2. Install Dashboard Dependencies

We require specific libraries for state management (`zustand`) and UI components (`lucide-react`, `clsx`, `tailwind-merge`). Run this to install them into the new `frontend` folder:

```bash
docker run --rm -it -v $(pwd)/frontend:/app -w /app node:20 npm install zustand axios lucide-react clsx tailwind-merge
```

### 3. Start the Development Server

Navigate into the frontend folder and spin up the local server:

```bash
cd frontend
npm run dev
```

_(Application will be available at `http://localhost:3000`)_

---

## PART 3: Frontend Codebase Initialization

### The Global State Manager (Zustand)

To handle the complex 3-pane synced UI without re-rendering the entire page, we use Zustand as our global "Brain".

**File:** `frontend/store/useDashboardStore.ts`

```typescript
import { create } from "zustand";

// Define the shape of our data based on the UI mockups
export type Verdict = "PASS" | "FAIL" | "REVIEW";

export interface Criterion {
  id: string; // e.g., "C-05"
  name: string; // e.g., "Net worth positive in last FY"
  verdict: Verdict;
  confidence: number;
  evidenceText: string;
}

export interface Bidder {
  id: string; // e.g., "B-01"
  name: string; // e.g., "ABC Constructions Pvt Ltd"
  overallVerdict: Verdict;
  overallScore: number;
  criteria: Criterion[];
}

interface DashboardState {
  bidders: Bidder[];
  selectedBidderId: string | null;
  selectedCriterionId: string | null;

  // Actions
  setBidders: (bidders: Bidder[]) => void;
  setSelectedBidder: (id: string) => void;
  setSelectedCriterion: (id: string) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  bidders: [],
  selectedBidderId: null,
  selectedCriterionId: null,

  setBidders: (bidders) => set({ bidders }),

  setSelectedBidder: (id) =>
    set({
      selectedBidderId: id,
      // Reset the criterion when a new bidder is selected
      selectedCriterionId: null,
    }),

  setSelectedCriterion: (id) => set({ selectedCriterionId: id }),
}));
```

```</DashboardState>

```
