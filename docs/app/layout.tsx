import './global.css';
import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import type { Metadata } from 'next';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { appName } from '@/lib/shared';

const heading = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-heading',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  metadataBase: new URL('http://127.0.0.1:3007'),
  title: {
    default: `${appName} docs`,
    template: `%s | ${appName} docs`,
  },
  description: 'Agent-focused documentation for peer-cli, the Peer protocol CLI and MCP server.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${heading.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_color-mix(in_oklab,_var(--color-fd-primary)_10%,_transparent)_0%,_transparent_45%),linear-gradient(to_bottom,_color-mix(in_oklab,_var(--color-fd-card)_65%,_white)_0%,_transparent_28%),var(--color-fd-background)] text-fd-foreground antialiased">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
