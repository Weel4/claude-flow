/**
 * V3 CLI UX Audit Command
 * Systematic user experience analysis for codebases and UI components.
 *
 * Checks:
 * - Accessibility (WCAG 2.1/2.2, ARIA, keyboard navigation)
 * - Usability (error states, loading indicators, empty states)
 * - Mobile UX (touch targets, responsive design)
 * - Performance UX (async feedback, CLS sources)
 * - Design consistency (spacing, typography, color)
 * - Content & copy (labels, help text, error messages)
 */

import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

type Severity = 'critical' | 'high' | 'medium' | 'low';

interface UXIssue {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  file: string;
  line?: number;
  problem: string;
  fix: string;
  wcag?: string;
}

interface AuditResult {
  target: string;
  filesScanned: number;
  issues: UXIssue[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
}

type FocusArea = 'accessibility' | 'usability' | 'mobile' | 'performance-ux' | 'consistency' | 'content' | 'all';

// ============================================================================
// File discovery
// ============================================================================

const AUDITABLE_EXTENSIONS = new Set([
  '.tsx', '.jsx', '.vue', '.svelte', '.html',
  '.ts', '.js', '.css', '.scss', '.less',
]);

async function collectFiles(targetPath: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: { name: string; isDirectory: () => boolean }[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip common non-UI directories
        if (['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__'].includes(entry.name)) {
          continue;
        }
        await walk(fullPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDITABLE_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  const stat = await fs.stat(targetPath).catch(() => null);
  if (!stat) return files;

  if (stat.isDirectory()) {
    await walk(targetPath);
  } else {
    const ext = path.extname(targetPath).toLowerCase();
    if (AUDITABLE_EXTENSIONS.has(ext)) {
      files.push(targetPath);
    }
  }

  return files;
}

// ============================================================================
// Check runners
// ============================================================================

let issueCounter = 0;

function makeId(severity: Severity): string {
  issueCounter++;
  const prefix = severity.slice(0, 4).toUpperCase();
  return `${prefix}-${String(issueCounter).padStart(3, '0')}`;
}

async function checkAccessibility(filePath: string, content: string, issues: UXIssue[]): Promise<void> {
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();

    // Image without alt attribute
    const imgNoAlt = /<img(?![^>]*\balt\s*=)[^>]*>/i.exec(line);
    if (imgNoAlt) {
      issues.push({
        id: makeId('critical'),
        severity: 'critical',
        category: 'accessibility',
        title: 'Image missing alt attribute',
        file: filePath,
        line: lineNum,
        problem: `\`<img>\` tag has no \`alt\` attribute: \`${trimmed.slice(0, 80)}\``,
        fix: 'Add descriptive alt text: `<img src={...} alt="description" />`. For decorative images use `alt=""`.',
        wcag: 'WCAG 1.1.1 Non-text Content (Level A)',
      });
    }

    // Button with no accessible name (no text, no aria-label, no aria-labelledby, no title)
    const emptyBtn = /<button(?![^>]*(?:aria-label|aria-labelledby|title)\s*=)[^>]*>\s*<\/button>/i.exec(line);
    if (emptyBtn) {
      issues.push({
        id: makeId('critical'),
        severity: 'critical',
        category: 'accessibility',
        title: 'Button has no accessible name',
        file: filePath,
        line: lineNum,
        problem: `Empty \`<button>\` with no visible text or ARIA label.`,
        fix: 'Add visible text or `aria-label`: `<button aria-label="Close dialog">...</button>`',
        wcag: 'WCAG 4.1.2 Name, Role, Value (Level A)',
      });
    }

    // Input without associated label
    const inputNoLabel = /<input(?![^>]*(?:aria-label|aria-labelledby|id\s*=)[^>]*>)[^>]*type\s*=\s*["'](?!hidden)[^"']*["'][^>]*>/i.exec(line);
    if (inputNoLabel && !/<label/i.test(content.slice(Math.max(0, content.indexOf(line) - 200), content.indexOf(line) + 200))) {
      issues.push({
        id: makeId('critical'),
        severity: 'critical',
        category: 'accessibility',
        title: 'Input field missing label',
        file: filePath,
        line: lineNum,
        problem: `\`<input>\` has no associated \`<label>\` or \`aria-label\`.`,
        fix: 'Add a label: `<label htmlFor="email">Email</label><input id="email" .../>` or use `aria-label`.',
        wcag: 'WCAG 1.3.1 Info and Relationships (Level A)',
      });
    }

    // onClick on non-interactive element (div/span with click handler but no role)
    const clickableDiv = /(<(?:div|span)[^>]*onClick[^>]*>)/i.exec(line);
    if (clickableDiv && !/role\s*=\s*["'](?:button|link|menuitem|option|switch|tab|treeitem)["']/i.test(line)) {
      issues.push({
        id: makeId('high'),
        severity: 'high',
        category: 'accessibility',
        title: 'Clickable element missing ARIA role',
        file: filePath,
        line: lineNum,
        problem: `\`<div>\` or \`<span>\` with click handler but no ARIA role or keyboard support.`,
        fix: 'Use `<button>` instead, or add `role="button"` + `tabIndex={0}` + `onKeyDown` handler.',
        wcag: 'WCAG 4.1.2 Name, Role, Value (Level A)',
      });
    }

    // autoFocus without corresponding focus management explanation (heuristic)
    if (/autoFocus/i.test(line)) {
      issues.push({
        id: makeId('medium'),
        severity: 'medium',
        category: 'accessibility',
        title: 'Verify autoFocus usage',
        file: filePath,
        line: lineNum,
        problem: `\`autoFocus\` can disrupt screen reader flow if used unexpectedly.`,
        fix: 'Only use `autoFocus` on first field of a dialog/modal, not on page load.',
        wcag: 'WCAG 2.4.3 Focus Order (Level A)',
      });
    }
  });
}

async function checkUsability(filePath: string, content: string, issues: UXIssue[]): Promise<void> {
  const lines = content.split('\n');

  // Detect async patterns: look for fetch/axios/await without loading state nearby
  const hasAsync = /\b(fetch|axios|await\s+\w+\.(get|post|put|delete|patch))\s*\(/i.test(content);
  const hasLoadingState = /\b(loading|isLoading|isFetching|isPending|skeleton|Spinner|CircularProgress|LoadingIndicator)\b/i.test(content);
  if (hasAsync && !hasLoadingState) {
    issues.push({
      id: makeId('high'),
      severity: 'high',
      category: 'usability',
      title: 'Async operation without loading indicator',
      file: filePath,
      problem: 'Async data fetching detected but no loading state found. Users see blank content during load.',
      fix: 'Add a loading state: `const [loading, setLoading] = useState(false)` and show a spinner/skeleton.',
    });
  }

  // Detect empty state gaps: .map() without fallback for empty array
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    if (/\.\s*map\s*\(/.test(line) && !/\.length\s*(?:===|!==|>|<|&&|\|\|)/.test(content.slice(Math.max(0, content.indexOf(line) - 300), content.indexOf(line) + 100))) {
      issues.push({
        id: makeId('medium'),
        severity: 'medium',
        category: 'usability',
        title: 'List rendering without empty state',
        file: filePath,
        line: lineNum,
        problem: '`.map()` renders list items but no empty-state fallback is detected nearby.',
        fix: 'Add empty state: `{items.length === 0 ? <EmptyState /> : items.map(...)}`',
      });
    }

    // Raw error message exposed to user
    if (/setError\s*\(\s*(?:e|err|error)(?:\.message)?\s*\)/i.test(line) || /setState\s*\(.*\.message\s*\)/i.test(line)) {
      issues.push({
        id: makeId('high'),
        severity: 'high',
        category: 'usability',
        title: 'Raw technical error exposed to user',
        file: filePath,
        line: lineNum,
        problem: 'Setting error state directly from caught exception exposes technical messages to users.',
        fix: 'Use user-friendly messages: `setError("Something went wrong. Please try again.")` and log the raw error.',
      });
    }

    // Vague button labels
    const vagueBtnText = /<[Bb]utton[^>]*>\s*(Submit|Click here|OK|Yes|No|Button)\s*<\/[Bb]utton>/i.exec(line);
    if (vagueBtnText) {
      issues.push({
        id: makeId('medium'),
        severity: 'medium',
        category: 'usability',
        title: 'Vague button label',
        file: filePath,
        line: lineNum,
        problem: `Button has a generic label "${vagueBtnText[1]}" that doesn't describe the action.`,
        fix: 'Use action-specific labels: "Save changes", "Delete account", "Send message".',
        wcag: 'WCAG 2.4.6 Headings and Labels (Level AA)',
      });
    }
  });
}

async function checkMobileUX(filePath: string, content: string, issues: UXIssue[]): Promise<void> {
  const lines = content.split('\n');
  const isCssFile = filePath.endsWith('.css') || filePath.endsWith('.scss') || filePath.endsWith('.less');

  if (isCssFile) {
    let inBlock = false;
    let blockContent = '';
    let blockStart = 0;
    let hasHeightOrMinHeight = false;
    let heightValue = 0;

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      if (line.includes('{')) {
        inBlock = true;
        blockContent = '';
        blockStart = lineNum;
        hasHeightOrMinHeight = false;
        heightValue = 0;
      }

      if (inBlock) blockContent += line;

      // Check touch target size
      const heightMatch = /(?:^|\s)(?:height|min-height|line-height)\s*:\s*(\d+)px/i.exec(line);
      if (heightMatch) {
        hasHeightOrMinHeight = true;
        heightValue = parseInt(heightMatch[1], 10);
      }

      if (line.includes('}') && inBlock) {
        // Heuristic: interactive elements (button/link classes) with small heights
        const isInteractive = /(?:btn|button|link|click|touch|tap|action|cta)/i.test(blockContent);
        if (isInteractive && hasHeightOrMinHeight && heightValue > 0 && heightValue < 44) {
          issues.push({
            id: makeId('high'),
            severity: 'high',
            category: 'mobile',
            title: 'Touch target too small',
            file: filePath,
            line: blockStart,
            problem: `Interactive element has height ${heightValue}px — below the 44px minimum touch target (Apple HIG / WCAG 2.5.5).`,
            fix: 'Set `min-height: 44px` (iOS) or `min-height: 48px` (Android Material) for interactive elements.',
            wcag: 'WCAG 2.5.5 Target Size (Level AAA) / Apple HIG / Material Design',
          });
        }
        inBlock = false;
      }

      // Fixed width that may break responsive layout
      const fixedWidth = /(?:^|\s)width\s*:\s*(\d+)px/i.exec(line);
      if (fixedWidth && parseInt(fixedWidth[1], 10) > 320) {
        issues.push({
          id: makeId('medium'),
          severity: 'medium',
          category: 'mobile',
          title: 'Fixed pixel width may break responsive layout',
          file: filePath,
          line: lineNum,
          problem: `Fixed \`width: ${fixedWidth[1]}px\` can cause horizontal scroll on narrow screens.`,
          fix: 'Use `max-width` with `width: 100%`, or CSS Grid/Flexbox for fluid layouts.',
        });
      }
    });
  }

