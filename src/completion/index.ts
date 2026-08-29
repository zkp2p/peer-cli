import type { CommandDefinition } from '../commands/framework.js';
import { GLOBAL_OPTIONS, globalOptionFlag } from '../commands/global-options.js';

export const COMPLETION_SHELLS = ['bash', 'zsh', 'fish'] as const;
export type CompletionShell = (typeof COMPLETION_SHELLS)[number];

/**
 * Options every leaf command gains from the framework
 * (`applyDefinition` in `src/commands/framework.ts`).
 */
const IMPLICIT_LEAF_OPTIONS = ['--params', '--params-file'];

/** Long flag token from a Commander flags string, e.g. `--amount` from `--amount <value>`. */
function longFlag(flags: string): string | undefined {
  const match = flags.match(/--[a-z0-9-]+/i);
  return match ? match[0] : undefined;
}

/** Descriptions may land in zsh `_describe` / fish `-d`; keep them single-line and colon-free. */
function sanitizeDescription(description: string): string {
  return description.replace(/\s+/g, ' ').replace(/:/g, ' -').trim();
}

export interface CompletionNode {
  /** Path segments from the root command, e.g. `['deposit', 'create']`; empty for the root. */
  path: string[];
  /** Human description; empty when the node is only a synthesised parent group. */
  description: string;
  /** Immediate sub-command names, sorted. */
  children: string[];
  /** Long option flags offered on this node, sorted, always including `--help`. */
  options: string[];
}

function nodeKey(path: string[]): string {
  return path.join(' ');
}

function leafOptions(definition: CommandDefinition): string[] {
  const fromOptions = (definition.options ?? []).map((option) => longFlag(option.flags));
  const fromArgAliases = (definition.args ?? []).flatMap((arg) => arg.optionFlags ?? []).map(longFlag);
  const explicit = [...fromOptions, ...fromArgAliases].filter((flag): flag is string => Boolean(flag));
  return [...explicit, ...IMPLICIT_LEAF_OPTIONS];
}

/**
 * Fold the command registry into a completion tree. Parent groups that have no
 * definition of their own are synthesised from child paths so every reachable
 * command word is offered.
 */
export function buildCompletionModel(
  definitions: CommandDefinition[],
  globalOptions = GLOBAL_OPTIONS,
): CompletionNode[] {
  const nodes = new Map<string, CompletionNode>();

  const ensureNode = (path: string[]): CompletionNode => {
    const key = nodeKey(path);
    let node = nodes.get(key);
    if (!node) {
      node = { path, description: '', children: [], options: [] };
      nodes.set(key, node);
    }
    return node;
  };

  const rootOptions = new Set<string>(['--help', '--version']);
  for (const option of globalOptions) {
    rootOptions.add(globalOptionFlag(option));
  }
  ensureNode([]).options = [...rootOptions];

  const childSets = new Map<string, Set<string>>();
  const addChild = (parentPath: string[], child: string): void => {
    const key = nodeKey(parentPath);
    const set = childSets.get(key) ?? new Set<string>();
    set.add(child);
    childSets.set(key, set);
  };

  for (const definition of definitions) {
    if (definition.path.length === 0) {
      continue;
    }

    for (let depth = 1; depth <= definition.path.length; depth += 1) {
      ensureNode(definition.path.slice(0, depth));
      addChild(definition.path.slice(0, depth - 1), definition.path[depth - 1]!);
    }

    const leaf = ensureNode(definition.path);
    leaf.description = sanitizeDescription(definition.description);
    leaf.options = [...new Set([...leafOptions(definition), '--help'])];
  }

  for (const [key, children] of childSets) {
    const node = nodes.get(key)!;
    node.children = [...children].sort();
    if (node.options.length === 0) {
      node.options = ['--help'];
    }
  }

  return [...nodes.values()]
    .sort((left, right) => nodeKey(left.path).localeCompare(nodeKey(right.path)))
    .map((node) => ({ ...node, options: [...node.options].sort() }));
}

