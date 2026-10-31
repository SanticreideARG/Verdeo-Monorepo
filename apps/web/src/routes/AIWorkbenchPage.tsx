import { useState } from 'react';

import { AIPromptsAdmin } from '../components/AIPromptsAdmin.js';
import { BuhoAssistant } from '../components/BuhoAssistant.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

/**
 * El Workbench de IA (BUHO_WORKBENCH_PLAN.md, 2026-10-30): la mesa de trabajo con el búho al
 * centro, para todos los que tienen permiso de IA, y los prompts maestros de cada modo, para quien
 * los administra.
 */
export function AIWorkbenchPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [tab, setTab] = useState<'buho' | 'prompts'>('buho');

  if (failed) return <DashboardFailed label="el workbench de IA" />;
  if (!profile) return <DashboardLoading />;

  const canUse = profile.permissions.includes('ai.use');
  const canManage = profile.permissions.includes('ai.prompts.manage');
  const showing = canUse ? tab : 'prompts';

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="buho-header">
          <div>
            <p className="dashboard-kicker">Inteligencia</p>
            <h1 className="text-2xl font-semibold text-forest">Workbench de IA</h1>
          </div>
          {canUse && canManage ? (
            <div aria-label="Sección" className="buho-tabs" role="tablist">
              <button
                aria-selected={showing === 'buho'}
                onClick={() => setTab('buho')}
                role="tab"
                type="button"
              >
                El búho
              </button>
              <button
                aria-selected={showing === 'prompts'}
                onClick={() => setTab('prompts')}
                role="tab"
                type="button"
              >
                Prompts maestros
              </button>
            </div>
          ) : null}
        </header>

        {!canUse && !canManage ? (
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para usar la IA.</p>
        ) : showing === 'buho' ? (
          <BuhoAssistant permissions={profile.permissions} />
        ) : (
          <div className="mt-6">
            <AIPromptsAdmin />
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
