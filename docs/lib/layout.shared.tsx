import Link from 'next/link';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { BookOpenText, Bot, Cable, TerminalSquare } from 'lucide-react';
import { appName, docsRoute, gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <Link href={docsRoute} className="inline-flex items-center gap-2 font-semibold tracking-tight text-fd-foreground">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-fd-primary/20 bg-fd-primary/10 text-fd-primary">
            <TerminalSquare className="h-4 w-4" />
          </span>
          <span>{appName}</span>
        </Link>
      ),
    },
    links: [
      {
        type: 'icon',
        text: 'Guide',
        url: '/docs/guide',
        icon: <BookOpenText className="h-4 w-4" />,
      },
      {
        type: 'icon',
        text: 'Reference',
        url: '/docs/reference',
        icon: <Cable className="h-4 w-4" />,
      },
      {
        type: 'icon',
        text: 'Playbooks',
        url: '/docs/playbooks',
        icon: <Bot className="h-4 w-4" />,
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
