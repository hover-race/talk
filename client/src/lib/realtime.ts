import { audioBus } from "./audio";
import { applySettings, readSettings } from "./settings";
import { mintClientSecret } from "./session";
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
    const store = useTalkStore();
    store.setError(null);
    store.setMicEnabled(mic);
    store.setStatus("connecting");

    const apiKey = store.apiKey;
    if (!apiKey) {
      store.setStatus("offline");
      store.setError("Add your OpenAI API key to start talking.");
      return;
    }

    let ephemeralKey: string;
    try {
      const { value } = await mintClientSecret(apiKey, {
        voice: store.voice,
        patienceMs: store.patienceMs,
        mic,
        settings: readSettings(),
      });
      ephemeralKey = value;
    } catch (err) {
      store.setStatus("offline");
      store.setError(
        err instanceof Error ? err.message : "Failed to create session.",
      );
      return;
    }

    const pc = new RTCPeerConnection();
    this.pc = pc;

    pc.ontrack = (e) => {
      audioBus.attachRemoteStream(e.streams[0]);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        useTalkStore().setStatus("offline");
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
      pc.addTransceiver("audio", { direction: "recvonly" });
    }

    const dc = pc.createDataChannel("oai-events");
    this.dc = dc;
    dc.addEventListener("message", (e) =>
      this.handleEvent(JSON.parse(e.data) as ServerEvent),
    );
    const open = new Promise<void>((resolve) => {
      dc.addEventListener("open", () => {
        useTalkStore().setStatus("idle");
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
    useTalkStore().setStatus("offline");
  }

  setMuted(muted: boolean) {
    this.mic?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
    useTalkStore().setMuted(muted);
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
    useTalkStore().setStatus("thinking");
  }

  private send(event: Record<string, unknown>) {
    if (this.dc?.readyState !== "open") return;
    this.dc.send(JSON.stringify(event));
  }

  private handleEvent(event: ServerEvent) {
    const store = useTalkStore();

    switch (event.type) {
      case "input_audio_buffer.speech_started": {
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
    const store = useTalkStore();
    let output: unknown = { ok: true };

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

    if (name === "update_settings") {
      output = applySettings(JSON.parse(args));
    }

    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output),
      },
    });
    this.send({ type: "response.create" });
  }
}

export const realtime = new RealtimeSession();
