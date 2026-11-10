# Perch

Perch is a translucent voice HUD for starting and tracking Codex sessions on a Mac. **Option + V** toggles the mic or runs a fictional sample. **Option + H** tucks the widget away. The shortcuts work while the page has focus.

## Rehearse offline

Open [voice-hud-demo.html](voice-hud-demo.html) in a browser. The rehearsal uses fictional requests, notifications and decisions, with prerecorded ElevenLabs speech embedded in the HTML for offline playback.

## Run a live demo

Install Node.js 22.9 or newer, the Codex CLI (or ChatGPT desktop app), and the [ElevenLabs CLI](https://elevenlabs.io/docs/eleven-agents/operate/cli). Sign in to Codex using the desktop app or `codex login`. Then run these commands from the repository root:

```sh
npm --prefix mac-voice ci
elevenlabs auth login
npm --prefix mac-voice run setup:elevenlabs
```

The setup adds **Jacqueline – Casual** from the Voice Library if needed, then creates an authenticated agent with the supplied prompt, Codex client tools, and voice settings. It writes the generated agent and voice IDs to the ignored `.perch.env` file. Your ElevenLabs credential stays with the CLI. Rerunning setup with that file present reuses the existing settings.

If you already have a compatible agent, skip provisioning and set `VOICE_ELEVENLABS_AGENT_ID` and `VOICE_ELEVENLABS_BRIEFING_VOICE` in your environment or in `.perch.env` at the repository root. To validate the template locally without creating an agent, run `npm --prefix mac-voice run setup:elevenlabs -- --dry-run`.

Start the live launcher from the repository root:

```sh
PORT=8767 VOICE_CODEX_WORKSPACE="$PWD" npm --prefix mac-voice start -- --live
```

In another terminal, run:

```sh
npm --prefix mac-voice run perch
```

Open http://127.0.0.1:8772, choose **Go live**, and press **Option + V**. Speak at your own pace, then press it again to send the complete recording for ElevenLabs transcription. Perch keeps the recording in your browser until you stop. It then uses Scribe v2 to transcribe it and sends the result as one text turn. The agent speaks with Jacqueline, and on-demand job briefings use the same voice through Flash v2.5. Jobs started from Perch get a real Codex session. Open a job to read its answer, play a briefing, or jump to Codex.

Live mode sends speech and spoken briefing text to ElevenLabs. Both local servers bind to loopback. Use fictional tasks when presenting.

Run the tests with `npm --prefix mac-voice test`.
