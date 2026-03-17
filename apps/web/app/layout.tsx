import './globals.css';
import Link from 'next/link';
import type { ReactNode } from 'react';

const nav = [
  ['Overview', '/'],
  ['Queue', '/queue'],
  ['Review', '/review'],
  ['Connections', '/connections'],
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="layout">
          <aside className="sidebar">
            <div className="brand">Social Control Plane</div>
            <nav className="nav">
              {nav.map(([label, href]) => (
                <Link key={href} href={href}>{label}</Link>
              ))}
            </nav>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
