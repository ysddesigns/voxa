# ADR 0003: One design language, "the house", taken from the Library's Rack

Status: accepted (2026-11-26)

## Context
Library v2 ("The Rack") drew a room in code: a plaster wall, a white bookcase with an oak top,
posters made from each session's data, one light source (window by day, lamp at night). The
rest of the app used Apple's cool system greys and plain lists, so moving between tabs felt like
moving between two apps. Voxa's users are mostly on 2 GB Android phones with patchy networks,
and many read and speak Yoruba, Igbo, Hausa or Pidgin, so any richer look has to stay cheap,
offline and legible.

## Decision
Every screen lives in the same house as the Rack. The principles, not the bookcase, carry over:

- **One light.** `useScene()` (src/design/scene.ts) gives the room palette and the light's side.
  Every shadow, gloss and lit face is worked out from it. Dark mode is the same room by lamplight.
- **One palette.** The app palette is taken from the room's (src/design/tokens.ts): the page is the
  wall, cards are paper, text is ink, one orange accent. `house.test.ts` locks this; contrast
  tests keep every text pair at AA and every control edge at 3:1.
- **Data becomes art.** A session's poster (sky = time of day, hills = speakers, height = length,
  flags = marks) is its identity everywhere: the shelf, Home's Recent rows, the session header.
  Scripts get printed pages; voices get sleeves whose waves roll with their tone. Art is seeded
  from ids, so the same thing always looks the same.
- **Each tab is a room or an object in it.** Library: the bookcase. Live: a studio with an ON AIR
  sign. Voices: a shop window ledge of sleeves. Phrases: a cork pinboard. Editor: a writing pad.
  Scan: a page under the lamp. Settings and other utility screens stay plain lists in the palette.
- **Shared pieces only.** Scenes are built from src/components/scene (light, shadows, gloss, paper
  tag, note and sheet, ledge, pinboard, ON AIR sign, round button) and src/components/rack (posters).
- **Type.** Noto Serif Display (covers Yoruba, Igbo and Hausa marks) for screen and poster titles
  only; Inter for everything people read at length.

Guardrails:

- Working text (transcripts, scripts, scanned text, phrases) sits on plain paper. Nothing is drawn
  over words.
- `useSceneQuality()` decides how much to draw: Lite phones get one shadow layer, no gloss or grain,
  and no motion; Reduce Motion stops all movement. Shadows are offset layers, never blur.
- Drawing is static and memoised; nothing redraws with live data such as the mic level.
- Decoration is hidden from screen readers; the state it shows is always also said in words.

## Consequences
The app reads as one place, and a meeting is recognisable at a glance anywhere it appears. New
screens start from the scene pieces and the palette, not from raw colours. The cost is more drawing
code to keep cheap: every new scene must check its Lite and Reduce Motion paths, and colour changes
go through the contrast and house tests. Native iOS tab bars and system sheets keep their own look.
