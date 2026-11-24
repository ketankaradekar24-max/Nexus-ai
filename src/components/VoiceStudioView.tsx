import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Radio, Send, Upload, Volume2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function float32ToBase64Pcm16(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64Pcm16ToFloat32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;
  return float32;
}

export const VoiceStudioView: React.FC = () => {
  const { getFreshToken, apiFetch } = useAuth();
  const [tab, setTab] = useState<'live' | 'batch'>('live');

  // Live Duplex Session State
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [voiceName, setVoiceName] = useState<'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir'>('Zephyr');
  const [language, setLanguage] = useState('');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [liveTextInput, setLiveTextInput] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const inCtxRef = useRef<AudioContext | null>(null);
  const outCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Batch STT & TTS State
  const [batchTranscript, setBatchTranscript] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [ttsText, setTtsText] = useState('');
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  const stopPlaybackQueue = () => {
    for (const s of activeSourcesRef.current) {
      try {
        s.stop();
      } catch {
        // ignore
      }
    }
    activeSourcesRef.current = [];
    if (outCtxRef.current) {
      nextStartTimeRef.current = outCtxRef.current.currentTime;
    }
  };

  const stopLiveSession = () => {
    stopPlaybackQueue();
    wsRef.current?.close();
    wsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void inCtxRef.current?.close();
    inCtxRef.current = null;
    void outCtxRef.current?.close();
    outCtxRef.current = null;
    setConnected(false);
    setConnecting(false);
  };

  useEffect(() => {
    return () => stopLiveSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startLiveSession = async () => {
    setConnecting(true);
    setLiveError(null);
    try {
      const token = await getFreshToken();
      if (!token) throw new Error('Sign in required for Live Voice.');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inCtx = new AudioContext({ sampleRate: 16000 });
      const outCtx = new AudioContext({ sampleRate: 24000 });
      inCtxRef.current = inCtx;
      outCtxRef.current = outCtx;
      nextStartTimeRef.current = outCtx.currentTime;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws/live?token=${encodeURIComponent(token)}&voice=${encodeURIComponent(voiceName)}&lang=${encodeURIComponent(language)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        const source = inCtx.createMediaStreamSource(stream);
        const processor = inCtx.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        processor.connect(inCtx.destination);
        processor.onaudioprocess = (ev) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const b64 = float32ToBase64Pcm16(ev.inputBuffer.getChannelData(0));
          ws.send(JSON.stringify({ type: 'audio', data: b64 }));
        };
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'ready') {
          setConnecting(false);
          setConnected(true);
        } else if (msg.type === 'audio' && msg.data && outCtxRef.current) {
          const floatData = base64Pcm16ToFloat32(msg.data);
          const buf = outCtxRef.current.createBuffer(1, floatData.length, 24000);
          buf.getChannelData(0).set(floatData);
          const node = outCtxRef.current.createBufferSource();
          node.buffer = buf;
          node.connect(outCtxRef.current.destination);
          const startAt = Math.max(outCtxRef.current.currentTime, nextStartTimeRef.current);
          node.start(startAt);
          nextStartTimeRef.current = startAt + buf.duration;
          activeSourcesRef.current.push(node);
          node.onended = () => {
            activeSourcesRef.current = activeSourcesRef.current.filter((x) => x !== node);
          };
        } else if (msg.type === 'interrupted') {
          stopPlaybackQueue();
        } else if (msg.type === 'input_transcript' && msg.text) {
          setTranscripts((prev) => [...prev, { role: 'user', text: msg.text }]);
        } else if (msg.type === 'output_transcript' && msg.text) {
          setTranscripts((prev) => [...prev, { role: 'assistant', text: msg.text }]);
        } else if (msg.type === 'error') {
          setLiveError(msg.message || 'Live voice error');
        }
      };

      ws.onerror = () => {
        setLiveError('WebSocket connection error.');
        stopLiveSession();
      };

      ws.onclose = () => {
        setConnected(false);
        setConnecting(false);
      };
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : 'Unable to start microphone session.');
      stopLiveSession();
    }
  };

  const handleUploadAudioTranscribe = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTranscribing(true);
    setBatchError(null);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const res = await apiFetch('/api/voice/transcribe', {
        method: 'POST',
        body: JSON.stringify({
          mimeType: file.type || 'audio/mp3',
          base64Audio: btoa(bin),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transcription failed.');
      setBatchTranscript(data.transcript || '');
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Transcription error.');
    } finally {
      setTranscribing(false);
      e.target.value = '';
    }
  };

  const handleSynthesizeSpeech = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ttsText.trim() || synthesizing) return;
    setSynthesizing(true);
    setBatchError(null);
    try {
      const res = await apiFetch('/api/voice/tts', {
        method: 'POST',
        body: JSON.stringify({ text: ttsText, voiceName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'TTS failed.');
      setTtsAudioUrl(data.audioDataUrl);
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Speech synthesis failed.');
    } finally {
      setSynthesizing(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold">Voice & Multimodal Audio</h1>
            <p className="text-xs text-neutral-500 mt-1">
              Real-time duplex WebSocket voice (16kHz in / 24kHz out) separated cleanly from unary audio-file transcription and TTS.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-200/70 dark:bg-[#181A20]">
            <button
              type="button"
              onClick={() => setTab('live')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                tab === 'live'
                  ? 'bg-white dark:bg-[#0C0D10] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              Real-Time Voice (Live)
            </button>
            <button
              type="button"
              onClick={() => setTab('batch')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                tab === 'batch'
                  ? 'bg-white dark:bg-[#0C0D10] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              Audio Transcription & TTS
            </button>
          </div>
        </div>

        {tab === 'live' ? (
          <div className="p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={voiceName}
                  disabled={connected}
                  onChange={(e) => setVoiceName(e.target.value as typeof voiceName)}
                  className="px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
                >
                  <option value="Zephyr">Voice: Zephyr</option>
                  <option value="Kore">Voice: Kore</option>
                  <option value="Puck">Voice: Puck</option>
                  <option value="Charon">Voice: Charon</option>
                  <option value="Fenrir">Voice: Fenrir</option>
                </select>
                <input
                  type="text"
                  disabled={connected}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="Optional language (e.g. Spanish, French)"
                  className="px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10] w-56"
                />
              </div>

              {connected ? (
                <button
                  type="button"
                  onClick={stopLiveSession}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold cursor-pointer"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span>End Live Session</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startLiveSession}
                  disabled={connecting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold cursor-pointer"
                >
                  {connecting ? <Radio className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                  <span>{connecting ? 'Connecting...' : 'Start Live Voice'}</span>
                </button>
              )}
            </div>

            {liveError && (
              <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-500">
                {liveError}
              </div>
            )}

            <div className="h-72 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10] p-4 space-y-3">
              {transcripts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-xs text-neutral-500 text-center">
                  {connected ? (
                    <>
                      <Mic className="w-6 h-6 text-[#D4B483] mb-2" />
                      <p>Listening via Gemini Live (16kHz PCM). Speak naturally or interrupt anytime.</p>
                    </>
                  ) : (
                    <>
                      <MicOff className="w-6 h-6 text-neutral-400 mb-2" />
                      <p>Start a live session to converse in real time with interruptible spoken audio.</p>
                    </>
                  )}
                </div>
              ) : (
                transcripts.map((t, idx) => (
                  <div key={idx} className="text-xs leading-relaxed">
                    <span className="font-semibold text-[#B8893A] dark:text-[#D4B483] mr-2">
                      {t.role === 'user' ? 'You:' : 'SUB AI:'}
                    </span>
                    <span>{t.text}</span>
                  </div>
                ))
              )}
            </div>

            {connected && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!liveTextInput.trim() || !wsRef.current) return;
                  wsRef.current.send(JSON.stringify({ type: 'text', text: liveTextInput.trim() }));
                  setTranscripts((p) => [...p, { role: 'user', text: liveTextInput.trim() }]);
                  setLiveTextInput('');
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={liveTextInput}
                  onChange={(e) => setLiveTextInput(e.target.value)}
                  placeholder="Send text message into active live voice session..."
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg bg-[#D4B483] text-[#0C0D10] text-xs font-semibold cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-4">
              <h2 className="font-display text-base font-semibold">
                Audio File Transcription (Batch STT)
              </h2>
              <p className="text-xs text-neutral-500">
                Upload pre-recorded MP3, WAV, or WebM files for transcription via gemini-3.5-transcribe.
              </p>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-medium cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800">
                <Upload className="w-4 h-4" />
                <span>{transcribing ? 'Transcribing...' : 'Upload Audio File'}</span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleUploadAudioTranscribe}
                  className="hidden"
                />
              </label>
              {batchTranscript && (
                <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10] text-xs whitespace-pre-wrap leading-relaxed">
                  {batchTranscript}
                </div>
              )}
            </div>

            <form
              onSubmit={handleSynthesizeSpeech}
              className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-4"
            >
              <h2 className="font-display text-base font-semibold">Text-to-Speech Studio (WAV)</h2>
              <textarea
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                rows={4}
                placeholder="Enter text to synthesize via gemini-3.8-flash-lite-tts..."
                className="w-full p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10] text-xs"
              />
              <button
                type="submit"
                disabled={synthesizing || !ttsText.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold disabled:opacity-40 cursor-pointer"
              >
                <Volume2 className="w-4 h-4" />
                <span>{synthesizing ? 'Synthesizing...' : 'Generate Audio'}</span>
              </button>
              {ttsAudioUrl && <audio controls src={ttsAudioUrl} className="w-full" />}
            </form>

            {batchError && (
              <div className="md:col-span-2 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-500">
                {batchError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
