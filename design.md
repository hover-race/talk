# Talking Head — Design

A web app that wraps ChatGPT in a face. You speak, an animated head listens, thinks, and speaks back with synchronized lip movement.

## 1. Goals

- **Conversational, not transactional.** Hold-down-to-talk is a fallback; the default is an always-listening, interruptible conversation.
- **Sub-second perceived latency.** The head must react (gaze shift, "thinking" expression) within ~200 ms of you finishing a sentence, even if the first audio token takes longer.
- **Convincing lip sync** without a server-side render pipeline. Everything animates in the browser off the live audio stream.
- **No API key in the browser.** A thin backend mints short-lived credentials.

### Non-goals (v1)

- Full-body avatars, hands, or scene composition. Head, neck, shoulders only.
- Custom avatar upload or per-user rigging.
- Multi-party conversation.
- Mobile-native apps. Responsive web only, though it must work in mobile Safari.

## 2. User experience

A single full-bleed view: the head centered, a subtle waveform ring around it, and a transcript that fades in below. No chrome beyond a mute button, a voice/model picker, and a text input for when you can't talk out loud.

The head is always alive. Even idle, it blinks on a Poisson schedule, drifts its gaze, and breathes. A perfectly still face reads as broken, and the uncanny-valley penalty for stillness is worse than for imperfect lip sync.

Four visible states, each with distinct body language:

| State | Trigger | Behavior |
| --- | --- | --- |
| Idle | No speech for ~4 s | Slow blink, gaze wander, occasional head tilt |
| Listening | Mic energy above VAD threshold | Direct eye contact, slight forward lean, brows raised |
| Thinking | User turn ended, no audio yet | Gaze breaks upward-left, small nod |
| Speaking | Assistant audio playing | Visemes drive the mouth, head moves on prosody |

Interruption is a first-class interaction. Talking over the head stops its audio immediately and it snaps to Listening — the way a person does when interrupted, not after finishing the sentence.

## 3. Architecture

```
┌─────────────────── Browser ───────────────────┐
│                                               │
│  Mic ──► MediaStream ──┐                      │
│                        │                      │
│  ┌─────────────────────▼───────────────────┐  │
│  │        RealtimeSession (WebRTC)         │  │
│  └─────────────────────┬───────────────────┘  │
│                        │ remote audio track   │
│         ┌──────────────┼──────────────┐       │
│         ▼              ▼              ▼       │
│   AudioElement    AnalyserNode    data channel│
│    (playback)     (lip sync)      (events)    │
│         │              │              │       │
│         │         viseme weights   transcript │
│         │              │           state      │
│         │              ▼              │       │
│         │      ┌───────────────┐      │       │
│         └─────►│  Avatar (R3F) │◄─────┘       │
│                └───────────────┘              │
└───────────────────────┬───────────────────────┘
                        │ POST /api/session
                        ▼
              ┌───────────────────┐      ┌──────────┐
              │  Backend (edge)   │─────►│  OpenAI  │
              │  ephemeral tokens │      │ Realtime │
              └───────────────────┘      └──────────┘
                        ▲                      ▲
                        └──── WebRTC SDP ──────┘
                             (direct, P2P-ish)
```

The browser talks to OpenAI's Realtime API directly over WebRTC. The backend exists only to mint ephemeral client secrets and to persist conversations — it is never in the audio path, which is what keeps latency low.

### Why the Realtime API over a pipeline

The obvious alternative is STT → Chat Completions → TTS, stitched together. It's cheaper and model-agnostic, but each hop adds latency and the round trip through text loses prosody and emotional tone. Speech-to-speech gets first-audio-out in roughly 500 ms versus 1.5–2.5 s for the pipeline, and it handles turn-taking and barge-in natively.

We keep the pipeline as a documented fallback (§7) because it's the escape hatch for cost control and for supporting non-OpenAI models later.

### Request flow

