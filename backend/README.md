# Auralis backend

FastAPI API, PostgreSQL job worker and the audio/acoustic analysis library.
See the [root README](../README.md) for setup and [docs/architecture.md](../docs/architecture.md)
for how the modules fit together.

```bash
uv sync
uv run alembic upgrade head
uv run uvicorn auralis.main:app --reload   # http://localhost:8000/api/docs
uv run auralis worker
uv run pytest
```

New migration after changing models:

```bash
uv run alembic revision --autogenerate -m "describe the change"
uv run alembic upgrade head
```
