import { configureTokenKey } from '@pf/core/auth';

/** Imported first by main.tsx so the token key is set before any module reads the session. */
configureTokenKey('qist-token');
