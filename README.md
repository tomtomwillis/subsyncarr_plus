# Subsyncarr Plus

An automated subtitle synchronization tool that runs as a Docker container. It watches a directory for video files with matching subtitles and automatically synchronizes them using both ffsubsync and autosubsync.

## Features

- Automatically scans directory for video files and their corresponding subtitles
- Uses both ffsubsync and autosubsync for maximum compatibility
- Runs on a schedule (daily at midnight) and on container startup
- Supports common video formats (mkv, mp4, avi, mov)
- Docker-based for easy deployment
- Generates synchronized subtitle files with `.ffsubsync.srt` and `.autosubsync.srt` extensions

## Quick Start

### Using Docker Compose (Recommended)

#### 1. Create a new directory for your project

```bash
mkdir subsyncarr-plus && cd subsyncarr-plus
```

#### 2. Download the docker-compose.yml file

```bash
curl -O https://raw.githubusercontent.com/johnpc/subsyncarr-plus/refs/heads/main/docker-compose.yaml
```

#### 3. Edit the docker-compose.yml file with your timezone and paths

```bash
TZ=America/New_York  # Adjust to your timezone
```

#### 4. Start the container

```bash
docker compose up -d
```

## Configuration

The container is configured to:

- Scan for subtitle files in the mounted directory
- Run synchronization at container startup
- Run daily at midnight (configurable via cron)
- Generate synchronized subtitle versions using different tools (currently ffsubsync and autosubsync)

### Environment Variables

| Variable                    | Default                       | Description                                                   |
| --------------------------- | ----------------------------- | ------------------------------------------------------------- |
| `CRON_SCHEDULE`             | `0 0 * * *`                   | Cron expression for sync schedule (daily at midnight)         |
| `SCAN_PATHS`                | `/scan_dir`                   | Comma-separated directories to scan for SRT files             |
| `EXCLUDE_PATHS`             | _(none)_                      | Comma-separated directories to exclude from scanning          |
| `MAX_CONCURRENT_SYNC_TASKS` | `1`                           | Number of subtitle files to process in parallel               |
| `INCLUDE_ENGINES`           | `ffsubsync,autosubsync,alass` | Which sync engines to use                                     |
| `SYNC_ENGINE_TIMEOUT_MS`    | `1800000`                     | Timeout for each sync engine in milliseconds (30 min default) |
| `TZ`                        | _(system)_                    | Timezone for logging and cron scheduling                      |
| `PUID`                      | `1000`                        | User ID for file permissions                                  |
| `PGID`                      | `1000`                        | Group ID for file permissions                                 |

### Timeout Configuration

The `SYNC_ENGINE_TIMEOUT_MS` environment variable controls how long each sync engine can run before being terminated. This prevents hung processes from blocking the queue.

**Common timeout values:**

- Short files (< 500MB): `300000` (5 minutes)
- Medium files (500MB - 2GB): `900000` (15 minutes)
- Large files (2GB - 5GB): `1800000` (30 minutes) - **DEFAULT**
- Very large files (> 5GB): `3600000` (60 minutes)

Example in docker-compose.yaml:

```yaml
environment:
  - SYNC_ENGINE_TIMEOUT_MS=3600000 # 60 minutes for large files
```

### Directory Structure

Your media directory should be organized as follows:

```txt
/media
├── movie1.mkv
├── movie1.srt
├── movie2.mp4
└── movie2.srt
```

It should follow the naming conventions expected by other services like Bazarr and Jellyfin.

## Web UI

Subsyncarr Plus includes a web-based monitoring interface for real-time visibility into subtitle processing operations.

### Accessing the UI

After starting the container, access the web UI at:

```
http://localhost:3000
```

### Features

- **Real-time Progress Monitoring:** Watch files being processed with live updates
- **Engine-level Detail:** See which engine (ffsubsync/autosubsync/alass) is currently running for each file
- **Manual Control:** Start processing runs on demand
- **Custom Scans:** Process specific directories instead of the full library
- **Skip Files:** Cancel processing for individual files
- **Processing History:** View past runs with statistics and results

### Web UI Environment Variables

| Variable   | Default                        | Description                                        |
| ---------- | ------------------------------ | -------------------------------------------------- |
| `WEB_PORT` | `3000`                         | Port for web UI                                    |
| `WEB_HOST` | `127.0.0.1`                    | Host to bind to (use `0.0.0.0` for all interfaces) |
| `DB_PATH`  | `/app/data/subsyncarr-plus.db` | SQLite database location                           |

### Database Persistence

Processing history is stored in SQLite and persists across container restarts. The database is automatically mounted in docker-compose.yaml:

```yaml
volumes:
  - ./data:/app/data
```

## Logs

View container logs:

```bash
docker logs -f subsyncarr-plus
```
