import './globals.css';
import type { ReactNode } from 'react';
import { AppNav } from './_components/AppNav';
import { TopBar } from './_components/TopBar';
import { StatusPill } from './_components/ui';

export const metadata = {
  title: 'Social Control Plane',
  description: 'Draft review, queue inspection, and connection health for social publishing agents.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="appShell">
          <aside className="sidebar" aria-label="Sidebar">
            <div className="sidebarInner">
              <div className="brand">
                <div className="brandMark" aria-hidden>◎</div>
                <div className="brandText">
                  <div className="brandName">Social Control Plane</div>
                  <div className="brandSub">Operator console</div>
                </div>
              </div>

              <div className="workspace">
                <div className="workspaceLabel">Workspace</div>
                <div className="workspaceRow">
                  <div className="avatar" aria-hidden>TL</div>
                  <div className="workspaceMeta">
                    <div className="workspaceName">Tim</div>
                    <div className="workspaceSub">default account</div>
                  </div>
                  <StatusPill tone="ok">ready</StatusPill>
                </div>
              </div>

              <div className="navSection">
                <div className="navSectionLabel">Console</div>
                <AppNav variant="sidebar" />
              </div>

              <div className="sidebarFooter">
                <div className="footerRow">
                  <div className="footerLabel">Connections</div>
                  <div className="footerValue">
                    <StatusPill tone="ok">3 healthy</StatusPill>
                    <StatusPill tone="warn">1 attention</StatusPill>
                  </div>
                </div>
                <div className="footerRow">
                  <div className="footerLabel">Last receipt</div>
                  <div className="footerValue subtle">2m ago · ok</div>
                </div>
              </div>
            </div>
          </aside>

          <div className="mainCol">
            <TopBar />
            <main className="page" aria-label="Content">
              {children}
            </main>
            <AppNav variant="mobile" />
          </div>
        </div>
      </body>
    </html>
  );
}
