import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchSettings } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { DEFAULT_TAX_CONFIG, type TaxConfiguration } from '@/lib/tax';
import type { CompanySettings } from '@/types/db';
import { useAuth } from '../auth/AuthProvider';

interface SettingsState {
  settings: CompanySettings | null;
  taxConfig: TaxConfiguration;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setSettings: (s: CompanySettings) => void;
}

const Ctx = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { isAuthorized } = useAuth();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await fetchSettings());
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthorized) void reload();
    else { setSettings(null); setLoading(false); }
  }, [isAuthorized, reload]);

  const taxConfig = (settings?.tax_configuration as TaxConfiguration | undefined) ?? DEFAULT_TAX_CONFIG;
  return <Ctx.Provider value={{ settings, taxConfig, loading, error, reload, setSettings }}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
