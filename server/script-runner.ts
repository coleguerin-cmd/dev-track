import { spawn } from 'child_process';
import path from 'path';
import { getProjectRoot } from './project-config.js';
import { broadcast } from './ws.js';

export interface ScriptResult {
  command: string;
  output: string;
  exitCode: number;
  duration_ms: number;
}

export function runScript(
  command: string,
  options: {
    cwd?: string;
    timeout?: number;
    onOutput?: (chunk: string) => void;
  } = {}
): Promise<ScriptResult> {
  const {
    cwd = getProjectRoot(), // Default to project root
    timeout = 120000,
    onOutput,
  } = options;

  return new Promise((resolve) => {
    const startTime = Date.now();
    let output = '';

    // Parse command into executable and args
    const parts = command.split(' ');
    const executable = parts[0];
    const args = parts.slice(1);

    const child = spawn(executable, args, {
      cwd,
      shell: true,
      timeout,
      env: { ...process.env },
    });

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      onOutput?.(text);

      // Stream to WebSocket clients
      broadcast({
        type: 'file_changed',
        data: { type: 'script_output', command, chunk: text },
        timestamp: new Date().toISOString(),
      });
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      onOutput?.(text);
    });

    child.on('close', (code) => {
      resolve({
        command,
        output,
        exitCode: code ?? 1,
        duration_ms: Date.now() - startTime,
      });
    });

    child.on('error', (err) => {
      resolve({
        command,
        output: output + `\nError: ${err.message}`,
        exitCode: 1,
        duration_ms: Date.now() - startTime,
      });
    });
  });
}
