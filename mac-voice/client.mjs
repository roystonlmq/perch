import { createVoiceTurn } from './voice-turn.mjs';
import { jobUpdates, resultParts, speechText, voiceBrief } from './spoken-result.mjs';

const byId = id => document.getElementById(id);
const connect = byId('connect');
const talk = byId('talk');
const notice = byId('notice');
const cards = byId('jobs');
let conversation;
const alertSeen = new Set();
let previousJobs;
let agentSpeaking = false;
let playbackIdleTimer;
let briefing;
const pendingUpdates = [];
const voiceTurn = createVoiceTurn(volume => conversation?.setVolume({ volume }));

function stopBriefing() {
  briefing?.abort();
  briefing = undefined;
}

async function announceUpdates(allowDisconnected = false) {
  if ((!conversation && !allowDisconnected) || agentSpeaking || briefing || voiceTurn.waiting() ||
      talk.getAttribute('aria-pressed') === 'true' || !pendingUpdates.length) return;
  const controller = new AbortController();
  briefing = controller;
  let audioUrl;
  try {
    const response = await fetch('/api/briefing-audio', {
      method: 'POST',
      headers: { 'X-Voice-Launcher': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: pendingUpdates.shift().slice(0, 5000) }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Could not play the ElevenLabs briefing. Try replaying it from the job card.');
    audioUrl = URL.createObjectURL(await response.blob());
    if (controller.signal.aborted) return;
    const audio = new Audio(audioUrl);
    await new Promise((resolve, reject) => {
      audio.onended = resolve;
      audio.onerror = () => reject(new Error('Could not play the briefing audio.'));
      controller.signal.addEventListener('abort', () => { audio.pause(); resolve(); }, { once: true });
      audio.play().catch(reject);
    });
  } catch (error) {
    if (!controller.signal.aborted) showError(error);
  } finally {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (briefing === controller) briefing = undefined;
  }
}

function notifyJob(job, label, message, key, initial) {
  if (alertSeen.has(key)) return;
  alertSeen.add(key);
  if (initial) return;
  notice.textContent = label + ' · ' + job.title;
  if (window.Notification?.permission === 'granted') {
    try {
      const notification = new Notification(job.title, { body: message.slice(0, 240) });
      notification.onclick = () => { window.location.href = job.url; };
    } catch { /* The job card is still available if desktop notifications fail. */ }
  }
  if (conversation) pendingUpdates.push(message);
}

function playbackButton(label, message) {
  const button = document.createElement('button');
  button.textContent = label;
  button.onclick = () => {
    pendingUpdates.push(message);
    announceUpdates(true);
  };
  return button;
}

function spokenAnswer(job) {
  const answer = speechText(resultParts(job.reply).spoken);
  return job.title + ' is done.' + (answer ? ' ' + answer : '');
}

async function api(path, body) {
  const response = await fetch('/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-Voice-Launcher': '1', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
function showError(error) {
  notice.textContent = error.message;
}
function paragraph(text) {
  const node = document.createElement('p');
  node.textContent = text;
  return node;
}
function render({ demo, jobs }) {
  const snapshot = JSON.stringify(jobs);
  if (previousJobs === snapshot) return;
  const initial = previousJobs === undefined;
  previousJobs = snapshot;
  const entries = jobs.map(job => {
    const card = document.createElement('article');
    const title = document.createElement('h3');
    title.textContent = job.title;
    card.append(title, paragraph(job.status));
    if (demo) card.append(paragraph(job.brief));
    if (job.failure) card.append(paragraph(job.failure));
    if (!demo && job.status === 'completed' && job.reply) {
      const result = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Read answer';
      const answer = paragraph(resultParts(job.reply).answer);
      answer.style.whiteSpace = 'pre-wrap';
      result.append(summary, answer);
      card.append(result, playbackButton('Play spoken briefing', spokenAnswer(job)));
    }
    if (!demo && ['completed', 'failed', 'interrupted'].includes(job.status)) {
      const message = job.status === 'completed' ? spokenAnswer(job) : job.title + ' ' + job.status + '.';
      notifyJob(job, job.status === 'completed' ? 'Finished' : job.status, message, job.id + ':' + job.status, initial);
    }
    if (job.attention) {
      card.append(paragraph(job.attention));
      if (demo) {
        const answer = document.createElement('button');
        answer.textContent = 'Choose telescope uptime';
        answer.onclick = () => api('demo-answer', { id: job.id }).then(refresh).catch(showError);
        const play = document.createElement('button');
        play.textContent = 'Play sample voice alert';
        play.onclick = () => new Audio('/demo-alert.m4a').play().catch(showError);
        card.append(play, answer);
      }
      const key = job.id + ':' + job.alert;
      if (demo) {
        if (!alertSeen.has(key)) notice.textContent = 'Demo ping · ' + job.title;
        alertSeen.add(key);
      } else {
        const message = job.title + ' needs your input. ' + speechText(job.attention);
        notifyJob(job, 'Needs input', message, key, initial);
        card.append(playbackButton('Play decision', message));
      }
    }
    if (job.url) {
      const link = document.createElement('a');
      link.href = job.url;
      link.textContent = 'Open in Codex';
      card.append(link);
    }
    return card;
  });
  cards.replaceChildren(...(entries.length ? entries : [paragraph('No jobs yet.')]));
}

async function refresh() {
  const state = await api('jobs');
  render(state);
  announceUpdates();
  return state;
}

function microphone(active) {
  if (!conversation || talk.disabled) return;
  if (active === (talk.getAttribute('aria-pressed') === 'true')) return;
  if (active) {
    voiceTurn.press();
    stopBriefing();
  } else {
    voiceTurn.release();
  }
  conversation.setMicMuted(!active);
  talk.setAttribute('aria-pressed', String(active));
  talk.textContent = active ? 'Mute mic' : 'Unmute mic';
  byId('voice-status').textContent = active ? 'Mic on' : 'Mic muted';
}
talk.onclick = () => microphone(talk.getAttribute('aria-pressed') !== 'true');

connect.onclick = async () => {
  connect.disabled = true;
  try {
    if (conversation) {
      microphone(false);
      await conversation.endSession();
      return;
    }
    const [{ Conversation }, { signedUrl }] = await Promise.all([
      Promise.resolve().then(() => import('@elevenlabs/client')),
      api('connect', {})
    ]);
    conversation = await Conversation.startSession({
      signedUrl,
      connectionType: 'websocket',
      onConversationCreated: session => {
        session.setMicMuted(true);
        session.setVolume({ volume: 0 });
      },
      clientTools: {
        start_codex_job: async ({ title, brief }) => {
          try {
            const job = await api('start', { title, brief: brief.slice(0, 3200) + '\n\n' + voiceBrief });
            refresh().catch(showError);
            return JSON.stringify({ status: job.status, title: job.title, id: job.id });
          } catch (error) {
            showError(error);
            return JSON.stringify({ status: 'failed', error: 'The local launcher could not start the job.' });
          }
        },
        list_codex_jobs: async ({ include_details } = {}) =>
          JSON.stringify(jobUpdates((await api('jobs')).jobs, include_details === true))
      },
      onMessage: ({ message, source, role }) => {
        if (source === 'user' || role === 'user') {
          voiceTurn.transcript(message);
          byId('heard').textContent = 'Heard: ' + message;
        }
        if ((source === 'ai' || role === 'agent') && voiceTurn.reply(message)) {
          byId('response').textContent = message;
        }
      },
      onModeChange: ({ mode }) => {
        clearTimeout(playbackIdleTimer);
        agentSpeaking = mode === 'speaking';
        if (!agentSpeaking) {
          playbackIdleTimer = setTimeout(() => voiceTurn.listening(), 800);
        }
      },
      onError: message => {
        byId('voice-status').textContent = 'Voice error. Reconnect if the mic stops responding.';
        console.warn(message);
      },
      onDisconnect: ({ reason }) => {
        clearTimeout(playbackIdleTimer);
        voiceTurn.reset();
        conversation = undefined;
        agentSpeaking = false;
        pendingUpdates.length = 0;
        stopBriefing();
        talk.disabled = true;
        talk.setAttribute('aria-pressed', 'false');
        talk.textContent = 'Unmute mic';
        connect.textContent = 'Connect voice';
        byId('voice-status').textContent = reason === 'user'
          ? 'Voice disconnected'
          : 'Voice connection ended. Select Connect voice to resume.';
      }
    });
    conversation.setMicMuted(true);
    talk.disabled = false;
    connect.textContent = 'Disconnect voice';
    byId('voice-status').textContent = 'Mic muted';
  } catch (error) {
    showError(error);
  } finally {
    connect.disabled = false;
  }
};

byId('notifications').onclick = async () => {
  if (!window.Notification) return showError(new Error('This browser does not support desktop pings.'));
  const permission = await Notification.requestPermission();
  notice.textContent = permission === 'granted' ? 'Desktop pings enabled.' : 'Attention requests appear on this page.';
};

refresh().then(({ demo }) => {
  byId('mode').textContent = demo ? 'Fictional demo · offline' : 'Live · local Mac launcher';
  byId('description').textContent = demo
    ? 'Try three invented briefs and a simulated decision alert. This mode uses no microphone, Codex jobs, or account data.'
    : 'Connect voice, tap Unmute mic to speak, then tap Mute mic when you’re done. Keep this page open for pings.';
  byId(demo ? 'demo' : 'live').hidden = false;
  for (const button of document.querySelectorAll('[data-fixture]')) {
    button.onclick = () => api('start', { fixture: button.dataset.fixture }).then(refresh).catch(showError);
  }
  setInterval(() => refresh().catch(showError), 1000);
}).catch(showError);
