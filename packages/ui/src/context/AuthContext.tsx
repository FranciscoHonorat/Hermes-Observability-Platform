import { createContext, useContext } from 'react';
import { CurrentUser } from '../api/client';

interface AuthContextValue {
  user: CurrentUser | null;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue>({ user: null, logout: () => {} });

export function useIsAdmin(): boolean {
  const { user } = useContext(AuthContext);
  return user?.role === 'admin';
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