  // Check for missing viewport meta in HTML
  if (filePath.endsWith('.html')) {
    if (!/<meta[^>]*name\s*=\s*["']viewport["'][^>]*>/i.test(content)) {
      issues.push({
        id: makeId('high'),
        severity: 'high',
        category: 'mobile',
        title: 'Missing viewport meta tag',
        file: filePath,
        problem: 'HTML file has no `<meta name="viewport">` tag — page will not scale properly on mobile.',
        fix: 'Add to `<head>`: `<meta name="viewport" content="width=device-width, initial-scale=1">`',
      });
    }
  }
}

async function checkPerformanceUX(filePath: string, content: string, issues: UXIssue[]): Promise<void> {
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // Images without explicit width/height (CLS risk)
    const imgNoDimensions = /<img(?![^>]*(?:\bwidth\s*=|\bheight\s*=|\bstyle\s*=))[^>]*>/i.exec(line);
    if (imgNoDimensions) {
      issues.push({
        id: makeId('medium'),
        severity: 'medium',
        category: 'performance-ux',
        title: 'Image without explicit dimensions (CLS risk)',
        file: filePath,
        line: lineNum,
        problem: 'Images without `width`/`height` cause Cumulative Layout Shift (CLS), degrading perceived performance.',
        fix: 'Add explicit `width` and `height` attributes or use CSS aspect-ratio to reserve space.',
      });
    }

    // Large inline data URIs
    if (/src\s*=\s*["']data:[^"']{500,}["']/i.test(line)) {
      issues.push({
        id: makeId('low'),
        severity: 'low',
        category: 'performance-ux',
        title: 'Large inline data URI',
        file: filePath,
        line: lineNum,
        problem: 'Large base64-encoded inline images increase HTML size and slow initial render.',
        fix: 'Move large assets to external files and load lazily with `loading="lazy"`.',
      });
    }
  });
}

