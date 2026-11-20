FROM python:3.13-slim

# Install system dependencies for audio processing (librosa, av, soxr, yt-dlp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy the whole backend directory (dependency files + source)
COPY backend/pyproject.toml backend/uv.lock ./
COPY backend/src ./src
COPY backend/migrations ./migrations
COPY backend/alembic.ini ./
COPY backend/run_prod.py ./

# Install dependencies (production only) and the project itself
RUN uv sync --frozen --no-dev

# Expose the port Railway provides
EXPOSE ${PORT:-8080}

# Run the production launcher (uv run ensures venv is active)
CMD ["uv", "run", "python", "run_prod.py"]
