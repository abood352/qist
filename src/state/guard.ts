import { navigate } from '@pf/core/react/router';
import { useEffect } from 'react';
import { useUser } from './session';

/** A `?next=` target is only followed when it is an in-app path (starts with one slash, not `//`). */
export const safeNext = (next: string | null | undefined) => (next && next.startsWith('/') && !next.startsWith('//') ? next : null);

/** Signed-out visitors are sent to the login screen and returned to `next` afterwards. */
export function useRequireUser(next: string) {
  const user = useUser();
  useEffect(() => {
    if (!user) navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
  }, [user, next]);
  return user;
}
