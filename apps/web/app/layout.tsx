import './globals.css';
import type { ReactNode } from 'react';
import { AppNav } from './_components/AppNav';
import { TopBar } from './_components/TopBar';

export const metadata = {
  title: 'Social Plane',
  description: 'Social publishing console.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sp-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <div className="appShell">
          <aside className="sidebar" aria-label="Sidebar">
            <div className="sidebarInner">
              <div className="brand">
                <div className="brandMark" aria-hidden>&#9678;</div>
                <div className="brandText">
                  {/* Split wordmark: "Social" in body text, "Plane" in the
                      brand accent (amber). Matches the type treatment used
                      by Epic Inventory ("Epic" accent) and Contractor-AI
                      ("-AI" accent). */}
                  <div className="brandName">
                    Social <span className="brandAccent">Plane</span>
                  </div>
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
            {/* Mobile nav is now a hamburger dropdown in TopBar */}
          </div>
        </div>
      </body>
    </html>
  );
}
