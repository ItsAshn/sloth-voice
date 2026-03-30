# ── Build stage ────────────────────────────────────────────────────────────────
# mediasoup compiles native C++ bindings, so we need full build tools.
FROM node:22-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    # mediasoup worker binary depends on libstdc++ at runtime
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy installed node_modules (with compiled binaries) from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY package.json ./

# Create a non-root user for security
RUN groupadd --system sloth && useradd --system --gid sloth sloth

# Directory for the SQLite database (mount a volume here in production)
RUN mkdir -p /data && chown sloth:sloth /data
ENV SERVER_DB_PATH=/data/server.db

# Directory for uploaded files (mount a volume here in production)
RUN mkdir -p /app/uploads && chown sloth:sloth /app/uploads

EXPOSE 5000

USER sloth

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:5000/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"

# node:sqlite is behind the --experimental-sqlite flag (Node 22)
CMD ["node", "--experimental-sqlite", "src/index.js"]
