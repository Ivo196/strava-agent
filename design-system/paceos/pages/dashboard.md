# Dashboard Page Overrides

> **PROJECT:** PaceOS
> **Generated:** 2026-07-20 20:15:15
> **Page Type:** Dashboard / Data View

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1400px or full-width
- **Grid:** 12-column grid for data flexibility
- **Sections:** 1. Hero (product + live preview or status), 2. Key metrics/indicators, 3. How it works, 4. CTA (Start trial / Contact)

### Spacing Overrides

- **Content Density:** High — optimize for information display

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- **Strategy:** Dark or neutral. Status colors (green/amber/red). Data-dense but scannable.

### Component Overrides

- Avoid: Error without recovery path
- Avoid: Single row actions only
- Avoid: Auto-play high-res video loops

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: Hover tooltips, chart zoom on click, row highlighting on hover, smooth filter animations, data loading spinners
- Feedback: Provide clear next steps
- Data Entry: Allow multi-select and bulk edit
- Sustainability: Click-to-play or pause when off-screen
- CTA Placement: Primary CTA in nav + After metrics

## Implemented Interaction Rules

- Keep the page server-rendered; isolate state inside leaf components.
- The weekly calendar is selectable and updates one detail panel with `aria-live`.
- Animate only data fills and the selected-day transition, for at most 280 ms.
- Disable all dashboard motion under `prefers-reduced-motion`.
- QA scenarios are query-based and read-only; always label simulated data visibly.
