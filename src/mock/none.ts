/** Stand-in for the mock backend when VITE_USE_MOCK=false (see vite.config.ts → @backend). */
import type { MockServer } from '@pf/core/mock';
export const createQistServer: null | (() => Promise<MockServer>) = null;
export const resetQistDb = () => {};
