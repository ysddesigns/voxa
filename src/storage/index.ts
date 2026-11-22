import { PhraseStore } from '@/features/phrases/phrases';
import { SayAsStore } from '@/features/speak/say-as';
import { deviceFiles } from './device-files';
import { PrefsStore } from './prefs';
import { SessionStore } from './sessions';

/** Everything lives in the app's private documents folder, under "voxa/". */
export const sessionStore = new SessionStore(deviceFiles, 'voxa');
export const phraseStore = new PhraseStore(deviceFiles);
export const prefsStore = new PrefsStore(deviceFiles);
export const sayAsStore = new SayAsStore(deviceFiles);
