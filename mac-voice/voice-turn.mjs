export function createVoiceTurn(setVolume, now = Date.now) {
  let inputUntil = 0;
  let responseUntil = 0;
  let heardReply = false;

  function mute() {
    responseUntil = 0;
    heardReply = false;
    setVolume(0);
  }

  return {
    press() {
      inputUntil = Infinity;
      mute();
    },
    release() {
      if (inputUntil === Infinity) inputUntil = now() + 12000;
    },
    transcript(text) {
      if (text.trim() && now() < inputUntil) {
        responseUntil = now() + 60000;
        heardReply = false;
      }
    },
    reply(text) {
      if (!responseUntil || now() >= responseUntil ||
          /^(?:\[[^\]]+\]\s*)*(?:are you still there|i(?:['’]m| am) still here|just checking (?:in|if))/i.test(text.trim())) {
        mute();
        return false;
      }
      const line = text.trim().replace(/^(?:\[[^\]]+\]\s*)+/, '');
      if (/^I(?:['’]ll| will) (?:pull up|check|look up|fetch) (?:the |those |your )?(?:details|results|jobs|status)[^.?!]*[.!]?$/i.test(line)) {
        setVolume(0);
        return false;
      }
      heardReply = true;
      setVolume(1);
      return true;
    },
    listening() {
      if (heardReply) {
        if (inputUntil !== Infinity) inputUntil = 0;
        mute();
      }
    },
    waiting() {
      return now() < Math.max(inputUntil, responseUntil);
    },
    reset() {
      inputUntil = 0;
      mute();
    }
  };
}
