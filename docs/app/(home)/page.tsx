import Link from 'next/link';
import { ArrowRight, Bot, Cable, ShieldCheck, TerminalSquare } from 'lucide-react';

const stats = [
  { label: 'CLI tools', value: '89' },
  { label: 'Read-only commands', value: '55' },
  { label: 'Write commands', value: '34' },
  { label: 'Canonical error codes', value: '10' },
];

const sections = [
  {
    href: '/docs/guide',
    icon: ShieldCheck,
    title: 'Guide',
    body: 'Execution model, config precedence, auth resolution, dry-run safety, and output contracts for agent operators.',
  },
  {
    href: '/docs/reference',
    icon: Cable,
    title: 'Reference',
    body: 'Command-family reference derived from the actual registry, catalog artifacts, and MCP server behavior.',
  },
  {
    href: '/docs/playbooks',
    icon: Bot,
    title: 'Playbooks',
    body: 'Decision-focused flows for quoting, deposit lifecycle work, vault operations, checkout recovery, and troubleshooting.',
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-14 px-6 py-12 md:px-10 md:py-20">
      <section className="grid gap-8 lg:grid-cols-[1.4fr_0.9fr] lg:items-end">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-fd-primary/20 bg-fd-primary/10 px-4 py-2 text-sm font-medium text-fd-primary">
            <TerminalSquare className="h-4 w-4" />
            Agent-first protocol docs for peer-cli
          </div>
          <div className="space-y-4">
            <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-balance md:text-6xl">
              The operational manual for agents using Peer CLI.
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-fd-muted-foreground">
              These docs are written for automation, not marketing. They explain what `peer-cli` exposes, how write safety works,
              what MCP returns, where config comes from, and which command family to use for each stage of protocol work.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-2xl bg-fd-primary px-5 py-3 font-medium text-fd-primary-foreground transition hover:opacity-90"
            >
              Open Docs
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/llms.txt"
              className="inline-flex items-center gap-2 rounded-2xl border border-fd-border bg-fd-card px-5 py-3 font-medium transition hover:border-fd-primary/30 hover:bg-fd-accent"
            >
              Read llms.txt
            </Link>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-3xl border border-fd-border bg-fd-card/90 p-5 shadow-sm backdrop-blur">
              <div className="text-sm uppercase tracking-[0.18em] text-fd-muted-foreground">{stat.label}</div>
              <div className="mt-3 text-3xl font-semibold tracking-tight">{stat.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              className="group rounded-3xl border border-fd-border bg-fd-card/95 p-6 transition hover:-translate-y-0.5 hover:border-fd-primary/30 hover:bg-fd-card"
            >
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-fd-primary/20 bg-fd-primary/10 text-fd-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-2xl font-semibold tracking-tight">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-fd-muted-foreground">{section.body}</p>
              <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-fd-primary">
                Open section
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
