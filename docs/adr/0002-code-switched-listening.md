# ADR 0002: Listening to meetings that mix languages

Status: accepted (2026-11-25). Training side built. App side partly built (see "Not built yet").

## Context
Nigerian meetings rarely stay in one language. In the North people move between Hausa and English
inside one sentence ("To, abu na gaba on the agenda shine budget"). In the South they do the same
with Pidgin and English. Listen has to write all of it.

None of today's listening models can:
- **Kroko (Live today)** only has English word pieces. A Hausa word comes out as English words that
  sound alike, or is dropped.
- **Omnilingual 300M (Engine lab)** writes any language, but only after each whole sentence. It is
  weak on Nigerian English and never learned to follow a switch. The YECS study (NeurIPS 2026)
  reports that Whisper, MMS and Omnilingual all fail on natural code-switching without training on it.
- **listen-ng (planned)** puts five languages in one small model, but trains it only on clips in a
  single language. A model that never hears a switch inside a clip learns that a clip stays in one
  language.

No transcribed Hausa–English code-switched corpus exists. For Pidgin–English there are about 10 gated
hours (see `Voxa on device model selection/nigeria_languages.md`).

## Decision
1. **One model per region, with one vocabulary and no language detection.** North covers English,
   Pidgin and Hausa (`06_finetune.sh north`). South covers English and Pidgin (`06_finetune.sh south`).
   Yoruba and Igbo regions can follow later with the same recipe. We rejected detecting the language
   and switching between two models. Inside a sentence the language changes every few words, faster
   than a language detector can decide, and two models would not fit on a 2 GB phone. A transducer
   whose vocabulary covers both languages simply writes whichever word it hears. A small model also
   holds two or three languages better than five.
2. **Train on switching, from three sources:**
   - **Joined clips** (`02b_codeswitch.py`): a Hausa clip and an English clip are cut into one, with
     a natural pause between them, and some are local, then English, then local again. Both pieces
     come from one voice whenever that speaker has both languages, and their levels are matched, so
     the model does not learn that a new voice or level means a new language. These clips are
     unlimited, but they only teach switches between sentences.
   - **Mixed Donate sentences** (`cs-ha` and `cs-pcm` prompt sets, 40 lines each). Volunteers read
     them alternately with English ones, so one voice gives both kinds. They are real speech with
     switches inside the sentence.
   - **Real meetings, transcribed by people**: the only source of natural switching, and the test
     set. Use `"language": "cs-ha"` or `"cs-pcm"` in the jsonl. Follow the transcription rules in
     `training/asr/README.md`.
3. **Measure on real mixed speech, per language.** `08_score.py` scores the cs-* sets overall, and
   separately for the English words and the local-language words inside mixed sentences. A model
   that drops every Hausa word inside an English sentence can still look fine overall. Joined clips
   are never used as test data. A voice held out in one language is now held out in all of them
   (`02_prepare.py`).
4. **Two passes.** Live captions come from the normal pack (chunk 16, about 0.32 s delay). After the
   meeting, the saved recording is read again with a second export of the same checkpoint that has
   more look-ahead (`CHUNK=64 LEFT=256 07_export.sh`, saved as `listen-ng-<region>-full`). Speaker
   turns serve as sentence breaks, and the result replaces the live text. This pass runs like speaker
   labels, which already work on the recording afterwards. It needs no extra training, because
   training already mixes chunk sizes up to full context.
5. **The user names the meeting's languages.** There is no automatic detection. The choices are
   English, English and Hausa, or English and Pidgin, and the choice picks the pack.

## Order of work
1. **Build the test set first.** Get about 2 hours of real mixed meeting speech per region from 20 or
   more speakers, transcribe it by hand, and lock it with `01_lock_test_speakers.py` before any
   training. Without it, no improvement can be checked.
2. Score Kroko and Omnilingual 300M on it to get the baseline.
3. Run `REGION=north` and `REGION=south` with `train_cloud.sh`. Score the results, then compare them
   on a 2 GB phone in the Engine lab.
4. Set the ship gates from the baseline. The region model must beat Kroko on English words and on
   local words inside mixed sentences.
5. Keep adding real mixed speech. Aim for 30 to 50 hours per region over time, from Donate and from
   transcribed meetings.

## Not built yet
- **Region packs in the app.** Add `listen-ng-north` and `listen-ng-south` (plus `-full`) to
  `src/features/packs/catalogue.ts`. `listenPack()` and `currentListenModel()` in `VoxaEngineModule.kt`
  should pick a pack from a meeting-language setting. `ListenTuning.model` already has a slot for it.
- **After-meeting pass.** A native `retranscribe(audioPath, packId)` alongside `labelSpeakers`, which
  replays the recording through `GatedRecognizer` the same way `runTune` does. The JS side lines the
  result up with the speaker turns and replaces the session's segments.
- **Meeting donation from the editor.** After someone corrects a transcript, and only with their
  consent, export the audio pieces with the corrected text in the training jsonl format. Over time
  this becomes the largest source of natural switching.
- **A better teacher for meetings.** `03_teacher_label.py` uses Omnilingual 300M, which handles
  switching poorly. For cs-* audio, use its output as a draft for a person to correct, not as a label.
- **Region custom words.** Starter custom-word lists of common meeting terms for each region.

## Consequences
- There are two region packs to train, host and test instead of one. Each is more accurate for its users.
- Joined clips take about 115 MB per hour at 16 kHz (50 hours is about 6 GB) on the training machine only.
- Consent wording changed (version 2), so existing Donate volunteers are asked again.
- Licences: NaijaVoices and AfriSpeech-200 are non-commercial unless a deal is made. A commercial
  release needs those deals, or must train on WAXAL, Common Voice, FLEURS and Voxa's own data.
- The 80 mixed Donate lines were written without a native-speaker check. Hausa and Pidgin speakers
  must review them before release, because a volunteer who reads a line differently from how it is
  written makes its transcript wrong.
