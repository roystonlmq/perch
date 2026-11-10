import { Conversation } from '@elevenlabs/client';
import { createVoiceTurn } from './voice-turn.mjs';
import { jobUpdates, resultParts, speechText, voiceBrief } from './spoken-result.mjs';

async function api(path, data, signal) {
  const response = await fetch('/api/' + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'X-Perch': '1', 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal
  });
  if (!response.ok) throw Error((await response.json()).error);
  return response;
}

export function createPerchLive({ mic, caption, jobs }) {
  let connection, playback, idleTimer;
  let listening = false;
  let poll, busy = false, closed = false;
  const gate = createVoiceTurn(volume => connection?.setVolume({ volume }));
  const refresh = async () => jobs((await (await api('jobs')).json()).jobs);

  async function toggle() {
    if (busy || closed) return;
    busy = true;
    try {
      if (!connection) {
        caption('Connecting to ElevenLabs…');
        const { signedUrl } = await (await api('connect', {})).json();
        if (closed) return;
        connection = await Conversation.startSession({
          signedUrl, connectionType: 'websocket',
          onConversationCreated: session => {
            session.setMicMuted(true);
            session.setVolume({ volume: 0 });
          },
          clientTools: {
            start_codex_job: async ({ title, brief }) => {
              try {
                const prompt = brief.slice(0, 3200) + '\n\n' + voiceBrief;
                const job = await (await api('start', { title, brief: prompt })).json();
                refresh().catch(() => {});
                return JSON.stringify({ id: job.id, title: job.title, status: job.status });
              } catch (error) {
                caption(error.message);
                return '{"status":"failed","error":"Could not start the Codex session."}';
              }
            },
            list_codex_jobs: async ({ include_details } = {}) =>
              JSON.stringify(jobUpdates((await (await api('jobs')).json()).jobs, include_details === true))
          },
          onMessage: ({ role, message }) => {
            if (role === 'user') {
              gate.transcript(message);
              caption('Heard: ' + message);
            } else if (role === 'agent' && gate.reply(message)) {
              caption(message);
            }
          },
          onModeChange: ({ mode }) => {
            clearTimeout(idleTimer);
            if (mode === 'listening') idleTimer = setTimeout(() => gate.listening(), 800);
          },
          onDisconnect: ({ reason }) => {
            connection = undefined;
            listening = false;
            clearTimeout(idleTimer);
            gate.reset();
            if (reason !== 'user') mic(false, 'Connection ended. Press Option + V to reconnect.');
          }
        });
        if (closed) { await connection.endSession(); return; }
        poll ??= setInterval(() => refresh().catch(() => {}), 1500);
      }
      listening = !listening;
      if (listening) {
        playback?.abort();
        gate.press();
      } else {
        gate.release();
      }
      connection.setMicMuted(!listening);
      mic(listening, listening ? 'Mic on. Press Option + V again to mute.' : 'Mic muted. Waiting for a reply.');
    } catch (error) {
      if (!closed) mic(false, error.message);
    } finally {
      busy = false;
    }
  }

  async function play(text) {
    playback?.abort();
    const controller = new AbortController();
    playback = controller;
    let url;
    try {
      const response = await api('briefing-audio', { text: speechText(text).slice(0, 5000) }, controller.signal);
      url = URL.createObjectURL(await response.blob());
      if (controller.signal.aborted) return;
      const audio = new Audio(url);
      await new Promise((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = () => reject(Error('Could not play the briefing.'));
        controller.signal.addEventListener('abort', () => { audio.pause(); resolve(); }, { once: true });
        audio.play().catch(reject);
      });
    } catch (error) {
      if (!controller.signal.aborted) caption(error.message);
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  return {
    toggle, refresh, play, resultParts,
    async close() {
      closed = true;
      clearInterval(poll);
      playback?.abort();
      if (connection) await connection.endSession();
    }
  };
}
