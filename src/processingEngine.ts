import EventEmitter from 'events';
import { ScanConfig, getScanConfig } from './config';
import { findAllSrtFiles } from './findAllSrtFiles';
import { findMatchingVideoFile } from './findMatchingVideoFile';
import { generateFfsubsyncSubtitles } from './generateFfsubsyncSubtitles';
import { generateAutosubsyncSubtitles } from './generateAutosubsyncSubtitles';
import { generateAlassSubtitles } from './generateAlassSubtitles';

export class ProcessingEngine extends EventEmitter {
  private cancelledFiles: Set<string> = new Set();
  private maxConcurrent: number;
  private enabledEngines: string[];
  private logBuffer: string[] = [];

  constructor() {
    super();
    this.maxConcurrent = parseInt(process.env.MAX_CONCURRENT_SYNC_TASKS || '1', 10);
    this.enabledEngines = process.env.INCLUDE_ENGINES?.split(',') || ['ffsubsync', 'autosubsync', 'alass'];
  }

  private log(message: string): void {
    console.log(message);
    this.logBuffer.push(message);
    this.emit('log', message);
  }

  getLogs(): string[] {
    return [...this.logBuffer];
  }

  clearLogs(): void {
    this.logBuffer = [];
  }

  async processRun(config?: ScanConfig): Promise<void> {
    const scanConfig = config || getScanConfig();
    this.log(`[${new Date().toISOString()}] Scanning for subtitle files...`);
    this.log(`[${new Date().toISOString()}] Scan paths: ${JSON.stringify(scanConfig.includePaths)}`);

    const srtFiles = await findAllSrtFiles(scanConfig);
    this.log(`[${new Date().toISOString()}] Found ${srtFiles.length} subtitle files`);

    this.emit('run:files_found', srtFiles);
    this.cancelledFiles.clear();

    // Process in batches
    this.log(`[${new Date().toISOString()}] Processing with concurrency: ${this.maxConcurrent}`);
    this.log(`[${new Date().toISOString()}] Enabled engines: ${this.enabledEngines.join(', ')}`);

    for (let i = 0; i < srtFiles.length; i += this.maxConcurrent) {
      const batch = srtFiles.slice(i, i + this.maxConcurrent);
      this.log(
        `[${new Date().toISOString()}] Processing batch ${Math.floor(i / this.maxConcurrent) + 1}/${Math.ceil(srtFiles.length / this.maxConcurrent)} (${batch.length} files)`,
      );
      await Promise.all(batch.map((file) => this.processFile(file)));
    }

    this.log(`[${new Date().toISOString()}] All files processed`);
  }

  private async processFile(srtPath: string): Promise<void> {
    const fileName = srtPath.split('/').pop();
    this.log(`[${new Date().toISOString()}] Processing: ${fileName}`);

    // Check if cancelled
    if (this.cancelledFiles.has(srtPath)) {
      this.log(`[${new Date().toISOString()}] Skipped (cancelled): ${fileName}`);
      this.emit('file:skipped', { srtPath, reason: 'cancelled' });
      return;
    }

    const videoPath = findMatchingVideoFile(srtPath);

    this.emit('file:started', { srtPath, videoPath });

    if (!videoPath) {
      this.log(`[${new Date().toISOString()}] No matching video found for: ${fileName}`);
      this.emit('file:no_video', { srtPath });
      return;
    }

    this.log(`[${new Date().toISOString()}] Found video: ${videoPath.split('/').pop()}`);

    // Process with each enabled engine
    let anyEngineSucceeded = false;
    for (const engine of this.enabledEngines) {
      // Check cancellation before each engine
      if (this.cancelledFiles.has(srtPath)) {
        this.log(`[${new Date().toISOString()}] Skipped (cancelled): ${fileName}`);
        this.emit('file:skipped', { srtPath, reason: 'cancelled' });
        return;
      }

      this.log(`[${new Date().toISOString()}] Starting ${engine} for: ${fileName}`);
      this.emit('file:engine_started', { srtPath, engine });

      const startTime = Date.now();
      let result;

      try {
        switch (engine) {
          case 'ffsubsync':
            result = await generateFfsubsyncSubtitles(srtPath, videoPath);
            break;
          case 'autosubsync':
            result = await generateAutosubsyncSubtitles(srtPath, videoPath);
            break;
          case 'alass':
            result = await generateAlassSubtitles(srtPath, videoPath);
            break;
          default:
            continue;
        }

        const duration = Date.now() - startTime;
        const status = result.success ? '✓' : '✗';
        this.log(
          `[${new Date().toISOString()}] ${status} ${engine} completed (${(duration / 1000).toFixed(1)}s): ${fileName}`,
        );
        if (!result.success) {
          this.log(`[${new Date().toISOString()}]   Error: ${result.message}`);
        }

        if (result.success) {
          anyEngineSucceeded = true;
        }

        this.emit('file:engine_completed', {
          srtPath,
          engine,
          result: { ...result, duration },
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        this.log(`[${new Date().toISOString()}] ✗ ${engine} failed (${(duration / 1000).toFixed(1)}s): ${fileName}`);
        this.log(`[${new Date().toISOString()}]   Error: ${error instanceof Error ? error.message : String(error)}`);

        this.emit('file:engine_completed', {
          srtPath,
          engine,
          result: {
            success: false,
            message: error instanceof Error ? error.message : String(error),
            duration,
          },
        });
      }
    }

    if (anyEngineSucceeded) {
      this.log(`[${new Date().toISOString()}] ✓ Completed successfully for: ${fileName}`);
      this.emit('file:completed', { srtPath });
    } else {
      this.log(`[${new Date().toISOString()}] ✗ All engines failed for: ${fileName}`);
      this.emit('file:failed', { srtPath });
    }
  }

  skipFile(filePath: string): void {
    this.cancelledFiles.add(filePath);
    this.emit('file:skip_requested', { filePath });
  }

  stopAllProcessing(allFiles: string[]): void {
    this.log(`[${new Date().toISOString()}] Stop requested - cancelling all remaining files`);
    allFiles.forEach((file) => this.cancelledFiles.add(file));
  }

  reset(): void {
    this.cancelledFiles.clear();
    this.clearLogs();
  }
}
