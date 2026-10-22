'use client';

import { createContext, useContext } from 'react';
import type { Me } from '@prime-crm/shared';

const SessionContext = createContext<Me | null>(null);

/**
 * The signed-in user, read on the server by the root layout and handed down as the initial state,
 * so the first paint already shows their name, menu and role-gated controls.
 */
export function SessionProvider({
  me,
  children,
}: {
  me: Me | null;
  children: React.ReactNode;
}) {
  return (
    <SessionContext.Provider value={me}>{children}</SessionContext.Provider>
  );
}

/** The signed-in user, or `null` on public pages (login). */
export function useSession(): Me | null {
  return useContext(SessionContext);
}

/** Whether the signed-in user holds a permission. Drawing only: the API enforces it. */
export function useCan(permission: string): boolean {
  return useSession()?.permissions.includes(permission) ?? false;
}
