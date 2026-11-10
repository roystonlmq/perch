const fixtures = {
  jobs: { title: 'Fictional job search', brief: 'Find three sample robotics roles in the fictional city of Meridian Bay.' },
  research: { title: 'Fictional vendor research', brief: 'Compare the invented vendors Lantern Audio, Echo Orchard and Paperwave.' },
  build: { title: 'Moonbeam dashboard', brief: 'Design a dashboard for the fictional Moonbeam Observatory.', attention: 'Should the Moonbeam dashboard show telescope uptime or observation counts first?' }
};

export function createDispatcher({ demo = false, cwd, model, rpc, initialJobs = [] } = {}) {
  const jobs = new Map(initialJobs.map(job => [job.id, job]));
  let sequence = Math.max(0, ...initialJobs.map(job => job.alert ?? 0));
  function event(method, params) {
    const job = jobs.get(params.threadId);
    if (!job) return;
    if (/requestUserInput|requestApproval|elicitation\/request/.test(method)) {
      job.status = 'needs input';
      job.attention = params.questions?.map(item => item.question).join(' ') ||
        'Codex needs your input or approval.';
      job.alert = ++sequence;
    }
    if (method === 'item/completed' && params.item?.type === 'agentMessage') {
      job.reply = params.item.text;
    }
    if (method === 'turn/completed') {
      const question = job.reply?.match(/^\s*NEEDS_INPUT:\s*(\S[\s\S]*)/i)?.[1].trim();
      if (params.turn.status === 'completed' && question) {
        job.status = 'needs input';
        job.attention = question;
        job.alert = ++sequence;
      } else if (job.status !== 'needs input') {
        job.status = params.turn.status;
        if (job.status === 'failed') job.failure = 'Open the Codex chat to review or retry the failed turn.';
      }
    }
  }
  return {
    list: () => [...jobs.values()],
    event,
    async start({ fixture, title, brief }) {
      if (demo) {
        const example = Object.hasOwn(fixtures, fixture) && fixtures[fixture];
        if (!example) throw new Error('Choose a fictional demo brief.');
        const job = { ...example, id: `demo-${++sequence}`, status: 'running' };
        const question = job.attention;
        delete job.attention;
        jobs.set(job.id, job);
        setTimeout(() => {
          job.status = question ? 'needs input' : 'completed';
          if (question) {
            job.attention = question;
            job.alert = ++sequence;
          }
        }, 1200).unref();
        return job;
      }
      if (typeof title !== 'string' || !title.trim() || title.length > 120 ||
          typeof brief !== 'string' || !brief.trim() || brief.length > 4000) {
        throw new Error('Provide a short title and a task brief.');
      }
      const { thread } = await rpc('thread/start', {
        cwd, model, sandbox: 'workspace-write', approvalPolicy: 'on-request'
      });
      const job = { id: thread.id, title, status: 'running', url: `codex://threads/${encodeURIComponent(thread.id)}` };
      jobs.set(job.id, job);
      try {
        await rpc('thread/name/set', { threadId: thread.id, name: title });
        await rpc('turn/start', { threadId: thread.id, input: [{
          type: 'text',
          text: `${brief}\n\nIf a user decision blocks progress, ask the question in a final reply beginning with NEEDS_INPUT: so the voice launcher can notify the user.`
        }] });
        return job;
      } catch (error) {
        job.status = 'failed';
        throw error;
      }
    },
    answerDemo(id) {
      const job = jobs.get(id);
      if (!demo || !job?.attention) throw new Error('There is no pending demo question.');
      delete job.attention;
      job.status = 'completed';
      return job;
    }
  };
}