/** Every completion word (children + options) a node offers, de-duplicated and sorted. */
function nodeWords(node: CompletionNode): string[] {
  return [...new Set([...node.children, ...node.options])].sort();
}

/** Map of `node key` -> description for the nodes that carry one. */
function describeMap(model: CompletionNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of model) {
    if (node.description) {
      map.set(nodeKey(node.path), node.description);
    }
  }
  return map;
}

function childKey(node: CompletionNode, child: string): string {
  return node.path.length === 0 ? child : `${nodeKey(node.path)} ${child}`;
}

function renderBash(model: CompletionNode[]): string {
  const cases = model
    .map((node) => {
      const pattern = node.path.length === 0 ? '""' : JSON.stringify(nodeKey(node.path));
      return `    ${pattern}) opts=${JSON.stringify(nodeWords(node).join(' '))} ;;`;
    })
    .join('\n');

  return `# bash completion for peer
# Load with: source <(peer completion bash)
_peer() {
  local cur path opts i
  cur="\${COMP_WORDS[COMP_CWORD]}"
  path=""
  for (( i = 1; i < COMP_CWORD; i++ )); do
    case "\${COMP_WORDS[i]}" in
      -*) ;;
      *) path="\${path}\${path:+ }\${COMP_WORDS[i]}" ;;
    esac
  done
  case "\${path}" in
${cases}
    *) opts="" ;;
  esac
  COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
  return 0
}
complete -F _peer peer
`;
}

function renderZsh(model: CompletionNode[]): string {
  const descriptions = describeMap(model);
  const cases = model
    .map((node) => {
      const entries = nodeWords(node).map((word) => {
        const description = descriptions.get(childKey(node, word));
        return description ? `'${word}:${description}'` : `'${word}'`;
      });
      const pattern = node.path.length === 0 ? '""' : JSON.stringify(nodeKey(node.path));
      return `    ${pattern}) entries=(${entries.join(' ')}) ;;`;
    })
    .join('\n');

  return `#compdef peer
# zsh completion for peer
# Load with: source <(peer completion zsh)
_peer() {
  local path w
  local -a entries
  integer i
  path=""
  for (( i = 2; i < CURRENT; i++ )); do
    w=\${words[i]}
    [[ \${w} == -* ]] && continue
    path="\${path}\${path:+ }\${w}"
  done
  case "\${path}" in
${cases}
    *) entries=() ;;
  esac
  _describe -t commands 'peer' entries
}
_peer "$@"
`;
}

function renderFish(model: CompletionNode[]): string {
  const descriptions = describeMap(model);
  const header = `# fish completion for peer
# Load with: peer completion fish | source

function __fish_peer_path
    set -l tokens (commandline -opc)
    set -e tokens[1]
    set -l path
    for token in $tokens
        string match -q -- '-*' $token; and continue
        set -a path $token
    end
    string join " " $path
end

function __fish_peer_at
    test (__fish_peer_path) = "$argv[1]"
end

complete -c peer -f`;

  const lines = [header];
  for (const node of model) {
    const guard = node.path.length === 0 ? "-n 'test -z (__fish_peer_path)'" : `-n '__fish_peer_at ${JSON.stringify(nodeKey(node.path))}'`;
    for (const child of node.children) {
      const description = descriptions.get(childKey(node, child));
      lines.push(`complete -c peer ${guard} -a ${JSON.stringify(child)}${description ? ` -d ${JSON.stringify(description)}` : ''}`);
    }
    for (const option of node.options) {
      lines.push(`complete -c peer ${guard} -l ${option.replace(/^--/, '')}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

const RENDERERS: Record<CompletionShell, (model: CompletionNode[]) => string> = {
  bash: renderBash,
  zsh: renderZsh,
  fish: renderFish,
};

export function renderCompletionScript(
  shell: CompletionShell,
  definitions: CommandDefinition[],
  globalOptions = GLOBAL_OPTIONS,
): string {
  return RENDERERS[shell](buildCompletionModel(definitions, globalOptions));
}
