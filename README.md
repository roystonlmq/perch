# Perch

Perch is a translucent voice HUD for starting and tracking Codex sessions on a Mac. **Option + V** toggles the mic or runs a fictional sample. **Option + H** tucks the widget away. The shortcuts work while the page has focus.

## Rehearse offline

Open [voice-hud-demo.html](voice-hud-demo.html) in a browser. The rehearsal uses fictional requests, notifications and decisions, with prerecorded ElevenLabs speech embedded in the HTML for offline playback.

## Run a live demo

Install Node.js and sign in to the Codex and ElevenLabs CLIs. Create your own authenticated ElevenLabs agent from the supplied template and copy the returned agent ID. Pick a voice in ElevenLabs, set that voice on the agent, and use its ID for spoken briefings.

```sh
npm --prefix mac-voice ci
elevenlabs agents create --json - < agent_configs/voice-dispatcher-mac.json
```

Start the live launcher from the repository root. Replace the two example IDs with yours.

```sh
PORT=8767 VOICE_CODEX_WORKSPACE="$PWD" \
VOICE_ELEVENLABS_AGENT_ID=your_agent_id \
VOICE_ELEVENLABS_BRIEFING_VOICE=your_voice_id \
npm --prefix mac-voice start -- --live
```

In another terminal, run:

```sh
npm --prefix mac-voice run perch
```

Open http://127.0.0.1:8772, choose **Go live**, and press **Option + V**. Speak, then press it again to mute. Jobs started from Perch get a real Codex session. Open a job to read its answer, play a briefing, or jump to Codex.

Live mode sends speech and spoken briefing text to ElevenLabs. Both local servers bind to loopback. Use fictional tasks when presenting.

Run the tests with `npm --prefix mac-voice test`.
