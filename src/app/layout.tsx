import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../index.css';

export const metadata: Metadata = {
  title: 'ShadowPersona AI',
  description: 'Evaluate music launches with Qloo-grounded cultural intelligence.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
