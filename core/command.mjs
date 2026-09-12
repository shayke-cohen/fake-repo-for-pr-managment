/**
 * Parse a `#dispatch` command out of a comment body.
 *
 * This is the shared contract between three surfaces that must agree exactly:
 * the board posting a comment, a workflow reading one, and a human typing one
 * by hand. It lives here, tested, rather than in YAML -- a regex buried in a
 * workflow `if:` cannot be tested and fails silently forever.
 */

export const MARKER = '#dispatch';

/**
 * ANCHORED TO THE START OF A LINE, and that is the whole point.
 *
 * Kubernetes Prow learned this the expensive way: a substring match fires when
 * someone QUOTES a command while discussing it. "I think #dispatch repair would
 * fix this" must not dispatch anything. Requiring the marker to open its own
 * line makes quoting safe, because a quote is indented or prefixed with `>`.
 */
const COMMAND_RE = /^[ \t]*#dispatch(?:[ \t]+(.*))?$/gim;

/** Fenced code blocks are documentation, never instructions. */
export function stripFences(body) {
  const out = [];
  let fence = null;
  for (const line of String(body ?? '').split('\n')) {
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (m) {
      if (!fence) fence = m[1][0];
      else if (m[1][0] === fence) fence = null;
      out.push('');
      continue;
    }
    out.push(fence ? '' : line);
  }
  return out.join('\n');
}

/** HTML comments carry our own markers; they are never user instruction. */
export const stripHtmlComments = (body) => String(body ?? '').replace(/<!--[\s\S]*?-->/g, '');

/** `>`-quoted lines are somebody else's words being cited. */
export const stripQuotes = (body) =>
  String(body ?? '').split('\n').filter((l) => !/^\s*>/.test(l)).join('\n');

/**
 * `key=value` pairs become named args; everything else stays positional, in
 * order. `#dispatch repair lane=web retries=2 --verbose` ->
 *   { command: 'repair', named: {lane:'web', retries:'2'}, positional:['--verbose'] }
 */
export function parseArgs(rest) {
  const named = {};
  const positional = [];
  for (const tok of String(rest ?? '').trim().split(/\s+/).filter(Boolean)) {
    const m = /^([A-Za-z][\w-]*)=(.*)$/.exec(tok);
    if (m) named[m[1]] = m[2];
    else positional.push(tok);
  }
  return { named, positional };
}

/**
 * @returns {{command, args, instruction, raw}|null}
 *   `command`     the first word after the marker, lowercased ('' if bare)
 *   `instruction` everything after the marker, verbatim -- what an agent reads
 */
export function parseCommand(body) {
  const clean = stripQuotes(stripFences(stripHtmlComments(body)));
  COMMAND_RE.lastIndex = 0;
  const m = COMMAND_RE.exec(clean);
  if (!m) return null;

  const rest = (m[1] ?? '').trim();
  const [first = '', ...tail] = rest.split(/\s+/).filter(Boolean);
  return {
    command: first.toLowerCase(),
    instruction: rest,
    args: parseArgs(tail.join(' ')),
    raw: m[0].trim(),
  };
}

/**
 * Who may dispatch. GitHub's `author_association` on the comment, which is the
 * only trustworthy signal available inside the workflow -- the comment BODY is
 * attacker-controlled and can claim anything.
 */
export const ALLOWED_ASSOCIATIONS = Object.freeze(['OWNER', 'MEMBER', 'COLLABORATOR']);
export const mayDispatch = (assoc) => ALLOWED_ASSOCIATIONS.includes(String(assoc ?? '').toUpperCase());

/**
 * Cap what reaches an agent's prompt.
 *
 * The bodies being summarised here were WRITTEN BY AGENTS, so this is untrusted
 * text on its way into another model's context, not merely a size concern.
 * Truncation is announced rather than silent, so a reader can tell a short
 * section from a clipped one.
 */
export function cap(text, bytes, label = 'section') {
  const s = String(text ?? '');
  if (Buffer.byteLength(s, 'utf8') <= bytes) return s;

  // CUT ON A CHARACTER BOUNDARY, not a byte one. Slicing the buffer at `bytes`
  // lands mid-sequence and yields U+FFFD -- and the text being capped here is
  // agent-written PR bodies, where the dispatch lifecycle comments are
  // literally 🚀 📋 ⚙️ ✅. Iterating the string walks code POINTS, so a
  // surrogate pair is never halved.
  let used = 0;
  let cut = '';
  for (const ch of s) {
    const n = Buffer.byteLength(ch, 'utf8');
    if (used + n > bytes) break;
    used += n;
    cut += ch;
  }
  return `${cut}\n\n[${label} truncated at ${bytes} bytes]`;
}

/** Known commands, and the one-line help each contributes to `/help`. */
export const COMMANDS = Object.freeze({
  repair: 'fix the red CI lanes on this branch and push',
  'resolve-conflict': 'merge the base branch in, resolve conflicts, push',
  answer: 'address the unresolved review findings on this branch',
  explain: 'explain what is blocking this pull request, and change nothing',
  help: 'list these commands',
});

/** Generated, never hand-maintained -- a copied list goes stale on the next verb. */
export const helpText = () =>
  ['**`#dispatch` commands**', '', ...Object.entries(COMMANDS)
    .map(([k, v]) => `- \`#dispatch ${k}\` — ${v}`),
  '', 'Anything else after `#dispatch` is passed to the agent verbatim.'].join('\n');
