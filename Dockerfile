# Use Node 22 LTS as base image
FROM node:22-alpine3.23 AS base

###############
# BUILD STAGE #
###############
FROM base AS builder

# Build deps
RUN apk add --no-cache \
    python3-dev \
    py3-pip \
    py3-virtualenv \
    gcc \
    g++ \
    make \
    musl-dev \
    shadow

# Install ffsubsync and autosubsync into custom venvs since pipx doesn't work properly over build stages
RUN python3 -m venv /opt/venv/ffsubsync && \
    python3 -m venv /opt/venv/autosubsync && \
    /opt/venv/ffsubsync/bin/pip install --no-cache-dir --no-compile ffsubsync "setuptools<70" && \
    /opt/venv/autosubsync/bin/pip install --no-cache-dir --no-compile autosubsync "setuptools<70"

# Set group and user id to 1000 in case node ever decides to change it
ENV PUID=1000
ENV PGID=1000
RUN groupmod -g ${PGID} node && \
    usermod -u ${PUID} -g ${PGID} node && \
    chown -R node:node /home/node

USER node
WORKDIR /app

# Node deps
COPY --chown=node:node package*.json ./
ENV HUSKY=0
RUN npm install --ignore-scripts

# Native rebuild
RUN npm rebuild better-sqlite3

# Build app and cleanup
COPY --chown=node:node . .
RUN npm run build && \
    npm prune --omit=dev --production && \
    npm cache clean --force

####################
# PRODUCTION STAGE #
####################
FROM base AS final

# Runtime deps
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    shadow

# Same user as build stage
ENV PUID=1000
ENV PGID=1000
RUN groupmod -g ${PGID} node && \
    usermod -u ${PUID} -g ${PGID} node && \
    chown -R node:node /home/node

USER node
WORKDIR /app

# Copy app, python venv installs and bin
COPY --from=builder --chown=node:node /app /app
COPY --from=builder --chown=node:node /opt/venv /opt/venv
COPY --chown=node:node bin/* /home/node/.local/bin/

# Create volume for persistent storage of database
RUN mkdir -p /app/data
VOLUME "/app/data"

# Runtime Env variables
ENV CRON_SCHEDULE="0 0 * * *"
ENV NODE_OPTIONS="--max-old-space-size=512"
ENV PATH="/opt/venv/ffsubsync/bin:/opt/venv/autosubsync/bin:/home/node/.local/bin/:$PATH"

EXPOSE 3000

CMD ["node", "--optimize-for-size", "dist/index-server.js"]