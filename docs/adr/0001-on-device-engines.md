# ADR 0001: On-device engines behind TypeScript interfaces

Status: accepted (2026-11-20)

## Context
Voxa must work offline on 2 GB Android 8 phones and on iPhones, with the same UI on both.
The speech, voice, scan and summary engines are native (sherpa-onnx, ML Kit / Apple Vision, llama.rn)
and will take several sprints to land.

## Decision
- Screens talk only to the interfaces in `src/engines/types.ts`, provided by `EngineProvider`.
- TypeScript mocks in `src/engines/mock` stand in until `modules/voxa-engine` (an Expo native module) ships.
- The device tier (`src/device/tier.ts`) decides which models load: Lite under 3.5 GB RAM, Standard under 6.5 GB,
  Pro above. A slow first-run benchmark moves a phone down one tier, never up.
- Quick summary is pure TypeScript and runs on every tier; Smart summary is optional on the interface.

## Consequences
UI work and tests run without native builds. The native module must match the interfaces exactly,
and contract tests will run each implementation against the same fixtures.
