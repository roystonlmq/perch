import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVoiceTurn } from '../voice-turn.mjs';

test('only speech after push to talk opens the output for one reply', () => {
  let time = 100;
  let volume;
  const turn = createVoiceTurn(value => { volume = value; }, () => time);
  turn.transcript('Background noise');
  assert.equal(turn.reply('Are you still there?'), false);
  turn.press();
  turn.release();
  turn.transcript('Find birthday ideas');
  assert.equal(turn.reply('I started the search.'), true);
  assert.equal(volume, 1);
  turn.listening();
  assert.equal(volume, 0);
  assert.equal(turn.reply('Can you hear me?'), false);
});

test('an empty push or a late reply leaves the output muted', () => {
  let time = 100;
  const turn = createVoiceTurn(() => {}, () => time);
  turn.press();
  turn.release();
  assert.equal(turn.reply('Hello?'), false);
  turn.transcript('A real request');
  time += 61000;
  assert.equal(turn.waiting(), false);
  assert.equal(turn.reply('Late reply'), false);
});


test('the mic can accept a follow-up while it remains unmuted', () => {
  const turn = createVoiceTurn(() => {}, () => 100);
  turn.press();
  turn.transcript('Find birthday ideas');
  assert.equal(turn.reply('What area?'), true);
  turn.listening();
  turn.transcript('Bedok');
  assert.equal(turn.reply('I’ll look in Bedok.'), true);
});
