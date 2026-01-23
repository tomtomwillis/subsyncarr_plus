import { ProcessingEngine } from './processingEngine';
import { StateManager } from './stateManager';
import { ScanConfig } from './config';
import { findMatchingVideoFile } from './findMatchingVideoFile';
import { Run } from './database';
import { once } from 'events';

export class ProcessingCoordinator {
  private processingPromise: Promise<void> | null = null;
  private enabledEngines: string[];

  constructor(
    private engine: ProcessingEngine,
    private stateManager: StateManager,
  ) {
    this.enabledEngines = process.env.INCLUDE_ENGINES?.split(',') || ['ffsubsync', 'autosubsync', 'alass'];

    // Inject stateManager into engine so it can check skip status
    this.engine.stateManager = this.stateManager;

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    let currentRunId: string | null = null;

    this.engine.on('log', (message: string) => {
      if (currentRunId) {
        this.stateManager.appendLog(currentRunId, message);
      }
    });

    this.engine.on('run:files_found', (files: string[]) => {
      currentRunId = this.stateManager.startRun(files.length, this.enabledEngines);

      // Add all files to database as pending
      files.forEach((filePath) => {
        const videoPath = findMatchingVideoFile(filePath);
        this.stateManager.addFile(currentRunId!, filePath, videoPath);
      });
    });

    this.engine.on('file:started', ({ srtPath }: { srtPath: string }) => {
      if (currentRunId) {
        this.stateManager.updateFileStatus(currentRunId, srtPath, 'processing', null);
      }
    });

    this.engine.on('file:engine_started', ({ srtPath, engine }: { srtPath: string; engine: string }) => {
      if (currentRunId) {
        this.stateManager.updateFileStatus(currentRunId, srtPath, 'processing', engine);
      }
    });

    this.engine.on(
      'file:engine_completed',
      ({
        srtPath,
        engine,
        result,
      }: {
        srtPath: string;
        engine: string;
        result: {
          success: boolean;
          duration: number;
          message: string;
          stdout?: string;
          stderr?: string;
          skipped?: boolean;
        };
      }) => {
        if (currentRunId) {
          this.stateManager.updateFileEngine(currentRunId, srtPath, engine, result);
          this.stateManager.incrementCompletedEngines(currentRunId);
        }
      },
    );

    this.engine.on('file:completed', ({ srtPath }: { srtPath: string }) => {
      if (currentRunId) {
        this.stateManager.updateFileStatus(currentRunId, srtPath, 'completed', null);
        this.stateManager.incrementRunCounter(currentRunId, 'completed');
      }
    });

    this.engine.on('file:skipped', ({ srtPath }: { srtPath: string }) => {
      if (currentRunId) {
        this.stateManager.updateFileStatus(currentRunId, srtPath, 'skipped', null);
        this.stateManager.incrementRunCounter(currentRunId, 'skipped');
      }
    });

    this.engine.on('file:no_video', ({ srtPath }: { srtPath: string }) => {
      if (currentRunId) {
        this.stateManager.updateFileStatus(currentRunId, srtPath, 'error', null);
        this.stateManager.incrementRunCounter(currentRunId, 'failed');
      }
    });

    this.engine.on('file:failed', ({ srtPath }: { srtPath: string }) => {
      if (currentRunId) {
        this.stateManager.updateFileStatus(currentRunId, srtPath, 'error', null);
        this.stateManager.incrementRunCounter(currentRunId, 'failed');
      }
    });
  }

  async startRun(config?: ScanConfig): Promise<string> {
    if (this.processingPromise) {
      console.log(`[${new Date().toISOString()}] Cannot start run: Another run is already in progress`);
      throw new Error('A run is already in progress');
    }

    console.log(`[${new Date().toISOString()}] Starting new processing run...`);
    this.engine.reset();

    const ac = new AbortController();
    // Use events.once for cleaner listener handling with AbortSignal support
    const runStartedPromise = once(this.stateManager, 'run:started', { signal: ac.signal }).then(
      ([run]) => (run as Run).id,
    );

    // Suppress unhandled rejection when we abort this promise
    runStartedPromise.catch(() => {});

    const processPromise = this.engine.processRun(config);

    this.processingPromise = processPromise.finally(() => {
      this.processingPromise = null;
      const run = this.stateManager.getCurrentRun();
      if (run) {
        console.log(
          `[${new Date().toISOString()}] Run completed - Total: ${run.total_files}, Completed: ${run.completed}, Skipped: ${run.skipped}, Failed: ${run.failed}`,
        );
        this.stateManager.completeRun(run.id);
      }
    });
    // Prevent unhandled rejection on the background promise property,
    // as the error is handled by the main startRun awaiter.
    this.processingPromise.catch(() => {});

    try {
      // Wait for run to be created or process to fail/finish
      const runId = await Promise.race([
        runStartedPromise,
        processPromise.then(() => {
          // Process finished. If run started, we should have the ID.
          const run = this.stateManager.getCurrentRun();
          if (!run) {
            throw new Error('Process completed without starting a run');
          }
          return run.id;
        }),
      ]);

      console.log(`[${new Date().toISOString()}] Run created with ID: ${runId}`);
      return runId;
    } finally {
      // Clean up the event listener if it hasn't fired yet
      ac.abort();
    }
  }

  skipFile(filePath: string): void {
    const fileName = filePath.split('/').pop();
    console.log(`[${new Date().toISOString()}] Skip requested for: ${fileName}`);
    this.engine.skipFile(filePath);
  }

  stopRun(): void {
    console.log(`[${new Date().toISOString()}] Stop run requested`);
    const run = this.stateManager.getCurrentRun();
    if (!run) {
      throw new Error('No run is currently in progress');
    }

    // Get all files and cancel them
    const files = this.stateManager.getFileResults(run.id);
    const allFilePaths = files.map((f) => f.file_path);
    this.engine.stopAllProcessing(allFilePaths);

    // Mark run as cancelled
    this.stateManager.cancelRun(run.id);
  }

  isRunning(): boolean {
    return this.processingPromise !== null;
  }
}
