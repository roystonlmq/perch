import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { resultParts, speechText, voiceBrief } from './spoken-result.mjs';

const run = promisify(execFile);
const origin = 'http://127.0.0.1:8767';

async function request(path, body) {
  const response = await fetch(origin + '/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-Voice-Launcher': '1', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(35000)
  });
  if (!response.ok) throw new Error((await response.json()).error);
  return response;
}

async function speak(text) {
  if (process.argv.includes('--text')) {
    console.log(text);
    return;
  }
  const response = await request('briefing-audio', { text: text.slice(0, 5000) });
  const folder = await mkdtemp(join(tmpdir(), 'voice-shortcut-'));
  const file = join(folder, 'briefing.mp3');
  try {
    await writeFile(file, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
    await run('/usr/bin/afplay', [file]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function main() {
  const mode = process.argv[2];
  const { demo, jobs } = await (await request('jobs')).json();
  if (demo) throw new Error('Start the live launcher first.');
  if (mode === 'brief') {
    if (!jobs.length) return speak('There are no jobs yet.');
    for (const job of jobs) {
      const details = job.attention || (job.status === 'completed' && resultParts(job.reply).spoken);
      await speak(`${job.title}. ${details ? speechText(details) : job.status + '.'}`);
    }
    return;
  }
  if (mode !== 'ask') throw new Error('Choose ask or brief.');
  let task = '';
  for await (const chunk of process.stdin) {
    task += chunk;
    if (task.length > 3200) throw new Error('The request is too long.');
  }
  task = task.trim();
  if (!task) return speak('I did not catch a request.');
  const title = task.replace(/\s+/g, ' ').slice(0, 85);
  const brief = task + '\n\n' + voiceBrief +
    ' For bookings, purchases, sending messages, publishing or similar external actions, prepare options and ask the user before taking the final action.';
  await request('start', { title, brief });
  await speak('I started that job. Ask Siri to run Brief my jobs when you want the details.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