async function checkConsistency(filePath: string, content: string, issues: UXIssue[]): Promise<void> {
  const isCssFile = filePath.endsWith('.css') || filePath.endsWith('.scss') || filePath.endsWith('.less');
  if (!isCssFile) return;

  const lines = content.split('\n');

  // Detect magic number spacing (hardcoded px values not divisible by 4)
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const spacingMatch = /(?:margin|padding)\s*:\s*([\d]+)px/i.exec(line);
    if (spacingMatch) {
      const val = parseInt(spacingMatch[1], 10);
      if (val % 4 !== 0 && val > 0) {
        issues.push({
          id: makeId('low'),
          severity: 'low',
          category: 'consistency',
          title: 'Non-standard spacing value',
          file: filePath,
          line: lineNum,
          problem: `Spacing value \`${val}px\` is not on a 4px grid, which breaks visual rhythm.`,
          fix: `Use a multiple of 4: ${Math.round(val / 4) * 4}px. Consider using design tokens or CSS custom properties.`,
        });
      }
    }
  });
}

async function checkContent(filePath: string, content: string, issues: UXIssue[]): Promise<void> {
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // Placeholder-only inputs (placeholder is not a label substitute)
    const placeholderNoLabel = /<input[^>]*placeholder\s*=[^>]*>/i.exec(line);
    if (placeholderNoLabel && !/<label/i.test(content.slice(
      Math.max(0, content.indexOf(line) - 300),
      content.indexOf(line) + 100
    ))) {
      issues.push({
        id: makeId('medium'),
        severity: 'medium',
        category: 'content',
        title: 'Placeholder used as label substitute',
        file: filePath,
        line: lineNum,
        problem: 'Using `placeholder` as the only hint disappears on focus, failing users with cognitive or memory issues.',
        fix: 'Add a visible `<label>` element. Keep placeholder as an example value, not the field description.',
        wcag: 'WCAG 1.3.5 Identify Input Purpose (Level AA)',
      });
    }

    // Console.error leaked to UI (UX: user sees nothing, dev sees error in console)
    if (/console\.(error|warn)\s*\(/.test(line) && !/\/\//.test(line.trim().split('console')[0])) {
      issues.push({
        id: makeId('low'),
        severity: 'low',
        category: 'content',
        title: 'Error silently logged to console only',
        file: filePath,
        line: lineNum,
        problem: 'Error is logged to console but users receive no feedback.',
        fix: 'Add user-facing error handling: show a toast, inline error message, or error boundary.',
      });
    }
  });
}

