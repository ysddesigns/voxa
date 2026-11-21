import { PhraseStore } from '@/features/phrases/phrases';
import { deviceFiles } from './device-files';
import { PrefsStore } from './prefs';
import { SessionStore } from './sessions';

/** Everything lives in the app's private documents folder, under "voxa/". */
export const sessionStore = new SessionStore(deviceFiles, 'voxa');
export const phraseStore = new PhraseStore(deviceFiles);
export const prefsStore = new PrefsStore(deviceFiles);
