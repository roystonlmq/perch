import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PERCH_PORT || 8772);
const origin = `http://127.0.0.1:${port}`;
const launcher = 'http://127.0.0.1:8767';
const assets = {
  '/': ['../voice-hud-demo.html', 'text/html; charset=utf-8'],
  '/perch-live.js': ['./perch-live.bundle.js', 'text/javascript; charset=utf-8']
};
const routes = new Set(['POST /api/connect', 'POST /api/start', 'GET /api/jobs', 'POST /api/briefing-audio']);
const perchJobs = new Set();

createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  const json = (status, value) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(value));
  };
  if (request.headers.host !== new URL(origin).host ||
      (request.headers.origin && request.headers.origin !== origin)) {
    return json(403, { error: 'Open Perch on this Mac.' });
  }
  try {
    const asset = request.method === 'GET' && assets[request.url];
    if (asset && Array.isArray(asset)) {
      const content = await readFile(new URL(asset[0], import.meta.url));
      response.writeHead(200, { 'Content-Type': asset[1] });
      return response.end(content);
    }
    if (!routes.has(`${request.method} ${request.url}`)) return json(404, { error: 'Unavailable' });
    if (request.headers['x-perch'] !== '1') return json(403, { error: 'Open Perch first.' });

    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 20000) return json(413, { error: 'Request too long.' });
      chunks.push(chunk);
    }
    const result = await fetch(launcher + request.url, {
      method: request.method,
      headers: { 'X-Voice-Launcher': '1', 'Content-Type': 'application/json' },
      body: request.method === 'POST' ? Buffer.concat(chunks) : undefined,
      signal: AbortSignal.timeout(35000)
    });
    if (result.ok && request.url === '/api/jobs') {
      const { jobs } = await result.json();
      return json(200, { jobs: jobs.filter(job => perchJobs.has(job.id)) });
    }
    if (result.ok && request.url === '/api/start') {
      const job = await result.json();
      perchJobs.add(job.id);
      return json(200, job);
    }
    response.writeHead(result.status, { 'Content-Type': result.headers.get('content-type') || 'application/json' });
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    json(502, { error: 'The live launcher is unavailable. The fictional rehearsal is still available.' });
  }
}).listen(port, '127.0.0.1', () => console.log('Perch ready at ' + origin));