// ============================================================================
// Audit runner
// ============================================================================

async function runFileAudit(
  filePath: string,
  focus: FocusArea,
): Promise<UXIssue[]> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return [];
  }

  const issues: UXIssue[] = [];

  if (focus === 'all' || focus === 'accessibility') {
    await checkAccessibility(filePath, content, issues);
  }
  if (focus === 'all' || focus === 'usability') {
    await checkUsability(filePath, content, issues);
  }
  if (focus === 'all' || focus === 'mobile') {
    await checkMobileUX(filePath, content, issues);
  }
  if (focus === 'all' || focus === 'performance-ux') {
    await checkPerformanceUX(filePath, content, issues);
  }
  if (focus === 'all' || focus === 'consistency') {
    await checkConsistency(filePath, content, issues);
  }
  if (focus === 'all' || focus === 'content') {
    await checkContent(filePath, content, issues);
  }

  return issues;
}

// ============================================================================
// Report formatters
// ============================================================================

function severityColor(s: Severity): string {
  const map: Record<Severity, string> = {
    critical: '\x1b[31m', // red
    high: '\x1b[91m',     // bright red
    medium: '\x1b[33m',   // yellow
    low: '\x1b[36m',      // cyan
  };
  return map[s];
}

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function printTextReport(result: AuditResult, minSeverity: Severity): void {
  const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low'];
  const minIdx = severityOrder.indexOf(minSeverity);
  const filtered = result.issues.filter(i => severityOrder.indexOf(i.severity) <= minIdx);

  console.log(`\n${BOLD}UX Audit Report${RESET}`);
  console.log('═'.repeat(60));
  console.log(`${DIM}Target:${RESET}  ${result.target}`);
  console.log(`${DIM}Files:${RESET}   ${result.filesScanned} scanned`);
  console.log(`${DIM}Issues:${RESET}  ${result.summary.total} total`);

  const bar = (count: number, color: string, label: string) =>
    `  ${color}${BOLD}${label.padEnd(10)}${RESET} ${color}${'█'.repeat(Math.min(count, 30))}${RESET} ${count}`;

  console.log(bar(result.summary.critical, '\x1b[31m', 'Critical'));
  console.log(bar(result.summary.high, '\x1b[91m', 'High'));
  console.log(bar(result.summary.medium, '\x1b[33m', 'Medium'));
  console.log(bar(result.summary.low, '\x1b[36m', 'Low'));

  if (filtered.length === 0) {
    console.log(`\n${'\x1b[32m'}No issues found above minimum severity "${minSeverity}".${RESET}\n`);
    return;
  }

  for (const sev of severityOrder.slice(0, minIdx + 1)) {
    const group = filtered.filter(i => i.severity === sev);
    if (group.length === 0) continue;

    const color = severityColor(sev);
    const label = sev.charAt(0).toUpperCase() + sev.slice(1);
    console.log(`\n${BOLD}${color}${label} Issues (${group.length})${RESET}`);
    console.log('─'.repeat(60));

    for (const issue of group) {
      const fileRef = issue.line ? `${issue.file}:${issue.line}` : issue.file;
      console.log(`\n${color}${BOLD}[${issue.id}]${RESET} ${BOLD}${issue.title}${RESET}`);
      console.log(`  ${DIM}File:${RESET}    ${fileRef}`);
      console.log(`  ${DIM}Problem:${RESET} ${issue.problem}`);
      console.log(`  ${DIM}Fix:${RESET}     ${issue.fix}`);
      if (issue.wcag) {
        console.log(`  ${DIM}WCAG:${RESET}    ${issue.wcag}`);
      }
    }
  }

  // Quick wins — top 3 by severity then by fix simplicity (short fix text)
  const quickWins = filtered
    .slice()
    .sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity))
    .slice(0, 3);

  if (quickWins.length > 0) {
    console.log(`\n${BOLD}Top Quick Wins${RESET}`);
    console.log('─'.repeat(60));
    quickWins.forEach((issue, i) => {
      const color = severityColor(issue.severity);
      const fileRef = issue.line ? `${issue.file}:${issue.line}` : issue.file;
      console.log(`  ${i + 1}. ${color}[${issue.id}]${RESET} ${issue.title}`);
      console.log(`     ${DIM}${fileRef}${RESET}`);
    });
  }

  console.log();
}

