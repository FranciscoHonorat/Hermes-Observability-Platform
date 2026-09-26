FROM python:3.12-slim

WORKDIR /app

COPY packages/intelligence/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY packages/intelligence/src ./src

RUN groupadd -r intelligence && useradd -r -g intelligence intelligence \
    && chown -R intelligence:intelligence /app
USER intelligence

CMD ["python", "-m", "src.main"]
