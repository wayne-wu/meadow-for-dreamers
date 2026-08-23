import { spawn } from 'node:child_process';

const processes = [];
const backendPort = process.env.BACKEND_PORT || '8787';
const frontendPort = process.env.FRONTEND_PORT || '5173';
const apiBaseUrl = process.env.STUDIO_MEADOW_API_BASE_URL || `http://localhost:${backendPort}`;

start('backend', 'npm', ['run', 'dev'], {
  cwd: 'apps/backend',
  env: {
    ...process.env,
    PORT: backendPort
  }
});

start('frontend', 'npm', ['run', 'dev'], {
  cwd: 'apps/frontend',
  env: {
    ...process.env,
    PORT: frontendPort,
    STUDIO_MEADOW_API_BASE_URL: apiBaseUrl
  }
});

console.log('');
console.log(`Backend:  http://localhost:${backendPort}`);
console.log(`Frontend: http://localhost:${frontendPort}/?api=${encodeURIComponent(apiBaseUrl)}`);
console.log('Press Ctrl+C to stop both servers.');
console.log('');

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

function start(name, command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  processes.push(child);

  child.stdout.on('data', (chunk) => {
    writePrefixed(name, chunk);
  });

  child.stderr.on('data', (chunk) => {
    writePrefixed(name, chunk);
  });

  child.on('exit', (code, signal) => {
    if (process.exitCode == null && code && code !== 0) {
      process.exitCode = code;
      console.error(`[${name}] exited with code ${code}`);
      stopAll();
      return;
    }

    if (signal && signal !== 'SIGTERM' && signal !== 'SIGINT') {
      console.error(`[${name}] exited from signal ${signal}`);
    }
  });
}

function writePrefixed(name, chunk) {
  const lines = chunk.toString().split(/\r?\n/);

  for (const line of lines) {
    if (line.trim()) {
      console.log(`[${name}] ${line}`);
    }
  }
}

function stopAll() {
  for (const child of processes) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => {
    process.exit(process.exitCode || 0);
  }, 200);
}

