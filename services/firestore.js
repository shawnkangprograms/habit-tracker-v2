import {mark} from '@/utils/startupTrace';

// The ONLY place that loads the Firestore SDK (the ESLint rule in eslint.config.js enforces it). It is required
// on first use, not at startup: evaluating it (about 1.2 MB of source with re2js) cost every launch time before
// Home was usable, and nothing on that path needs Firestore. Call firestore() inside functions, never at the top
// level of a module, or the startup cost comes back.

let sdk = null;

/** @returns {typeof import('firebase/firestore')} */
export function firestore() {
    if (!sdk) {
        mark('firestore:requireStart');
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy on purpose (see above)
        sdk = require('firebase/firestore');
        mark('firestore:requireEnd');
    }
    return sdk;
}
