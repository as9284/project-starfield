export const TTS_VOICES = [
  { id: "af_heart", name: "Luna (Warm)", gender: "female", style: "warm" },
  { id: "af_bella", name: "Luna (Bright)", gender: "female", style: "bright" },
  { id: "af_nova", name: "Luna (Clear)", gender: "female", style: "clear" },
  { id: "am_adam", name: "Orion", gender: "male", style: "neutral" },
  { id: "am_onyx", name: "Sirius", gender: "male", style: "deep" },
] as const;

export type TTSVoiceId = (typeof TTS_VOICES)[number]["id"];

export const DEFAULT_TTS_VOICE: TTSVoiceId = "af_heart";
export const DEFAULT_TTS_SPEED = 1.0;
export const TTS_MIN_SPEED = 0.8;
export const TTS_MAX_SPEED = 1.5;
export const TTS_SPEED_STEP = 0.1;
export const TTS_SAMPLE_RATE = 24000;
