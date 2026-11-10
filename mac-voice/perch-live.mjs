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
  let recording, capture, chunks = [];
  let poll, busy = false, closed = false;
  const gate = createVoiceTurn(volume => connection?.setVolume({ volume }));
  const refresh = async () => jobs((await (await api('jobs')).json()).jobs);

  function releaseMic() {
    capture?.getTracks().forEach(track => track.stop());
    capture = undefined;
  }

  async function toggle() {
    if (busy || closed) return;
    busy = true;
    try {
      if (!recording) {
        playback?.abort();
        gate.reset();
        capture = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (closed) { releaseMic(); return; }
        const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
          .find(format => MediaRecorder.isTypeSupported(format));
        if (!type) throw Error('This browser cannot record audio for dictation.');
        chunks = [];
        recording = new MediaRecorder(capture, { mimeType: type });
        recording.ondataavailable = ({ data }) => { if (data.size) chunks.push(data); };
        recording.start();
        mic(true, 'Recording locally. Press Option + V again to send.');
        return;
      }
      const recorder = recording;
      recording = undefined;
      mic(false, 'Transcribing with ElevenLabs…');
      await new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = () => reject(Error('The recording could not be read.'));
        recorder.stop();
      });
      releaseMic();
      if (closed) return;
      const audio = new Blob(chunks, { type: recorder.mimeType });
      chunks = [];
      const response = await fetch('/api/dictation', {
        method: 'POST', headers: { 'X-Perch': '1', 'Content-Type': audio.type },
        body: audio, signal: AbortSignal.timeout(40000)
      });
      const { text, error } = await response.json();
      if (!response.ok) throw Error(error);
      if (closed) return;
      if (!text) { caption('No speech detected. Press Option + V to try again.'); return; }
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
            if (recording || closed) return;
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
            clearTimeout(idleTimer);
            gate.reset();
            if (reason !== 'user' && !recording) caption('Connection ended. Your next dictation will reconnect.');
          }
        });
        if (closed) { await connection.endSession(); return; }
        poll ??= setInterval(() => refresh().catch(() => {}), 1500);
      }
      gate.press();
      gate.transcript(text);
      gate.release();
      caption('Heard: ' + text);
      connection.sendUserMessage(text);
    } catch (error) {
      releaseMic();
      recording = undefined;
      if (!closed) mic(false, error.message);
    } finally {
      busy = false;
    }
  }

  async function play(text) {
    if (recording || busy) return;
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
      if (recording?.state === 'recording') recording.stop();
      recording = undefined;
      releaseMic();
      playback?.abort();
      if (connection) await connection.endSession();
    }
  };
}
