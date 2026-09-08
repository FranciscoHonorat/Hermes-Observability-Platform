FROM python:3.12-slim

WORKDIR /app

# scikit-learn, numpy, and psycopg[binary] all ship prebuilt manylinux
# wheels for this image's Python 3.12 — no compiler needed (unlike newer,
# not-yet-wheel-covered CPython releases; see docs/adr/0001-*.md).
COPY packages/intelligence/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY packages/intelligence/src ./src

RUN groupadd -r intelligence && useradd -r -g intelligence intelligence \
    && chown -R intelligence:intelligence /app
USER intelligence

CMD ["python", "-m", "src.main"]
