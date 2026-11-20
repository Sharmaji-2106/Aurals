FROM python:3.13-slim

# Install system dependencies for audio processing (librosa, av, soxr)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy dependency files first for caching
COPY backend/pyproject.toml backend/uv.lock ./

# Install dependencies (no dev deps in production)
RUN uv sync --frozen --no-dev

# Copy backend source code
COPY backend/src ./src
COPY backend/migrations ./migrations
COPY backend/alembic.ini ./
COPY backend/run_prod.py ./

# Expose the port Railway provides
EXPOSE ${PORT:-8080}

# Run the production launcher
CMD ["uv", "run", "python", "run_prod.py"]
