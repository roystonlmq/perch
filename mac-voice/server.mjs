import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { createDispatcher } from './dispatcher.mjs';
import { connectCodex } from './codex.mjs';

const run = promisify(execFile);
const port = Number(process.env.PORT || 8765);
const host = `127.0.0.1:${port}`;
const origin = `http://${host}`;
const demo = !process.argv.includes('--live');
const cwd = process.env.VOICE_CODEX_WORKSPACE || process.cwd();
const agentId = process.env.VOICE_ELEVENLABS_AGENT_ID;
const briefingVoice = process.env.VOICE_ELEVENLABS_BRIEFING_VOICE;
const snapshotPath = !demo && process.env.VOICE_JOB_SNAPSHOT;
const initialJobs = snapshotPath ? JSON.parse(await readFile(snapshotPath, 'utf8')).jobs : [];
let codex;
const dispatcher = createDispatcher({
  demo, cwd, initialJobs, model: process.env.VOICE_CODEX_MODEL,
  rpc(method, params) {
    codex ??= connectCodex(dispatcher.event);
    return codex(method, params);
  }
});

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/client.bundle.js', ['client.bundle.js', 'text/javascript; charset=utf-8']],
  ['/demo-alert.m4a', ['demo-alert.m4a', 'audio/mp4']]
]);
function reply(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(data));
}
async function readJson(request) {
  let text = '';
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 12_000) throw new Error('Request is too large.');
  }
  return JSON.parse(text);
}

createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  if (request.headers.host !== host ||
      (request.headers.origin && request.headers.origin !== origin)) {
    return reply(response, 403, { error: 'Use the local launcher.' });
  }

  const asset = request.method === 'GET' && assets.get(request.url);
  if (demo) {
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; media-src 'self'; frame-ancestors 'none'");
  }
  try {
    if (asset) {
      const [file, type] = asset;
      const data = await readFile(new URL(file, import.meta.url));
      response.writeHead(200, { 'Content-Type': type });
      return response.end(data);
    }
    if (request.headers['x-voice-launcher'] !== '1') {
      return reply(response, 403, { error: 'Use the local launcher.' });
    }
    if (request.method === 'GET' && request.url === '/api/jobs') {
      return reply(response, 200, { demo, jobs: dispatcher.list() });
    }
    if (request.method === 'POST' && request.url === '/api/start') {
      return reply(response, 200, await dispatcher.start(await readJson(request)));
    }
    if (request.method === 'POST' && request.url === '/api/demo-answer') {
      return reply(response, 200, dispatcher.answerDemo((await readJson(request)).id));
    }
    if (request.method === 'POST' && request.url === '/api/briefing-audio' && !demo) {
      if (!briefingVoice) return reply(response, 503, { error: 'Set VOICE_ELEVENLABS_BRIEFING_VOICE to enable spoken briefings.' });
      const { text } = await readJson(request);
      if (typeof text !== 'string' || !text.trim() || text.length > 5000) {
        return reply(response, 400, { error: 'The spoken briefing must be between 1 and 5000 characters.' });
      }
      const audio = await new Promise((resolve, reject) => {
        const child = execFile(process.env.ELEVENLABS_BIN || 'elevenlabs', [
          'text-to-speech', 'convert', '--voice-id', briefingVoice,
          '--output-format', 'mp3_44100_64',
          '--output', '-', '--json', '-'
        ], { encoding: 'buffer', timeout: 25000, maxBuffer: 4_000_000 }, (error, stdout) => {
          if (error || !stdout.length) reject(new Error('ElevenLabs could not generate the briefing.'));
          else resolve(stdout);
        });
        child.stdin.on('error', () => {});
        child.stdin.end(JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }));
      });
      response.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      return response.end(audio);
    }
    if (request.method === 'POST' && request.url === '/api/connect' && !demo) {
      if (!agentId) return reply(response, 503, { error: 'Set VOICE_ELEVENLABS_AGENT_ID to enable live voice.' });
      const { stdout } = await run(process.env.ELEVENLABS_BIN || 'elevenlabs', [
        'agents', 'conversations', 'get_signed_url', '--agent-id', agentId, '--include-conversation-id', 'true', '--format', 'json'
      ], { timeout: 12_000 }).catch(() => { throw new Error('ElevenLabs sign-in or connection failed.'); });
      const { signed_url: signedUrl } = JSON.parse(stdout);
      if (!signedUrl) throw new Error('ElevenLabs did not return a signed URL.');
      return reply(response, 200, { signedUrl });
    }
    return reply(response, 404, { error: 'Route unavailable in this mode.' });
  } catch (error) {
    return reply(response, 400, { error: error.message });
  }
}).listen(port, '127.0.0.1', () => console.log(`${demo ? 'Fictional demo' : 'Live voice'}: ${origin}`));
