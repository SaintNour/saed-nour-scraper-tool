# 🧠 Analyzer

A full-stack YouTube and social content scraper + intelligence system that analyzes content sentiment, tracks watch history, monitors watchlists, and generates structured insights using both heuristic logic and optional AI augmentation.

Built as a **monorepo** with an **Express.js backend API** and a **SvelteKit frontend dashboard**, designed for scalable content ingestion, analysis, and enterprise-grade intelligence workflows.

---

# 🌐 Overview

Analyzer is a data scraping and intelligence system that processes:
- YouTube content metadata
- Social/media review data
- Search queries and history
- Watchlist tracking and monitoring feeds

It generates:
- 📊 Sentiment insights
- 🧠 Content classification
- 📈 Historical trend analysis
- 🔍 Structured intelligence reports

---

# 🏗️ Architecture

- **Backend:** Express.js (Node.js)
- **Frontend:** SvelteKit
- **Storage:** Local JSON-based persistence layer
- **AI Layer:** Optional OpenAI integration with heuristic fallback system

The system is designed for modular scaling, allowing each layer (scraping, analysis, UI) to evolve independently.

---

# 📦 Project Structure

```text
.
├── index.js              # API entry point
├── src/
│   ├── app.js            # Express app initialization & routing
│   ├── config/           # Environment & AI configuration
│   ├── routes/           # API route handlers
│   ├── services/         # Core business logic (scraping, analysis, aggregation)
│   └── utils/            # Shared helper utilities
├── scripts/              # Maintenance and verification scripts
├── data/                 # Local JSON storage (history, monitoring, logs)
└── web/                  # SvelteKit frontend dashboard
    └── src/
        ├── routes/       # UI pages
        └── lib/
            ├── components/   # UI components
            ├── services/api/ # Frontend API layer
            ├── stores/       # State management
            ├── types/        # Type definitions
            └── utils/        # Shared frontend utilities
```

---

# ⚙️ Requirements

- Node.js 18+
- YouTube Data API key
- OpenAI API key (optional — system works with fallback heuristics)

---

# 🚀 Setup

## 1. Clone repository

```bash
git clone https://github.com/yourusername/analyzer.git
cd analyzer
```

## 2. Environment setup

```bash
cp .env.example .env
```

Configure required keys inside `.env`.

> ⚠️ Only the root `.env` file is used by the backend.

---

## 3. Install dependencies

```bash
npm install
npm install --prefix web
```

---

# 🧪 Running the Project

## 🔥 Full Development Mode

```bash
npm run dev:all
```

- Frontend: http://localhost:5173/
- API: http://localhost:3000/

---

## ⚙️ Backend Only

```bash
npm start
```

---

## 🏗️ Production Mode

```bash
npm run host
```

---

# 📜 Scripts

| Command | Description |
|--------|-------------|
| `npm start` | Start API server |
| `npm run dev:all` | Run full-stack development environment |
| `npm run build:web` | Build frontend |
| `npm run host` | Production-style deployment |
| `npm run test:local-sentiment` | Validate sentiment engine |
| `npm run test:dashboard-intelligence` | Validate analytics pipeline |

---

# 🔌 API Reference

## Core Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/reviews?query=` | Run full content analysis |
| `GET /api/history` | Retrieve search history |
| `GET /api/monitoring/tracks` | Get watchlist tracking data |

---

## Legacy Routes

For backward compatibility:
- `/reviews`
- `/history`
- `/monitoring`

---

# 🧠 Core Features

## 📊 Sentiment Intelligence Engine
Hybrid system combining:
- Heuristic analysis
- Optional AI-based classification
- Fallback scoring for offline resilience

## 🔍 Scraping & Ingestion Layer
- YouTube Data API integration
- Query-based content extraction
- Structured metadata parsing

## 📈 Monitoring System
- Track channels and content sources
- Detect updates over time
- Store historical snapshots

## 🧾 Persistent Data Layer
Local JSON storage for:
- Search history
- Monitoring state
- System logs

---

# 🧩 Frontend Dashboard (SvelteKit)

A modular analytics interface featuring:
- Search & analysis interface
- Watchlist monitoring dashboard
- Historical insights views
- Sentiment breakdown panels

---

# 🔄 Shared Logic

The following modules are shared between backend and frontend:

- `dateRange` utilities
- `htmlEntities` decoding functions

These must remain synchronized to ensure consistent analysis output across the system.

---

# 💾 Data Storage

Runtime data is stored in `/data`:
- `history.json`
- `monitoring.json`
- `openai-usage.json`

These files are:
- Auto-generated on first run
- Excluded from version control
- Safe to reset at any time

---

# 🔐 Security & Architecture Notes

- API keys must remain server-side only
- `.env` must never be committed
- AI layer is optional by design
- System degrades safely using heuristics if external APIs are unavailable

---

# 📈 Future Improvements

Planned upgrades:
- PostgreSQL / cloud database migration
- Multi-platform scraping (Reddit, TikTok, X)
- Real-time ingestion pipelines
- Advanced AI classification layer
- Authentication system
- Role-based dashboards
- Exportable analytics reports (PDF/CSV)

---

# 📄 License

## 🔒 Proprietary Software License

Copyright © 2026. All rights reserved.

This software is proprietary and confidential.

No part of this project may be copied, modified, distributed, sublicensed, or used for commercial purposes without explicit written permission from the author.

This includes:
- Source code
- Algorithms and scraping logic
- Analysis pipelines
- UI/UX design and architecture
- Data processing systems

Permission is granted only for:
- Private evaluation
- Portfolio review
- Technical assessment by prospective employers or authorized partners

Unauthorized use is strictly prohibited.

---

## 🏢 Enterprise Use Notice

This system is designed and implemented for enterprise-grade data processing and analytics workflows.

It is currently used in production environments within the automotive industry (including deployment at Detroit Axle) for content and data intelligence operations.

The system is built to support scalable ingestion, monitoring, and analysis pipelines suitable for commercial-grade workloads.

Deployment in additional enterprise environments is available under formal licensing agreement.

---

# 👨‍💻 Author

Saed Nour

Specialized in:
- Full-stack system architecture
- Data scraping & ingestion systems
- Real-time analytics dashboards
- AI-assisted content intelligence platforms

---

# 🚀 Project Goal

Analyzer transforms raw video and social data into structured intelligence through scalable backend architecture and modern frontend visualization systems.