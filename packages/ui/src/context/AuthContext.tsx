import { createContext, useContext } from 'react';
import { CurrentUser } from '../api/client';

interface AuthContextValue {
  user: CurrentUser | null;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue>({ user: null, logout: () => {} });

// Convenience for pages that only need to know "am I an admin" — used to
// hide destructive actions (create/delete/acknowledge) from viewer-role
// users, e.g. Alerts.tsx, Insights.tsx.
export function useIsAdmin(): boolean {
  const { user } = useContext(AuthContext);
  return user?.role === 'admin';
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
