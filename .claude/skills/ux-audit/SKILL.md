---
name: "UX Audit Agent"
description: "Perform comprehensive UX audits on codebases and UI components. Analyzes accessibility (WCAG), usability, mobile UX, loading states, error handling, and design consistency. Produces a prioritized list of issues with severity ratings and concrete fix recommendations. Use when you want to find and fix UX problems in a project."
---

# UX Audit Agent

## What This Skill Does

Runs a systematic UX audit on a codebase or target directory. Identifies:
- **Accessibility violations** (WCAG 2.1/2.2, ARIA, keyboard nav)
- **Usability issues** (error messages, loading states, empty states)
- **Mobile UX problems** (touch targets, responsive layout)
- **Design inconsistencies** (spacing, typography, color)
- **Content & copy issues** (vague labels, missing help text)

Each finding includes file path, line number, severity, and a concrete fix.

---

## Quick Start

```bash
# Audit entire project
npx claude-flow@v3alpha ux-audit --path ./src

# Audit specific component directory
npx claude-flow@v3alpha ux-audit --path ./src/components

# Audit with specific focus area
npx claude-flow@v3alpha ux-audit --path ./src --focus accessibility

# Export report to file
npx claude-flow@v3alpha ux-audit --path ./src --output ux-report.md

# Audit and only show critical/high issues
npx claude-flow@v3alpha ux-audit --path ./src --min-severity high
```

---

## How to Invoke This Skill

When a user says any of the following, run this skill:
- "Run a UX audit"
- "Check the UX of this project"
- "Find usability issues"
- "Audit accessibility"
- "What UX problems does this have?"
- "List UX issues to fix"
- "UX tarkistus" / "UX-tarkastus" (Finnish)

### Invocation Pattern

```
Use the ux-audit-agent to audit [target path].
Produce a full report with all issues categorized by severity.
```

---

## Audit Workflow

When this skill is invoked, follow these steps:

### Step 1: Discover Files

Scan the target path for auditable files:
```
.tsx, .jsx, .vue, .svelte  → Component UX issues
.html                       → Semantic HTML, ARIA
.css, .scss, .less          → Visual/responsive issues
.ts, .js                    → UX logic (error handling, async states)
```

### Step 2: Run Checks by Category

#### A11y Checks (Critical)
```typescript
// Check for: images without alt
<img src="..." />            // MISSING alt — CRIT
<img src="..." alt="" />     // Decorative, OK if intentional
<img src="..." alt="photo"/> // Vague — flag as medium

// Check for: buttons without accessible name
<button>                     // No label — CRIT
<button aria-label="Close">  // OK

// Check for: inputs without labels
<input type="text" />        // No label — CRIT
<label htmlFor="name">Name</label><input id="name" /> // OK

// Check for: color contrast
// Flag any inline styles with color/background combinations
```

#### Usability Checks (High)
```typescript
// Loading states — search for async patterns without feedback
fetch(...).then(...)         // Is there a loading state?
async/await patterns         // Is there error handling + UI feedback?

// Error messages
catch(e) => setError(e.message)  // Exposing raw errors to users — flag
catch(e) => setError("Something went wrong. Try again.")  // OK

// Empty states
{items.map(...)}             // Is there a fallback for items.length === 0?

// Button labels
<button>Submit</button>      // Vague — medium priority
<button>Save changes</button>// Clear — OK
```

#### Mobile Checks (High)
```css
/* Touch targets — flag anything interactive < 44px */
.btn { height: 32px; }       /* Too small — high priority */
.btn { min-height: 44px; }   /* OK */

/* Responsive — flag fixed widths > viewport */
.container { width: 1200px; } /* Not responsive — medium */
.container { max-width: 1200px; width: 100%; } /* OK */
```

### Step 3: Score & Prioritize

| Severity | Points | Examples |
|----------|--------|---------|
| Critical | 10 | Missing alt, no form labels, keyboard trap |
| High | 7 | No error messages, touch targets < 44px |
| Medium | 4 | Vague button text, no empty state |
| Low | 1 | Minor copy issues, style inconsistency |

### Step 4: Generate Report

```markdown
## UX Audit Report
**Target**: ./src/components
**Total Issues**: 23 (Critical: 4, High: 8, Medium: 9, Low: 2)

### Critical Issues (4)

- [CRIT-001] Image missing alt text
  File: src/components/Hero.tsx:12
  Problem: `<img src={hero.url} />` has no alt attribute
  Fix: Add descriptive alt or empty alt for decorative images
  ```tsx
  // Descriptive:
  <img src={hero.url} alt={hero.description} />
  // Decorative:
  <img src={hero.url} alt="" role="presentation" />
  ```
  WCAG: 1.1.1 Non-text Content (Level A)

...

## Summary & Quick Wins
1. Add alt text to 4 images (30 min) — fixes WCAG 1.1.1
2. Add loading states to 3 async operations (1h) — prevents blank UI
3. Increase touch target sizes in mobile nav (20 min) — fixes mobile usability
```

---

## Focus Areas

Use `--focus` to limit the audit scope:

| Flag | Checks |
|------|--------|
| `accessibility` | WCAG, ARIA, keyboard, screen reader |
| `usability` | Error states, loading, empty states, feedback |
| `mobile` | Touch targets, responsive, viewport |
| `performance-ux` | Loading indicators, CLS, skeleton screens |
| `consistency` | Design system adherence, spacing, typography |
| `content` | Copy quality, labels, help text |

---

## Integration with Claude Flow

```bash
# Run as part of CI pipeline
npx claude-flow@v3alpha ux-audit --path ./src --output reports/ux-$(date +%Y%m%d).md --exit-code

# Spawn as a swarm agent for large codebases
npx claude-flow@v3alpha swarm init --topology hierarchical
npx claude-flow@v3alpha agent spawn -t ux-audit-agent --name ux-auditor

# Use with hooks for continuous UX monitoring
npx claude-flow@v3alpha hooks post-edit --file src/components/Button.tsx --ux-check
```

---

## Example Output

```
UX Audit Complete
=================
Target: ./src
Files scanned: 47
Issues found: 23

  Critical  ████████████ 4
  High      ████████████████████ 8
  Medium    ████████████████████████ 9
  Low       ████ 2

Top 3 Quick Wins:
  1. [CRIT-001] Add alt text to Hero image (Hero.tsx:12)
  2. [HIGH-003] Add loading state to UserList fetch (UserList.tsx:45)
  3. [HIGH-007] Increase button touch targets (Button.css:23)

Report saved to: ux-report.md
```

---

## Notes

- Always audit in context of the actual framework (React, Vue, etc.)
- WCAG 2.2 is the current standard (June 2023+)
- Check both the component code and any associated CSS
- Consider the full user journey, not just individual components
- Mobile-first means auditing smallest breakpoint first
