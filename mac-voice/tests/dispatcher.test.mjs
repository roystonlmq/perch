import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDispatcher } from '../dispatcher.mjs';

test('demo uses fixed briefs and never calls Codex', async () => {
  const dispatcher = createDispatcher({
    demo: true,
    rpc: () => assert.fail('Demo called Codex')
  });
  await assert.rejects(dispatcher.start({ title: 'Private', brief: 'Private' }));
  const job = await dispatcher.start({ fixture: 'build', brief: 'Private' });
  assert.match(job.title, /Moonbeam/);
  assert.doesNotMatch(JSON.stringify(job), /Private|codex:\/\//);
  assert.equal(dispatcher.list().length, 1);
});

test('live jobs start a turn and map structured requests to the right chat', async () => {
  const calls = [];
  const dispatcher = createDispatcher({
    cwd: '/tmp/example',
    rpc: async (method, params) => {
      calls.push([method, params]);
      return method === 'thread/start' ? { thread: { id: 'thread-one' } } : {};
    }
  });
  const job = await dispatcher.start({ title: 'Research', brief: 'Compare fictional vendors' });
  assert.equal(calls[0][1].cwd, '/tmp/example');
  assert.equal(calls[1][1].threadId, job.id);
  dispatcher.event('item/tool/requestUserInput', {
    threadId: job.id, questions: [{ question: 'Which vendor?' }]
  });
  assert.equal(dispatcher.list()[0].attention, 'Which vendor?');
  dispatcher.event('turn/completed', { threadId: job.id, turn: { status: 'completed' } });
  assert.equal(dispatcher.list()[0].status, 'needs input');
});

test('a completed turn with a blocking question raises an attention alert', async () => {
  const dispatcher = createDispatcher({
    cwd: '/tmp/example',
    rpc: async method => method === 'thread/start' ? { thread: { id: 'blocked' } } : {}
  });
  const job = await dispatcher.start({ title: 'Observatory', brief: 'Build a fictional dashboard' });
  dispatcher.event('item/completed', { threadId: job.id, item: {
    type: 'agentMessage', text: 'NEEDS_INPUT: Show uptime or observation counts?'
  } });
  dispatcher.event('turn/completed', { threadId: job.id, turn: { status: 'completed' } });
  assert.equal(job.status, 'needs input');
  assert.equal(job.attention, 'Show uptime or observation counts?');
});
