import type http from 'node:http';
import { Modality, type LiveServerMessage } from '@google/genai';
import { WebSocketServer, type WebSocket } from 'ws';
import { adminAuth } from '../src/lib/firebase-admin.ts';
import { getOrCreateUser } from '../src/db/users.ts';
import { createGeminiClient } from './ai/adapters.ts';

export function attachLiveVoiceGateway(server: http.Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/ws/live') {
        return;
      }

      const token = url.searchParams.get('token') || '';
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const decoded = await adminAuth.verifyIdToken(token);
      const dbUser = await getOrCreateUser(decoded.uid, decoded.email || '');
      const voiceName = url.searchParams.get('voice') || 'Zephyr';
      const language = url.searchParams.get('lang') || '';

      wss.handleUpgrade(req, socket, head, (ws) => {
        void handleLiveConnection(ws, dbUser.id, voiceName, language);
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });
}

async function handleLiveConnection(
  clientWs: WebSocket,
  _userId: number,
  voiceName: string,
  language: string,
) {
  let session: Awaited<ReturnType<ReturnType<typeof createGeminiClient>['live']['connect']>> | null = null;
  let closed = false;

  try {
    const ai = createGeminiClient();
    const safeVoice = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].includes(voiceName)
      ? voiceName
      : 'Zephyr';

    const sysInstruction = language
      ? `You are SUB AI in a real-time spoken voice conversation. Keep responses natural, concise, and helpful. Converse in ${language} unless the user switches languages.`
      : 'You are SUB AI in a real-time spoken voice conversation. Keep responses natural, concise, and helpful.';

    session = await ai.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: safeVoice },
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: sysInstruction,
      },
      callbacks: {
        onopen: () => {
          if (!closed && clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({ type: 'ready', model: 'gemini-3.8-live' }));
          }
        },
        onmessage: (message: LiveServerMessage) => {
          if (closed || clientWs.readyState !== 1) return;

          const sc = message.serverContent;
          if (sc?.inputTranscription?.text) {
            clientWs.send(
              JSON.stringify({ type: 'input_transcript', text: sc.inputTranscription.text }),
            );
          }
          if (sc?.outputTranscription?.text) {
            clientWs.send(
              JSON.stringify({ type: 'output_transcript', text: sc.outputTranscription.text }),
            );
          }
          for (const part of sc?.modelTurn?.parts ?? []) {
            if (part.inlineData?.data) {
              clientWs.send(JSON.stringify({ type: 'audio', data: part.inlineData.data }));
            }
          }
          if (sc?.interrupted) {
            clientWs.send(JSON.stringify({ type: 'interrupted' }));
          }
          if (sc?.turnComplete) {
            clientWs.send(JSON.stringify({ type: 'turn_complete' }));
          }
        },
        onerror: (err) => {
          if (!closed && clientWs.readyState === 1) {
            clientWs.send(
              JSON.stringify({
                type: 'error',
                message: err instanceof Error ? err.message : 'Live voice stream error.',
              }),
            );
          }
        },
      },
    });
  } catch (err) {
    if (clientWs.readyState === 1) {
      clientWs.send(
        JSON.stringify({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to connect to Gemini Live.',
        }),
      );
      clientWs.close();
    }
    return;
  }

  clientWs.on('message', (raw) => {
    if (closed || !session) return;
    try {
      const msg = JSON.parse(raw.toString()) as { type?: string; data?: string; text?: string };
      if (msg.type === 'audio' && msg.data) {
        session.sendRealtimeInput({
          audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
        });
      } else if (msg.type === 'text' && msg.text) {
        session.sendRealtimeInput({ text: msg.text });
      }
    } catch {
      // ignore malformed frames
    }
  });

  const cleanup = () => {
    if (closed) return;
    closed = true;
    try {
      session?.close();
    } catch {
      // ignore
    }
  };

  clientWs.on('close', cleanup);
  clientWs.on('error', cleanup);
}
