# Accessibility checklist (Android)

The PRD bar: every control has a screen-reader label, a 44 pt touch target and AA contrast, the layout holds at 200% text size, and TalkBack passes on every P0 screen.

Contrast, labels and touch-target sizes are checked by tests (`src/design/__tests__`). This list covers what only a person on a phone can check.

## Set up the phone

1. **Settings › Accessibility › TalkBack:** turn on. Swipe right/left moves between items; double-tap activates.
2. **Settings › Display › Font size:** largest. **Display size:** largest. (Android 14+ goes to 200%.)
3. Test each screen twice: once in light mode with TalkBack, once in dark mode with the largest text.

## Every screen

- [ ] Swiping through reaches every control, in reading order (top to bottom, left to right).
- [ ] Each control says what it is and what it does ("Start listening, button"). No "button" with no name, no "unlabelled".
- [ ] The screen title is read as a heading (swipe up/down to jump by headings).
- [ ] Decorative things are skipped: waveforms, level bars, icons next to text, bullet dots.
- [ ] At the largest text, nothing is cut off or overlaps, and the bottom tab bar doesn't cover anything.

## Screen by screen

**Welcome (first run):** reset with *Settings › Delete everything saved*, or clear app data.
- [ ] Each step's title is read first. Play / Stop and Next / Skip are labelled.
- [ ] The Listening download reads its progress ("Downloading Listening, 40 percent") and says "Listening downloaded" when done.

**Home**
- [ ] Tiles and recent sessions read as one item each, not word by word.
- [ ] The settings button (avatar) says "Settings".

**Live**
- [ ] Start listening → TalkBack says "Listening".
- [ ] Pause → "Paused. The microphone is off." Resume → "Listening".
- [ ] Mark → "Mark 1 added".
- [ ] The clock reads as "Listened for" and the time when focused.
- [ ] Stop → "Saving", then "Meeting saved", and the session opens.
- [ ] With *Settings › Read captions with the screen reader* on, each new sentence is read out. With it off (default), sentences are not read.
- [ ] Mark / Pause / Stop are still reachable at the largest text.

**Session**
- [ ] Back, Share and Delete are labelled. The title field says "Session title, edit box".
- [ ] "Quick summary", "Marks" and "Transcript" are headings.
- [ ] While labelling speakers: the bar reads "Finding who spoke, 30 percent".

**Speak for me (editor) and Quick phrases**
- [ ] The speed button says the speed ("Speed 1×. Change speed").
- [ ] Each phrase can be said, edited, moved and deleted with TalkBack alone.
- [ ] Discreet mode switch says its state.

**Scan**
- [ ] Take photo / Choose photo are labelled.
- [ ] After reading: "Text found. 3 words to check." Or "No text found".
- [ ] The text box can be edited with TalkBack.

**Voices, Player, Library, Settings**
- [ ] Filters say which one is selected.
- [ ] Player: Back 15 / Forward 15 / Play / Speed are labelled.
- [ ] Settings switches say on/off; theme choice says which is selected.

## Report back

For each failure: the screen, what TalkBack said (or what was cut off), and a screenshot if it's a layout problem.