1. Client calls `POST /api/session`. Backend calls OpenAI to create a client secret scoped to one session with a short TTL, plus the system instructions and voice, and returns it. The standing API key never leaves the server.
2. Client creates an `RTCPeerConnection`, adds the mic track, opens a data channel for events, and exchanges SDP with OpenAI using the ephemeral secret.
3. Assistant audio arrives as a remote `MediaStreamTrack`. It is piped to both a hidden `<audio>` element for playback and an `AnalyserNode` for lip sync.
4. Transcript deltas, turn boundaries, and function calls arrive as JSON on the data channel and drive the state machine and UI.

## 4. The avatar

**Rendering:** three.js via React Three Fiber, drawing a glTF head with ARKit-compatible blendshapes. Ready Player Me exports these for free and gives us the standard 52-shape set, which means any lip-sync scheme that targets ARKit or Oculus visemes drops in without remapping.

Considered and rejected:

| Approach | Why not |
| --- | --- |
| 2D sprite swap (mouth cutouts) | Cheapest and charming, but caps expressiveness and looks dated next to competitors |
| Live2D | Great for anime styling, heavy licensing, awkward to drive from arbitrary audio |
| Server-rendered video (D-ID, HeyGen) | Photoreal, but adds 2–4 s of latency and per-minute cost that scales with conversation length |
| Gaussian splatting / NeRF head | Best fidelity trajectory, but tooling is immature and mobile GPU budget is tight |

The 3D blendshape route is the only one that hits real-time, runs on a phone, and stays under our per-minute cost target.

### Lip sync

We drive visemes from the output audio itself rather than from phoneme timings, because the Realtime API gives us audio, not phonemes, and waiting for a forced aligner would reintroduce the latency we just removed.

Each animation frame:

1. Pull an FFT frame from the `AnalyserNode` on the assistant's audio track.
2. Bucket the spectrum into formant-ish bands and classify into a small viseme set — `aa`, `E`, `I`, `O`, `U`, `PP`, `FF`, `TH`, `DD`, `kk`, `CH`, `SS`, `nn`, `RR`, `sil`. Roughly the Oculus OVR set, which maps cleanly onto ARKit shapes.
3. Smooth with an asymmetric filter: fast attack (~30 ms), slow release (~80 ms). Mouths open faster than they close, and matching that asymmetry is most of what makes lip sync read as real.
4. Write blendshape weights, additively composed with the current emotional expression so a smile survives while talking.

`wawa-lipsync` does steps 1–3 and is worth using rather than rebuilding. If its classification proves mushy, the fallback is amplitude-only: map RMS energy to `jawOpen` + `mouthFunnel`. Less accurate per-phoneme, but at conversational speed and normal viewing distance it's surprisingly hard to tell apart.

### Secondary motion

The parts nobody notices until they're missing:

- **Blinks** every 2–6 s, Poisson-distributed, 120 ms close-open, suppressed mid-blink.
- **Saccades** — small random gaze jumps every 1–3 s within a few degrees of the camera, larger and upward when Thinking.
- **Head motion** driven by audio envelope: pitch and yaw nudged on stressed syllables, plus a slow sinusoidal sway so the neck never locks.
- **Breathing** — subtle shoulder and chest scale on a ~4 s cycle.
- **Brow and eyelid** offsets from the emotional state, held as a target that the animation loop eases toward over ~300 ms.

Emotion comes from a function call the model can invoke (`set_expression(emotion, intensity)`), so tone is driven by the model's own read of the conversation rather than sentiment analysis bolted on afterward.

## 5. Tech stack

- **Frontend:** Next.js (App Router) + TypeScript, React Three Fiber + drei for the scene, Zustand for the conversation state machine, Tailwind for the little UI there is.
- **Backend:** Next.js route handlers on edge runtime. Only two endpoints matter: `POST /api/session` for ephemeral tokens and `POST /api/conversations` for persistence.
- **Realtime:** `@openai/agents-realtime`, which wraps the WebRTC setup, data-channel event plumbing, and interruption handling.
- **Lip sync:** `wawa-lipsync`.
- **Avatar asset:** Ready Player Me GLB, Draco-compressed, with unused blendshapes stripped.
- **Storage:** Postgres for conversation transcripts. No audio retention in v1.
- **Hosting:** Vercel.

