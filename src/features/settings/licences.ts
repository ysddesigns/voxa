import data from './licence-texts.json';

/**
 * Everything Voxa ships that someone else made, for the Open-source licences screen. App libraries
 * come from licence-texts.json (node scripts/make-licences.mjs); models and native libraries are
 * listed here by hand. Add a line whenever a model, pack or native library is added.
 */
export type LicenceId = keyof typeof data.texts;

export type Credit = {
  name: string;
  /** What it does in Voxa, in plain words. */
  what?: string;
  licence: string;
  copyright: string[];
  /** Full licence text shipped in the app, when there is one to show. */
  text?: LicenceId;
  url?: string;
  /** Licence not yet confirmed by legal review; must be cleared before launch. */
  review?: boolean;
};

export const MODELS: Credit[] = [
  {
    name: 'sherpa-onnx',
    what: 'Runs every speech and voice model on the phone',
    licence: 'Apache-2.0',
    copyright: ['The k2-fsa sherpa-onnx authors'],
    text: 'Apache-2.0',
    url: 'https://github.com/k2-fsa/sherpa-onnx',
  },
  {
    name: 'ONNX Runtime',
    what: 'The engine inside sherpa-onnx',
    licence: 'MIT',
    copyright: ['Copyright (c) Microsoft Corporation'],
    text: 'MIT',
    url: 'https://github.com/microsoft/onnxruntime',
  },
  {
    name: 'Piper voice, LJSpeech medium',
    what: 'The speaking voice, trained on LJ Speech recordings (public domain)',
    licence: 'MIT',
    copyright: ['Michael Hansen and the Rhasspy Piper authors'],
    text: 'MIT',
    url: 'https://huggingface.co/rhasspy/piper-voices',
    review: true,
  },
  {
    name: 'CMU Pronouncing Dictionary',
    what: 'How English words are pronounced',
    licence: 'BSD-style (CMUdict)',
    copyright: ['Copyright (C) 1993-2015 Carnegie Mellon University'],
    text: 'CMUdict',
    url: 'https://github.com/cmusphinx/cmudict',
  },
  {
    name: 'Punctuation and casing model (sherpa-onnx online punct, English)',
    what: 'Adds full stops, commas and capitals to captions',
    licence: 'Being confirmed',
    copyright: ['The k2-fsa sherpa-onnx authors'],
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/tag/punctuation-models',
    review: true,
  },
  {
    name: 'Kroko ASR (English)',
    what: 'Live captions (downloaded)',
    licence: 'CC BY-SA 4.0',
    copyright: ['Banafo'],
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    review: true,
  },
  {
    name: 'Silero VAD',
    what: 'Tells speech from silence',
    licence: 'MIT',
    copyright: ['Copyright (c) 2020-present Silero Team'],
    text: 'MIT',
    url: 'https://github.com/snakers4/silero-vad',
  },
  {
    name: 'pyannote segmentation 3.0',
    what: 'Speaker labels: finds where each voice speaks (downloaded)',
    licence: 'MIT',
    copyright: ['Hervé Bredin and the pyannote authors'],
    text: 'MIT',
    url: 'https://huggingface.co/pyannote/segmentation-3.0',
  },
  {
    name: '3D-Speaker CAM++',
    what: 'Speaker labels: tells voices apart (downloaded)',
    licence: 'Apache-2.0',
    copyright: ['The 3D-Speaker authors, Alibaba DAMO Academy'],
    text: 'Apache-2.0',
    url: 'https://github.com/modelscope/3D-Speaker',
  },
  {
    name: 'Google ML Kit Text Recognition',
    what: 'Scan text, offline',
    licence: 'ML Kit Terms of Service',
    copyright: ['Google LLC'],
    url: 'https://developers.google.com/ml-kit/terms',
  },
];

export const LIBRARIES: Credit[] = data.packages.map((p) => ({
  name: `${p.name} ${p.version}`,
  licence: p.licence,
  copyright: p.copyright,
  text: p.licence in data.texts ? (p.licence as LicenceId) : undefined,
}));

export const licenceText = (id: LicenceId) => data.texts[id];

/** Credits whose licence legal still has to confirm. */
export const needsReview = () => [...MODELS, ...LIBRARIES].filter((c) => c.review).map((c) => c.name);
