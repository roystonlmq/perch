import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jobUpdates, resultParts, speechText } from '../spoken-result.mjs';

test('speaks the purpose-written briefing and keeps the complete answer available', () => {
  const reply = '## Findings\n[Orchard Cafe](https://example.com) has a lunch buffet.\n\nVOICE_BRIEF: Orchard Cafe has a lunch buffet. Choose lunch or dinner.';
  assert.deepEqual(resultParts(reply), {
    answer: '## Findings\n[Orchard Cafe](https://example.com) has a lunch buffet.',
    spoken: 'Orchard Cafe has a lunch buffet. Choose lunch or dinner.'
  });
  assert.equal(speechText(resultParts(reply).answer), 'Findings Orchard Cafe has a lunch buffet.');
});

test('older answers without a briefing are still spoken', () => {
  assert.equal(resultParts('Buffet shortlist').spoken, 'Buffet shortlist');
});

test('job details include saved findings and open decisions on request', () => {
  const jobs = [
    { id: 'a', title: 'Lunch', status: 'completed', reply: 'Orchard Cafe serves lunch.' },
    { id: 'b', title: 'Dinner', status: 'needs input', attention: 'Weekday or weekend?' }
  ];
  const [lunch, dinner] = jobUpdates(jobs, true);
  assert.equal(lunch.findings, 'Orchard Cafe serves lunch.');
  assert.equal(dinner.decision_needed, 'Weekday or weekend?');
  assert.deepEqual(jobUpdates(jobs, false)[0], { id: 'a', title: 'Lunch', status: 'completed' });
});
