# ShortsForge

**From script to reel in minutes.** AI-powered faceless video generation platform with OpenAI Sora integration.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Deployment](#deployment)
- [Contributing](#contributing)

---

## Features

- **AI Video Generation** — Create faceless shorts from text concepts or custom scripts
- **OpenAI Sora Integration** — Generate, edit, extend, and remix videos with Sora
- **Multiple AI Providers**
  - **LLM:** OpenAI, Groq, OpenRouter
  - **Images:** Replicate, FAL, Together, Runware, Pollinations, OpenAI DALL-E
  - **Voice/TTS:** Edge TTS, OpenAI TTS, ElevenLabs
- **FFmpeg Rendering Pipeline** — Direct FFmpeg with filter_complex for transitions, ASS subtitles, hardware acceleration
- **Real-time Progress** — WebSocket-based progress updates for all generation flows
- **Scene Editor** — Visual scene management with drag-and-drop reordering
- **Batch Processing** — Generate multiple videos concurrently via Redis queue
- **Hybrid Mode** — Mix AI images and Sora video clips in one production
- **Flexible Storage** — Local filesystem or S3/MinIO for media storage

---

## Tech Stack

| Layer | Technologies |
|-------|---------------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Zustand, Framer Motion |
| **Backend** | Python 3.12+, FastAPI, SQLAlchemy 2, Pydantic |
| **Database** | PostgreSQL (or SQLite / MySQL via config) |
| **Queue & Cache** | Redis |
| **Storage** | Local filesystem or S3/MinIO |
| **Video** | FFmpeg |
| **AI** | OpenAI (GPT, Sora, TTS, Whisper, DALL-E), Groq, OpenRouter, Replicate, FAL, Together, Runware, ElevenLabs, Edge TTS |

---

## Prerequisites

- **Python** 3.12+
- **Node.js** 18+
- **FFmpeg** — installed and available in `PATH`
- **PostgreSQL** 16 (or use SQLite for development)
- **Redis** (optional — for background jobs and real-time progress)
- **MinIO** (optional — for S3-compatible storage; can use local filesystem instead)

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/your-username/shortsforge.git
cd shortsforge
```

### 2. Start infrastructure (PostgreSQL, Redis, MinIO)

Using Docker Compose:

```bash
docker-compose up -d
```

This starts:
- **PostgreSQL** on `localhost:5432`
- **Redis** on `localhost:6379`
- **MinIO** on `localhost:9000` (API) and `localhost:9001` (Console)

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and add your API keys (see [Configuration](#configuration)).

### 4. Run the application

**Windows:**

```bash
run.bat
```

**Or run backend and frontend separately:**

**Backend:**
```bash
run_backend.bat
```
Or manually:
```bash
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r backend\requirements.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend:**
```bash
run_frontend.bat
```
Or manually:
```bash
cd frontend
npm install
npm run dev
```

### 5. Open the app

- **Frontend:** http://localhost:3000
- **API Docs:** http://localhost:8000/docs
- **MinIO Console:** http://localhost:9001 (if using S3 storage)

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key (GPT, Sora, TTS, DALL-E) | — |
| `OPENAI_BASE_URL` | OpenAI-compatible API base URL | `https://api.openai.com/v1` |
| `GROQ_API_KEY` | Groq API key (LLM) | — |
| `OPENROUTER_API_KEY` | OpenRouter API key (LLM) | — |
| `ELEVENLABS_API_KEY` | ElevenLabs API key (TTS) | — |
| `REPLICATE_API_KEY` | Replicate API key (images) | — |
| `FAL_API_KEY` | FAL API key (images) | — |
| `TOGETHER_API_KEY` | Together AI API key (images) | — |
| `RUNWARE_API_KEY` | Runware API key (images) | — |
| `DATABASE_URL` | Database connection string | PostgreSQL (see `.env.example`) |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379/0` |
| `STORAGE_BACKEND` | `local` or `s3` | `s3` |
| `S3_ENDPOINT_URL` | MinIO/S3 endpoint | `http://localhost:9000` |
| `S3_ACCESS_KEY` | S3 access key | `minioadmin` |
| `S3_SECRET_KEY` | S3 secret key | `minioadmin` |
| `S3_BUCKET` | S3 bucket name | `shortsforge` |
| `MEDIA_DIR` | Local media directory (when `STORAGE_BACKEND=local`) | `./media` |
| `FFMPEG_PATH` | Path to FFmpeg executable | `ffmpeg` |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | `http://localhost:3000` |

### Database options

- **PostgreSQL:** `postgresql+asyncpg://user:pass@localhost:5432/shortsforge`
- **SQLite:** `sqlite+aiosqlite:///./shortsforge.db`
- **MySQL:** `mysql+asyncmy://user:pass@localhost:3306/shortsforge`

---

## Project Structure

```
ShortsForge/
├── backend/
│   ├── main.py              # FastAPI entry point
│   ├── config.py            # Settings (pydantic-settings)
│   ├── database.py          # SQLAlchemy async engine
│   ├── models/              # SQLAlchemy models
│   ├── schemas/             # Pydantic request/response schemas
│   ├── api/                 # API route handlers
│   │   ├── projects.py      # Project CRUD
│   │   ├── generation.py   # Video generation
│   │   ├── sora.py         # Sora API
│   │   ├── images.py       # Image generation
│   │   ├── audio.py        # TTS
│   │   ├── scripts.py      # Script extraction
│   │   ├── settings.py     # App settings
│   │   ├── templates.py    # Project templates
│   │   ├── websocket.py    # Real-time progress
│   │   └── media.py        # Media serving
│   ├── services/            # Business logic
│   ├── providers/           # AI provider implementations
│   │   ├── image/          # Replicate, FAL, Together, Runware, OpenAI
│   │   ├── tts/            # Edge TTS, OpenAI TTS, ElevenLabs
│   │   └── video/          # Sora
│   ├── core/                # FFmpeg, Redis, task manager, WebSocket
│   └── migrations/         # Database migrations
├── frontend/
│   └── src/
│       ├── app/             # Next.js App Router pages
│       ├── components/      # React components
│       ├── hooks/          # Custom hooks (WebSocket)
│       ├── lib/             # API client, types, utils
│       └── stores/          # Zustand state management
├── resources/               # Fonts, music, FFmpeg binaries (optional)
├── docker-compose.yml      # PostgreSQL, Redis, MinIO
├── .env.example             # Environment template
├── run.bat                  # Start both backend and frontend
├── run_backend.bat
└── run_frontend.bat
```

---

## API Documentation

FastAPI auto-generates interactive API documentation:

- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

### Key endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/projects` | List projects |
| `POST` | `/api/projects` | Create project |
| `POST` | `/api/generate/start` | Start video generation |
| `GET` | `/api/jobs` | List jobs |
| `WS` | `/ws` | WebSocket for real-time progress |

---

## Deployment

### Frontend (Vercel / Netlify)

1. Set `NEXT_PUBLIC_API_URL` to your backend URL.
2. Deploy the `frontend/` directory.
3. Ensure CORS is configured on the backend for your frontend domain.

### Backend

1. Set `DATABASE_URL` to your production database.
2. Set `REDIS_URL` if using Redis for background jobs.
3. Configure `STORAGE_BACKEND` and S3 credentials for production storage.
4. Run with a production ASGI server (e.g. Gunicorn + Uvicorn):

   ```bash
   gunicorn backend.main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
   ```

### Docker

You can extend `docker-compose.yml` to include the backend and frontend services. Ensure environment variables are passed correctly.

---

## Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`.
3. Commit your changes: `git commit -m "Add your feature"`.
4. Push to the branch: `git push origin feature/your-feature`.
5. Open a Pull Request.

---

## License

[Add your license here, e.g. MIT, Apache 2.0]
