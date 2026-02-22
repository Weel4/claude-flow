/**
 * UX Audit Command Tests
 * Tests for the ux-audit command: accessibility, usability, mobile, and content checks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { uxAuditCommand } from '../src/commands/ux-audit.js';
import type { CommandContext } from '../src/types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    args: [],
    flags: { _: [], path: '.', focus: 'all', 'min-severity': 'low', output: '', format: 'text', 'exit-code': false },
    cwd: process.cwd(),
    interactive: false,
    ...overrides,
  };
}

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ux-audit-test-'));
}

async function writeFile(dir: string, name: string, content: string): Promise<string> {
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

// ============================================================================
// Tests
// ============================================================================

describe('ux-audit command', () => {
  describe('command definition', () => {
    it('has correct name and alias', () => {
      expect(uxAuditCommand.name).toBe('ux-audit');
      expect(uxAuditCommand.aliases).toContain('ux');
    });

    it('has a description', () => {
      expect(uxAuditCommand.description).toBeTruthy();
      expect(uxAuditCommand.description.length).toBeGreaterThan(10);
    });

    it('has required options', () => {
      const optionNames = (uxAuditCommand.options ?? []).map(o => o.name);
      expect(optionNames).toContain('path');
      expect(optionNames).toContain('focus');
      expect(optionNames).toContain('min-severity');
      expect(optionNames).toContain('output');
      expect(optionNames).toContain('format');
      expect(optionNames).toContain('exit-code');
    });

    it('has focus choices including all audit areas', () => {
      const focusOption = uxAuditCommand.options?.find(o => o.name === 'focus');
      expect(focusOption?.choices).toContain('all');
      expect(focusOption?.choices).toContain('accessibility');
      expect(focusOption?.choices).toContain('usability');
      expect(focusOption?.choices).toContain('mobile');
      expect(focusOption?.choices).toContain('performance-ux');
      expect(focusOption?.choices).toContain('consistency');
      expect(focusOption?.choices).toContain('content');
    });

    it('has examples', () => {
      expect(uxAuditCommand.examples?.length).toBeGreaterThan(0);
    });
  });

  describe('accessibility checks', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await makeTempDir();
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('detects image missing alt attribute', async () => {
      await writeFile(tmpDir, 'test.tsx', '<img src="hero.jpg" />');
      const ctx = makeCtx({
        cwd: tmpDir,
        flags: { _: [], path: '.', focus: 'accessibility', 'min-severity': 'low', output: '', format: 'json', 'exit-code': false },
      });

      const result = await uxAuditCommand.action!(ctx) as any;
      expect(result?.success).toBe(true);
      const issues = result?.data?.issues ?? [];
      const imgIssue = issues.find((i: any) => i.title.includes('alt'));
      expect(imgIssue).toBeDefined();
      expect(imgIssue.severity).toBe('critical');
      expect(imgIssue.wcag).toContain('1.1.1');
    });

    it('does not flag image with alt attribute', async () => {
      await writeFile(tmpDir, 'test.tsx', '<img src="hero.jpg" alt="Hero banner" />');
      const ctx = makeCtx({
        cwd: tmpDir,
        flags: { _: [], path: '.', focus: 'accessibility', 'min-severity': 'low', output: '', format: 'json', 'exit-code': false },
      });

      const result = await uxAuditCommand.action!(ctx) as any;
      const issues = result?.data?.issues ?? [];
      const imgIssue = issues.find((i: any) => i.title.includes('alt'));
      expect(imgIssue).toBeUndefined();
    });

    it('detects clickable div without ARIA role', async () => {
      await writeFile(tmpDir, 'test.tsx', '<div onClick={handleClick}>Click me</div>');
      const ctx = makeCtx({
        cwd: tmpDir,
        flags: { _: [], path: '.', focus: 'accessibility', 'min-severity': 'low', output: '', format: 'json', 'exit-code': false },
      });

      const result = await uxAuditCommand.action!(ctx) as any;
      const issues = result?.data?.issues ?? [];
      const roleIssue = issues.find((i: any) => i.title.toLowerCase().includes('aria role'));
      expect(roleIssue).toBeDefined();
      expect(roleIssue.severity).toBe('high');
    });

    it('does not flag div with onClick when role is present', async () => {
      await writeFile(tmpDir, 'test.tsx', '<div onClick={handleClick} role="button" tabIndex={0}>Click me</div>');
      const ctx = makeCtx({
        cwd: tmpDir,
        flags: { _: [], path: '.', focus: 'accessibility', 'min-severity': 'low', output: '', format: 'json', 'exit-code': false },
      });

      const result = await uxAuditCommand.action!(ctx) as any;
      const issues = result?.data?.issues ?? [];
      const roleIssue = issues.find((i: any) => i.title.toLowerCase().includes('aria role'));
      expect(roleIssue).toBeUndefined();
    });
  });

  describe('usability checks', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await makeTempDir();
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('detects async fetch without loading state', async () => {
      const content = `
        async function loadData() {
          const data = await fetch('/api/users');
          setData(await data.json());
        }
      `;
      await writeFile(tmpDir, 'UserList.tsx', content);

      const ctx = makeCtx({
        cwd: tmpDir,
        flags: { _: [], path: '.', focus: 'usability', 'min-severity': 'low', output: '', format: 'json', 'exit-code': false },
      });

      const result = await uxAuditCommand.action!(ctx) as any;
      const issues = result?.data?.issues ?? [];
      const loadingIssue = issues.find((i: any) => i.title.toLowerCase().includes('loading'));
      expect(loadingIssue).toBeDefined();
      expect(loadingIssue.severity).toBe('high');
    });

    it('does not flag async fetch when loading state exists', async () => {
      const content = `
        const [loading, setLoading] = useState(false);
        async function loadData() {
          setLoading(true);
          const data = await fetch('/api/users');
          setData(await data.json());
          setLoading(false);
        }
      `;
      await writeFile(tmpDir, 'UserList.tsx', content);

      const ctx = makeCtx({
        cwd: tmpDir,
        flags: { _: [], path: '.', focus: 'usability', 'min-severity': 'low', output: '', format: 'json', 'exit-code': false },
      });

      const result = await uxAuditCommand.action!(ctx) as any;
      const issues = result?.data?.issues ?? [];
      const loadingIssue = issues.find((i: any) => i.title.toLowerCase().includes('loading'));
      expect(loadingIssue).toBeUndefined();
    });

    it('detects raw error message exposed to user', async () => {
      const content = `
        try {
          await saveData();
        } catch (e) {
          setError(e.message);
        }
      `;
      await writeFile(tmpDir, 'Form.tsx', content);

      const ctx = makeCtx({
        cwd: tmpDir,
        flags: { _: [], path: '.', focus: 'usability', 'min-severity': 'low', output: '', format: 'json', 'exit-code': false },
      });

      const result = await uxAuditCommand.action!(ctx) as any;
      const issues = result?.data?.issues ?? [];
      const errorIssue = issues.find((i: any) => i.title.toLowerCase().includes('error'));
      expect(errorIssue).toBeDefined();
      expect(errorIssue.severity).toBe('high');
    });

    it('detects vague button labels', async () => {
      await writeFile(tmpDir, 'test.tsx', '<button>Submit</button>');

      const ctx = makeCtx({
        cwd: tmpDir,
        flags: { _: [], path: '.', focus: 'usability', 'min-severity': 'low', output: '', format: 'json', 'exit-code': false },
      });

      const result = await uxAuditCommand.action!(ctx) as any;
      const issues = result?.data?.issues ?? [];
      const btnIssue = issues.find((i: any) => i.title.toLowerCase().includes('vague') || i.title.toLowerCase().includes('button'));
      expect(btnIssue).toBeDefined();
      expect(btnIssue.severity).toBe('medium');
    });
  });

  describe('mobile UX checks', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await makeTempDir();
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('detects missing viewport meta in HTML', async () => {
      await writeFile(tmpDir, 'index.html', `
        <!DOCTYPE html>
        <html><head><title>Test</title></head><body></body></html>
      `);

      const ctx = makeCtx({
        cwd: tmpDir,
        flags: { _: [], path: '.', focus: 'mobile', 'min-severity': 'low', output: '', format: 'json', 'exit-code': false },
      });

      const result = await uxAuditCommand.action!(ctx) as any;
      const issues = result?.data?.issues ?? [];
      const viewportIssue = issues.find((i: any) => i.title.toLowerCase().includes('viewport'));
      expect(viewportIssue).toBeDefined();
      expect(viewportIssue.severity).toBe('high');
    });

    it('does not flag HTML with viewport meta', async () => {
      await writeFile(tmpDir, 'index.html', `
        <!DOCTYPE html>
        <html><head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head><body></body></html>
      `);

      const ctx = makeCtx({
        cwd: tmpDir,
        flags: { _: [], path: '.', focus: 'mobile', 'min-severity': 'low', output: '', format: 'json', 'exit-code': false },
      });

      const result = await uxAuditCommand.action!(ctx) as any;
      const issues = result?.data?.issues ?? [];
      const viewportIssue = issues.find((i: any) => i.title.toLowerCase().includes('viewport'));
      expect(viewportIssue).toBeUndefined();
    });
  });

  describe('report output', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await makeTempDir();
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('returns success when no issues found', async () => {
      await writeFile(tmpDir, 'clean.tsx', '<img src="test.jpg" alt="Test image" />');

      const ctx = makeCtx({
        cwd: tmpDir,
        flags: { _: [], path: '.', focus: 'accessibility', 'min-severity': 'low', output: '', format: 'json', 'exit-code': false },
      });

      const result = await uxAuditCommand.action!(ctx) as any;
      expect(result?.success).toBe(true);
    });

    it('writes markdown report to file when --output is specified', async () => {
      await writeFile(tmpDir, 'test.html', `
        <!DOCTYPE html><html><head><title>Test</title></head><body></body></html>
      `);

      const reportPath = path.join(tmpDir, 'report.md');
      const ctx = makeCtx({
        cwd: tmpDir,
        flags: {
          _: [],
          path: '.',
          focus: 'all',
          'min-severity': 'low',
          output: 'report.md',
          format: 'text',
          'exit-code': false,
        },
      });

      await uxAuditCommand.action!(ctx);

      const reportExists = await fs.stat(reportPath).then(() => true).catch(() => false);
      expect(reportExists).toBe(true);

      const content = await fs.readFile(reportPath, 'utf-8');
      expect(content).toContain('UX Audit Report');
      expect(content).toContain('Target');
    });

    it('exits with failure when --exit-code is set and issues exist', async () => {
      await writeFile(tmpDir, 'test.html', `
        <!DOCTYPE html><html><head><title>Test</title></head><body></body></html>
      `);

      const ctx = makeCtx({
        cwd: tmpDir,
        flags: {
          _: [],
          path: '.',
          focus: 'mobile',
          'min-severity': 'high',
          output: '',
          format: 'json',
          'exit-code': true,
        },
      });

      const result = await uxAuditCommand.action!(ctx) as any;
      expect(result?.success).toBe(false);
      expect(result?.exitCode).toBe(1);
    });

    it('returns correct summary counts', async () => {
      // One critical: missing alt
      await writeFile(tmpDir, 'img.tsx', '<img src="test.jpg" />');

      const ctx = makeCtx({
        cwd: tmpDir,
        flags: { _: [], path: '.', focus: 'accessibility', 'min-severity': 'low', output: '', format: 'json', 'exit-code': false },
      });

      const result = await uxAuditCommand.action!(ctx) as any;
      const summary = result?.data?.summary;
      expect(summary).toBeDefined();
      expect(summary.total).toBeGreaterThan(0);
      expect(typeof summary.critical).toBe('number');
      expect(typeof summary.high).toBe('number');
      expect(typeof summary.medium).toBe('number');
      expect(typeof summary.low).toBe('number');
      expect(summary.total).toBe(
        summary.critical + summary.high + summary.medium + summary.low
      );
    });

    it('returns success with no files found in empty dir', async () => {
      const ctx = makeCtx({
        cwd: tmpDir,
        flags: { _: [], path: '.', focus: 'all', 'min-severity': 'low', output: '', format: 'json', 'exit-code': false },
      });

      const result = await uxAuditCommand.action!(ctx) as any;
      expect(result?.success).toBe(true);
    });
  });

  describe('json format', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await makeTempDir();
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('returns structured data in JSON format', async () => {
      await writeFile(tmpDir, 'test.tsx', '<img src="logo.png" />');

      const ctx = makeCtx({
        cwd: tmpDir,
        flags: { _: [], path: '.', focus: 'accessibility', 'min-severity': 'low', output: '', format: 'json', 'exit-code': false },
      });

      const result = await uxAuditCommand.action!(ctx) as any;
      const data = result?.data;

      expect(data).toBeDefined();
      expect(data.target).toBeTruthy();
      expect(typeof data.filesScanned).toBe('number');
      expect(Array.isArray(data.issues)).toBe(true);
      expect(data.summary).toBeDefined();
    });

    it('issues have required fields', async () => {
      await writeFile(tmpDir, 'test.tsx', '<img src="logo.png" />');

      const ctx = makeCtx({
        cwd: tmpDir,
        flags: { _: [], path: '.', focus: 'accessibility', 'min-severity': 'low', output: '', format: 'json', 'exit-code': false },
      });

      const result = await uxAuditCommand.action!(ctx) as any;
      const issues: any[] = result?.data?.issues ?? [];

      for (const issue of issues) {
        expect(issue.id).toBeTruthy();
        expect(issue.severity).toMatch(/^(critical|high|medium|low)$/);
        expect(issue.category).toBeTruthy();
        expect(issue.title).toBeTruthy();
        expect(issue.file).toBeTruthy();
        expect(issue.problem).toBeTruthy();
        expect(issue.fix).toBeTruthy();
      }
    });
  });
});
