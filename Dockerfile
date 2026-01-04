# Use Node.js LTS (Long Term Support) as base image
FROM node:20-bullseye

# Create app user and group with configurable UID/GID
ENV PUID=1000
ENV PGID=1000

RUN mkdir -p /app
RUN chown node:node /app

# Modify existing node user instead of creating new one
RUN groupmod -g ${PGID} node && \
    usermod -u ${PUID} -g ${PGID} node && \
    chown -R node:node /home/node
RUN apt-get clean

# Install system dependencies including ffmpeg, Python, cron, and build tools
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    cron \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

USER node
# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY --chown=node:node package*.json ./

# Install Node.js dependencies while skipping husky installation
ENV HUSKY=0
RUN npm install --ignore-scripts

# Rebuild native modules for the container's platform
RUN npm rebuild better-sqlite3

# Copy the rest of your application
COPY --chown=node:node . .
RUN mkdir -p /home/node/.local/bin/
RUN cp bin/* /home/node/.local/bin/

# Build TypeScript
RUN npm run build

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown node:node /app/data

# Create startup script
# Set default cron schedule (if not provided by environment variable)
ENV CRON_SCHEDULE="0 0 * * *"

# Install pipx
RUN python3 -m pip install --user pipx \
    && python3 -m pipx ensurepath

# Add pipx to PATH
ENV PATH="/home/node/.local/bin:$PATH"

# Install ffsubsync and autosubsync using pipx
# Clean caches after installation to reduce memory footprint
RUN pipx install ffsubsync \
    && pipx install autosubsync \
    && python3 -m pip cache purge \
    && find /home/node/.local/share/pipx -type f -name "*.pyc" -delete 2>/dev/null || true \
    && find /home/node/.local/share/pipx -type d -name "__pycache__" -delete 2>/dev/null || true

# Expose web UI port
EXPOSE 3000

# Use server as entrypoint (which includes cron scheduling)
# Memory optimization flags: increased heap to 512MB to prevent OOM with file-based logging
CMD ["node", \
     "--max-old-space-size=512", \
     "--optimize-for-size", \
     "dist/index-server.js"]
