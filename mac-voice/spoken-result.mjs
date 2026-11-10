export const voiceBrief = [
  'This task was requested by voice. Give the full answer first.',
  'When finished, append a VOICE_BRIEF: section of about 60 to 120 words that stands on its own when read aloud.',
  'Include concrete findings or deliverables, the recommended option and why, and any real decision the user needs to make with options and trade-offs. Avoid raw links.',
  'If blocked on a decision, use the launcher’s NEEDS_INPUT: format instead and include the options and trade-off in plain language.'
].join(' ');

export function resultParts(reply = '') {
  const match = /^\s*VOICE_BRIEF:\s*(\S[\s\S]*)/im.exec(reply);
  return {
    answer: match ? reply.slice(0, match.index).trim() : reply.trim(),
    spoken: match?.[1].trim() || reply.trim()
  };
}

export function speechText(text) {
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+|[*#`]/g, '').replace(/\s+/g, ' ').trim();
}

export function jobUpdates(jobs, includeDetails) {
  return jobs.map(({ id, title, status, reply, attention }) => {
    const update = { id, title, status };
    if (includeDetails && status === 'completed' && reply) {
      const { spoken, answer } = resultParts(reply);
      update.findings = speechText(spoken).slice(0, 3200);
      if (answer !== spoken) update.supporting_details = speechText(answer).slice(0, 3200);
    }
    if (includeDetails && attention) update.decision_needed = speechText(attention).slice(0, 3200);
    return update;
  });
}
