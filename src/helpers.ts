import { promisify } from 'util';
import { exec } from 'child_process';

export interface ProcessingResult {
  success: boolean;
  message: string;
}

export const execPromise = (command: string, timeoutMs?: number): Promise<{ stdout: string; stderr: string }> => {
  // Read from env var with default of 30 minutes (1800000ms)
  const defaultTimeout = process.env.SYNC_ENGINE_TIMEOUT_MS
    ? parseInt(process.env.SYNC_ENGINE_TIMEOUT_MS, 10)
    : 1800000;

  const timeout = timeoutMs ?? defaultTimeout;

  // Use promisified exec with timeout option
  return promisify(exec)(command, {
    timeout,
    maxBuffer: 1024 * 1024 * 10, // 10MB buffer for command output
  });
};
