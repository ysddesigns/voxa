import { deviceFiles } from './device-files';
import { SessionStore } from './sessions';

/** Saved sessions in the app's private documents folder ("voxa/sessions"). */
export const sessionStore = new SessionStore(deviceFiles, 'voxa');
