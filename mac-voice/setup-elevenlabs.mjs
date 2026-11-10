import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import settings from '../agent_configs/elevenlabs.json' with { type: 'json' };

const envFile = new URL('../.perch.env', import.meta.url);
const template = new URL('../agent_configs/voice-dispatcher-mac.json', import.meta.url);

function cli(args, input) {
  const result = spawnSync(process.env.ELEVENLABS_BIN || 'elevenlabs', args, {
    input, encoding: 'utf8', timeout: 60000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(result.stderr.trim() || 'ElevenLabs command failed.');
  return result.stdout;
}

function setup() {
  if (process.argv.includes('--dry-run')) {
    cli(['agents', 'create', '--dry-run', '--json', '-'], readFileSync(template, 'utf8'));
    console.log('Agent template passed local CLI validation.');
    return;
  }
  if (existsSync(envFile)) {
    console.log('Perch is already configured in .perch.env. Use the existing settings to run it.');
    return;
  }
  writeFileSync(envFile, '', { flag: 'wx', mode: 0o600 });
  try {
    const { voice } = settings;
    try {
      cli(['voices', 'get', '--voice-id', voice.id, '--format', 'json']);
    } catch {
      cli(['voices', 'share', '--public-user-id', voice.publicOwnerId, '--voice-id', voice.id,
        '--new-name', voice.name, '--format', 'json']);
    }

    const { agent_id: agentId } = JSON.parse(
      cli(['agents', 'create', '--no-retry', '--json', '-', '--format', 'json'], readFileSync(template, 'utf8'))
    );
    if (!/^agent_[A-Za-z0-9]+$/.test(agentId)) throw Error('ElevenLabs did not return a valid agent ID.');
    writeFileSync(envFile, `VOICE_ELEVENLABS_AGENT_ID=${agentId}\nVOICE_ELEVENLABS_BRIEFING_VOICE=${voice.id}\n`);
    console.log('Created the Perch agent with Jacqueline. Local settings saved in .perch.env.');
  } catch (error) {
    unlinkSync(envFile);
    throw error;
  }
}

try {
  setup();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
