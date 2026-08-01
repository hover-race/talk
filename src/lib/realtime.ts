import { audioBus } from "./audio";
import { EXPRESSIONS, useTalkStore, type Expression } from "./store";

const CALLS_URL = "https://api.openai.com/v1/realtime/calls";

type ServerEvent = {
  type: string;
  [key: string]: unknown;
};

export class RealtimeSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  /** Set while assistant audio is playing, so transient events don't fight over status. */
  private speaking = false;

  get connected() {
    return this.dc?.readyState === "open";
  }

  async connect({ mic = true }: { mic?: boolean } = {}) {
    const store = useTalkStore.getState();
    store.setError(null);
    store.setMicEnabled(mic);
    store.setStatus("connecting");

    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voice: store.voice,
        patienceMs: store.patienceMs,
        mic,
      }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      store.setStatus("offline");
      store.setError(error ?? `Session request failed with ${res.status}`);
      return;
    }
    const { value: ephemeralKey } = await res.json();

    const pc = new RTCPeerConnection();
    this.pc = pc;

    pc.ontrack = (e) => {
      audioBus.attachRemoteStream(e.streams[0]);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        useTalkStore.getState().setStatus("offline");
      }
    };

    if (mic) {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      pc.addTrack(this.mic.getTracks()[0], this.mic);
    } else {
      // No mic track, but the assistant's audio still has to have somewhere to land.
      pc.addTransceiver("audio", { direction: "recvonly" });
    }

    const dc = pc.createDataChannel("oai-events");
    this.dc = dc;
    dc.addEventListener("message", (e) =>
      this.handleEvent(JSON.parse(e.data) as ServerEvent),
    );
    const open = new Promise<void>((resolve) => {
      dc.addEventListener("open", () => {
        useTalkStore.getState().setStatus("idle");
        resolve();
      });
      pc.addEventListener("connectionstatechange", () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          resolve();
        }
      });
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch(CALLS_URL, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        "Content-Type": "application/sdp",
      },
    });
    if (!sdpRes.ok) {
      const detail = await sdpRes.text();
      store.setStatus("offline");
      store.setError(`WebRTC handshake failed: ${detail}`);
      return;
    }

    await pc.setRemoteDescription({
      type: "answer",
      sdp: await sdpRes.text(),
    });

    await open;
  }

  disconnect() {
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    this.dc?.close();
    this.dc = null;
    this.pc?.close();
    this.pc = null;
    this.speaking = false;
    audioBus.detach();
    useTalkStore.getState().setStatus("offline");
  }

  setMuted(muted: boolean) {
    this.mic?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
    useTalkStore.getState().setMuted(muted);
  }

  sendText(text: string) {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
    this.send({ type: "response.create" });
    useTalkStore.getState().setStatus("thinking");
  }

  private send(event: Record<string, unknown>) {
    if (this.dc?.readyState !== "open") return;
    this.dc.send(JSON.stringify(event));
  }

  private handleEvent(event: ServerEvent) {
    const store = useTalkStore.getState();

    switch (event.type) {
      case "input_audio_buffer.speech_started": {
        // Cut assistant audio at the playback head immediately. Server VAD also
        // truncates its own context, but the browser has already buffered audio
        // that the user must not keep hearing after interrupting.
        if (this.speaking) {
          this.send({ type: "output_audio_buffer.clear" });
          this.speaking = false;
        }
        store.setStatus("listening");
        break;
      }

      case "input_audio_buffer.speech_stopped":
        store.setStatus("thinking");
        break;

      case "conversation.item.input_audio_transcription.delta":
        store.appendDelta(
          event.item_id as string,
          "user",
          (event.delta as string) ?? "",
        );
        break;

      case "conversation.item.input_audio_transcription.completed":
        store.setMessageText(
          event.item_id as string,
          "user",
          (event.transcript as string) ?? "",
        );
        store.finishMessage(event.item_id as string);
        break;

      case "response.created":
        store.setStatus("thinking");
        break;

      case "output_audio_buffer.started":
        this.speaking = true;
        store.setStatus("speaking");
        break;

      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        this.speaking = false;
        store.setStatus("idle");
        break;

      case "response.output_audio_transcript.delta":
      case "response.output_text.delta":
        store.appendDelta(
          event.item_id as string,
          "assistant",
          (event.delta as string) ?? "",
        );
        break;

      case "response.output_audio_transcript.done":
      case "response.output_text.done":
        store.finishMessage(event.item_id as string);
        break;

      case "response.function_call_arguments.done":
        this.handleFunctionCall(
          event.name as string,
          event.call_id as string,
          event.arguments as string,
        );
        break;

      case "response.done":
        if (!this.speaking) store.setStatus("idle");
        break;

      case "error":
        store.setError(JSON.stringify(event.error ?? event));
        break;
    }
  }

  private handleFunctionCall(name: string, callId: string, args: string) {
    const store = useTalkStore.getState();
    if (name === "set_expression") {
      const parsed = JSON.parse(args) as {
        emotion?: string;
        intensity?: number;
      };
      const emotion = (
        EXPRESSIONS as readonly string[]
      ).includes(parsed.emotion ?? "")
        ? (parsed.emotion as Expression)
        : "neutral";
      store.setExpression(
        emotion,
        Math.min(1, Math.max(0, parsed.intensity ?? 0.6)),
      );
    }

    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify({ ok: true }),
      },
    });
    // A tool call ends the response, so the model needs a new one to actually speak.
    // The expression therefore lands just before the voice does, which is the right order.
    this.send({ type: "response.create" });
  }
}

export const realtime = new RealtimeSession();