function buildMarkdownReport(result: AuditResult): string {
  const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low'];
  const lines: string[] = [
    `## UX Audit Report`,
    ``,
    `**Target**: \`${result.target}\`  `,
    `**Files scanned**: ${result.filesScanned}  `,
    `**Total issues**: ${result.summary.total} (Critical: ${result.summary.critical}, High: ${result.summary.high}, Medium: ${result.summary.medium}, Low: ${result.summary.low})`,
    ``,
  ];

  for (const sev of severityOrder) {
    const group = result.issues.filter(i => i.severity === sev);
    if (group.length === 0) continue;

    const label = sev.charAt(0).toUpperCase() + sev.slice(1);
    lines.push(`### ${label} Issues (${group.length})`);
    lines.push('');

    for (const issue of group) {
      const fileRef = issue.line ? `${issue.file}:${issue.line}` : issue.file;
      lines.push(`- **[${issue.id}]** ${issue.title}`);
      lines.push(`  - File: \`${fileRef}\``);
      lines.push(`  - Problem: ${issue.problem}`);
      lines.push(`  - Fix: ${issue.fix}`);
      if (issue.wcag) lines.push(`  - WCAG: ${issue.wcag}`);
      lines.push('');
    }
  }

  // Quick wins
  const quickWins = result.issues
    .slice()
    .sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity))
    .slice(0, 3);

  if (quickWins.length > 0) {
    lines.push('## Summary & Quick Wins');
    lines.push('');
    quickWins.forEach((issue, i) => {
      const fileRef = issue.line ? `${issue.file}:${issue.line}` : issue.file;
      lines.push(`${i + 1}. **[${issue.id}]** ${issue.title} (\`${fileRef}\`)`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Command definition
// ============================================================================

export const uxAuditCommand: Command = {
  name: 'ux-audit',
  description: 'Run a UX audit on a codebase: accessibility, usability, mobile, performance UX, design consistency, and content',
  aliases: ['ux'],
  options: [
    {
      name: 'path',
      short: 'p',
      description: 'Target path (file or directory) to audit',
      type: 'string',
      default: '.',
    },
    {
      name: 'focus',
      short: 'f',
      description: 'Limit audit to a specific area',
      type: 'string',
      default: 'all',
      choices: ['all', 'accessibility', 'usability', 'mobile', 'performance-ux', 'consistency', 'content'],
    },
    {
      name: 'min-severity',
      short: 's',
      description: 'Minimum severity to report (critical|high|medium|low)',
      type: 'string',
      default: 'low',
      choices: ['critical', 'high', 'medium', 'low'],
    },
    {
      name: 'output',
      short: 'o',
      description: 'Save report to a Markdown file',
      type: 'string',
      default: '',
    },
    {
      name: 'format',
      description: 'Output format: text or json',
      type: 'string',
      default: 'text',
      choices: ['text', 'json'],
    },
    {
      name: 'exit-code',
      description: 'Exit with code 1 if issues found above min-severity',
      type: 'boolean',
      default: false,
    },
  ],
  examples: [
    { command: 'claude-flow ux-audit --path ./src', description: 'Audit all UI files under src/' },
    { command: 'claude-flow ux-audit --path ./src --focus accessibility', description: 'Accessibility-only audit' },
    { command: 'claude-flow ux-audit --path ./src --min-severity high', description: 'Show only critical and high issues' },
    { command: 'claude-flow ux-audit --path ./src --output ux-report.md', description: 'Save report as Markdown' },
    { command: 'claude-flow ux-audit --path ./src --format json', description: 'JSON output for CI integration' },
    { command: 'claude-flow ux-audit --path ./src --exit-code', description: 'Fail CI if issues found' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    // Reset counter for each run
    issueCounter = 0;

    const targetPath = path.resolve(ctx.cwd, (ctx.flags.path as string) || '.');
    const focus = (ctx.flags.focus as FocusArea) || 'all';
    const minSeverity = (ctx.flags['min-severity'] as Severity) || 'low';
    const outputFile = (ctx.flags.output as string) || '';
    const format = (ctx.flags.format as string) || 'text';
    const useExitCode = ctx.flags['exit-code'] as boolean;

    output.printInfo(`Scanning ${output.highlight(targetPath)} for UX issues...`);

    // Discover files
    const files = await collectFiles(targetPath);

    if (files.length === 0) {
      output.printWarning(`No auditable files found at: ${targetPath}`);
      return { success: true, message: 'No files to audit', exitCode: 0 };
    }

    output.printInfo(`Found ${files.length} file(s) — running ${focus === 'all' ? 'full' : focus} audit...`);

    // Run checks concurrently
    const issueArrays = await Promise.all(
      files.map(f => runFileAudit(f, focus))
    );

    const allIssues = issueArrays.flat();
    const summary = {
      critical: allIssues.filter(i => i.severity === 'critical').length,
      high: allIssues.filter(i => i.severity === 'high').length,
      medium: allIssues.filter(i => i.severity === 'medium').length,
      low: allIssues.filter(i => i.severity === 'low').length,
      total: allIssues.length,
    };

    const result: AuditResult = {
      target: targetPath,
      filesScanned: files.length,
      issues: allIssues,
      summary,
    };

    // Output
    if (format === 'json') {
      output.printJson(result);
    } else {
      printTextReport(result, minSeverity);
    }

    // Write Markdown report if requested
    if (outputFile) {
      const markdown = buildMarkdownReport(result);
      const resolvedOutput = path.resolve(ctx.cwd, outputFile);
      await fs.writeFile(resolvedOutput, markdown, 'utf-8');
      output.printSuccess(`Report saved to ${resolvedOutput}`);
    }

    // Determine exit code
    const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low'];
    const minIdx = severityOrder.indexOf(minSeverity);
    const significantIssues = allIssues.filter(
      i => severityOrder.indexOf(i.severity) <= minIdx
    );

    if (useExitCode && significantIssues.length > 0) {
      output.printWarning(`${significantIssues.length} issue(s) found above minimum severity "${minSeverity}".`);
      return { success: false, exitCode: 1, data: result };
    }

    return { success: true, data: result };
  },
};

export default uxAuditCommand;
