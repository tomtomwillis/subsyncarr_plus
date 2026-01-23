import { ProcessingCoordinator } from '../coordinator';
import { ProcessingEngine } from '../processingEngine';
import { StateManager } from '../stateManager';
import { EventEmitter } from 'events';

// Mock dependencies
class MockEngine extends EventEmitter {
  processRun = jest.fn();
  reset = jest.fn();
  stateManager: StateManager | undefined;
  skipFile = jest.fn();
  stopAllProcessing = jest.fn();
}

class MockStateManager extends EventEmitter {
  startRun = jest.fn();
  getCurrentRun = jest.fn();
  appendLog = jest.fn();
  addFile = jest.fn();
  updateFileStatus = jest.fn();
  updateFileEngine = jest.fn();
  incrementCompletedEngines = jest.fn();
  incrementRunCounter = jest.fn();
  completeRun = jest.fn();
  getFileResults = jest.fn();
  cancelRun = jest.fn();
}

describe('ProcessingCoordinator', () => {
  let coordinator: ProcessingCoordinator;
  let mockEngine: MockEngine;
  let mockStateManager: MockStateManager;

  beforeEach(() => {
    mockEngine = new MockEngine();
    mockStateManager = new MockStateManager();
    coordinator = new ProcessingCoordinator(
      mockEngine as unknown as ProcessingEngine,
      mockStateManager as unknown as StateManager,
    );
  });

  it('should wait for run to start before returning run ID', async () => {
    const runId = 'test-run-id';
    const runObject = { id: runId };

    // Mock processRun to simulate delay in finding files
    mockEngine.processRun.mockImplementation(async () => {
      // Simulate delay > 100ms (the old timeout)
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Simulate finding files
      mockEngine.emit('run:files_found', ['file1.srt']);

      // Keep running for a bit
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // When startRun is called by coordinator (triggered by run:files_found),
    // it should return the ID and emit run:started
    mockStateManager.startRun.mockImplementation(() => {
      // Simulate what real StateManager does
      // Important: real StateManager emits run:started synchronously inside startRun
      mockStateManager.emit('run:started', runObject);
      return runId;
    });

    // Mock getCurrentRun to return null initially (if called before startRun)
    mockStateManager.getCurrentRun.mockReturnValue(null);

    // However, after run starts, getCurrentRun should probably return something if called?
    // The coordinator's new logic uses runStartedPromise result directly,
    // but the old logic (and potentially the "process finished" path) uses getCurrentRun.
    // Let's make getCurrentRun return runObject if startRun has been called.
    mockStateManager.startRun.mockImplementation(() => {
      mockStateManager.getCurrentRun.mockReturnValue(runObject);
      mockStateManager.emit('run:started', runObject);
      return runId;
    });

    const resultPromise = coordinator.startRun();

    // It should eventually resolve with runId
    const result = await resultPromise;
    expect(result).toBe(runId);

    // Wait for the process to fully complete to avoid Jest warning about logging after test completion
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('should handle process failure before run starts', async () => {
    mockEngine.processRun.mockImplementation(async () => {
      throw new Error('Scan failed');
    });

    await expect(coordinator.startRun()).rejects.toThrow('Scan failed');
  });
});
