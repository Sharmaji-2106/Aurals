"""A small PostgreSQL-backed job queue.

Why not Redis + Celery/RQ: jobs are created in the same transaction as the records
they process (no "row committed but job lost" gap), there is one less service to run,
and ``FOR UPDATE SKIP LOCKED`` gives safe concurrent claiming. At the throughput this
product needs (tracks per minute, not per millisecond) PostgreSQL is plenty. The
handler registry keeps call sites independent of the backend if that ever changes.
"""
