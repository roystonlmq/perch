import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

export function connectCodex(onEvent) {
  const bundled = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
  const command = process.env.CODEX_BIN || (existsSync(bundled) ? bundled : 'codex');
  const args = process.env.CODEX_SOCKET
    ? ['app-server', 'proxy', '--sock', process.env.CODEX_SOCKET]
    : ['app-server'];
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map();
  let sequence = 0;
  let failure;

  function stop(error) {
    failure = error;
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  }
  child.on('error', stop);
  child.stdin.on('error', stop);
  child.on('exit', () => stop(new Error('Codex App Server exited. Restart the launcher.')));

  function send(message) {
    child.stdin.write(JSON.stringify(message) + '\n');
  }
  createInterface({ input: child.stdout }).on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.method) {
      onEvent(message.method, message.params ?? {});
      // Return an error to unsupported server requests rather than auto-approving.
      if (message.id !== undefined && !process.env.CODEX_SOCKET) {
        send({ id: message.id, error: { code: -32601, message: 'Open the Codex chat to continue.' } });
      }
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  function request(method, params) {
    if (failure) return Promise.reject(failure);
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      send({ id, method, params });
    });
  }
  const ready = request('initialize', {
    clientInfo: { name: 'mac_voice_dispatcher', title: 'Mac Voice Dispatcher', version: '0.1.0' },
    capabilities: { experimentalApi: true }
  }).then(() => send({ method: 'initialized', params: {} }));

  return async (method, params) => {
    await ready;
    return request(method, params);
  };
}
