import './globals.css';
import type { ReactNode } from 'react';
import { AppNav } from './_components/AppNav';
import { TopBar } from './_components/TopBar';

export const metadata = {
  title: 'Social Control Plane',
  description: 'Social publishing console.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="appShell">
          <aside className="sidebar" aria-label="Sidebar">
            <div className="sidebarInner">
              <div className="brand">
                <div className="brandMark" aria-hidden>&#9678;</div>
                <div className="brandText">
                  <div className="brandName">Social Control Plane</div>
                </div>
              </div>

              <div className="navSection">
                <AppNav variant="sidebar" />
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
