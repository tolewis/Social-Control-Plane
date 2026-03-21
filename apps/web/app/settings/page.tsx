'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { IconPlug, IconUsers, IconBook, IconKey } from '../_components/icons';
import { IntegrationsTab } from './IntegrationsTab';
import { UsersTab } from './UsersTab';
import { ApiKeysTab } from './ApiKeysTab';
import { HelpTab } from './HelpTab';

type Tab = 'integrations' | 'users' | 'api-keys' | 'help';

const VALID_TABS: Tab[] = ['integrations', 'users', 'api-keys', 'help'];

const tabs: { id: Tab; label: string; icon: typeof IconPlug }[] = [
  { id: 'integrations', label: 'Integrations', icon: IconPlug },
  { id: 'users', label: 'Users', icon: IconUsers },
  { id: 'api-keys', label: 'API Keys', icon: IconKey },
  { id: 'help', label: 'Help', icon: IconBook },
];

function SettingsInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as Tab | null;
  const providerParam = searchParams.get('provider');

  const [active, setActive] = useState<Tab>(
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'integrations'
  );

  useEffect(() => {
    if (tabParam && VALID_TABS.includes(tabParam) && tabParam !== active) {
      setActive(tabParam);
    }
  }, [tabParam]);

  return (
    <section>
      <h1 className="pageTitle">Settings</h1>
      <p className="lead">Manage integrations, users, API keys, and view documentation.</p>

      <div className="settingsTabs" style={{ marginTop: 20 }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              className={`settingsTab${active === tab.id ? ' active' : ''}`}
              onClick={() => setActive(tab.id)}
            >
              <Icon width={16} height={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 20 }}>
        {active === 'integrations' && <IntegrationsTab highlightProvider={providerParam} />}
        {active === 'users' && <UsersTab />}
        {active === 'api-keys' && <ApiKeysTab />}
        {active === 'help' && <HelpTab />}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="subtle">Loading...</p>}>
      <SettingsInner />
    </Suspense>
  );
}
