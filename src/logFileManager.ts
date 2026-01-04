import * as fs from 'fs';
import * as path from 'path';

export class LogFileManager {
  private logDir: string;
  private currentLogStream: fs.WriteStream | null = null;
  private currentRunId: string | null = null;
  private writeBuffer: string[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private flushIntervalMs: number = 5000; // Flush every 5 seconds

  constructor(logDir: string) {
    this.logDir = logDir;

    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  startRun(runId: string): void {
    // Close any existing stream
    this.closeCurrentStream();

    this.currentRunId = runId;
    const logFilePath = this.getLogFilePath(runId);

    // Create write stream in append mode
    this.currentLogStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    // Start periodic flush
    this.flushInterval = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
  }

  appendLog(runId: string, message: string): void {
    if (runId !== this.currentRunId) {
      // If this is for a different run, write directly (shouldn't happen often)
      const logFilePath = this.getLogFilePath(runId);
      fs.appendFileSync(logFilePath, message + '\n');
      return;
    }

    // Add to buffer for periodic flush
    this.writeBuffer.push(message);

    // If buffer gets too large, flush immediately
    if (this.writeBuffer.length >= 100) {
      this.flush();
    }
  }

  private flush(): void {
    if (!this.currentLogStream || this.writeBuffer.length === 0) {
      return;
    }

    const content = this.writeBuffer.join('\n') + '\n';
    this.writeBuffer = [];

    this.currentLogStream.write(content, (err) => {
      if (err) {
        console.error(`[${new Date().toISOString()}] Error writing to log file:`, err);
      }
    });
  }

  endRun(runId: string): void {
    if (runId === this.currentRunId) {
      this.closeCurrentStream();
    }
  }

  private closeCurrentStream(): void {
    // Flush any remaining buffered logs
    this.flush();

    // Stop periodic flush
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Close stream
    if (this.currentLogStream) {
      this.currentLogStream.end();
      this.currentLogStream = null;
    }

    this.currentRunId = null;
  }

  readLog(runId: string): string {
    const logFilePath = this.getLogFilePath(runId);

    if (!fs.existsSync(logFilePath)) {
      return '';
    }

    try {
      return fs.readFileSync(logFilePath, 'utf-8');
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error reading log file:`, error);
      return '';
    }
  }

  deleteLog(runId: string): void {
    const logFilePath = this.getLogFilePath(runId);

    if (fs.existsSync(logFilePath)) {
      try {
        fs.unlinkSync(logFilePath);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error deleting log file:`, error);
      }
    }
  }

  deleteOldLogs(keepDays: number): number {
    const now = Date.now();
    const maxAgeMs = keepDays * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    try {
      const files = fs.readdirSync(this.logDir);

      for (const file of files) {
        if (!file.endsWith('.log')) continue;

        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtimeMs;

        if (fileAge > maxAgeMs) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error cleaning up old log files:`, error);
    }

    return deletedCount;
  }

  getLogFilePath(runId: string): string {
    return path.join(this.logDir, `${runId}.log`);
  }

  close(): void {
    this.closeCurrentStream();
  }
}