## 6. Latency budget

Target is under 800 ms from end-of-user-speech to first assistant phoneme, since past roughly a second a conversation starts to feel like a walkie-talkie.

| Stage | Budget |
| --- | --- |
| Server VAD detects end of turn | 200–500 ms (tunable `silence_duration_ms`) |
| Model first audio token | 300–500 ms |
| Network + jitter buffer | 50–100 ms |
| Lip sync analysis | < 16 ms (one frame) |

The VAD silence window is the biggest lever and the most annoying tradeoff: shorter means snappier but cuts people off mid-thought. Start at 500 ms, expose it as a "how patient should I be" slider, and consider adapting it to the user's observed pause distribution.

To cover the gap, the head enters Thinking the instant the turn ends. Visible reaction hides real latency far better than a spinner does.

## 7. Fallback pipeline

Behind a feature flag, for cost control and future model portability:

Whisper (or Web Speech API) for STT → Chat Completions with streaming → TTS per sentence chunk. Split the token stream on sentence boundaries, fire TTS on each chunk, and queue the resulting audio so playback starts after the first sentence instead of the whole response. Lip sync is unchanged, since it reads whatever audio is playing.

This roughly triples time-to-first-audio and loses native barge-in, but cuts cost substantially and lets us swap in other model providers.

## 8. Security and privacy

- API key stays server-side. Clients get ephemeral secrets with a short TTL, one per session.
- Rate limit `/api/session` by IP and by authenticated user; a leaked endpoint that mints unlimited sessions is the main abuse vector.
- Mic access is explicit and revocable, with an unambiguous on-air indicator whenever the stream is live.
- Audio is not recorded or stored. Transcripts are stored only if the user opts in, and are deletable.
- System instructions live server-side so they aren't trivially extractable from the client bundle.

## 9. Milestones

1. **Talking box.** Realtime session wired up, audio in and out, no avatar. Proves the token flow and latency assumptions.
2. **Head that moves.** GLB loaded in R3F, amplitude-driven jaw. Ugly but synchronized.
3. **Real visemes.** Full viseme classification, attack/release smoothing, blink and saccade layer.
4. **State machine and interruption.** Four states with distinct posture, barge-in that truncates cleanly.
5. **Emotion.** `set_expression` function calling, additive expression blending.
6. **Polish.** Lighting and shading pass, mobile performance budget, transcript UI, persistence.

## 10. Risks

**Uncanny valley.** The most likely failure is a head that's realistic enough to be judged as a human and fails. Mitigation is to style deliberately away from photoreal — slightly stylized proportions and non-photographic shading buy enormous tolerance for animation error.

**Mobile GPU budget.** A 52-blendshape head at 60 fps on a mid-range Android is not guaranteed. Mitigation: LOD on the mesh, drop to 30 fps for the render loop while keeping the audio analysis at full rate, and strip unused morph targets at build time.

**Cost per minute.** Realtime audio pricing makes a long conversation meaningfully expensive. Needs per-user session caps and a visible usage indicator before any public launch.

**Barge-in correctness.** When the user interrupts, the model's server-side context still contains audio that was never heard. Truncating the assistant item at the actual playback position — not at generation position — is fiddly and is where this class of app usually breaks.

## 11. Open questions

- Photoreal or stylized? This decision drives asset pipeline, shading, and how much animation error we can absorb.
- Does the head need to be one fixed character, or is persona selection part of the product?
- Is text input a first-class mode or an accessibility fallback? It changes how much of the UI budget goes to the transcript.
- Should conversations persist across sessions, and if so does the head remember you by name?
