# Ledgerline: Reconciliation overview

- **Triage first.** At 1440×900 the exception queue sits above the fold next to a narrow rail (trend, activity). Selecting a row swaps the rail for a detail panel, keeping the table visible. The panel handles assign, status, resolve (with undo) and notes; arrow keys walk the queue.
- **Explicit urgency.** Urgent means past the 3-day SLA or at least €5,000. It shows as icon plus text, with a quick view and KPI shortcut.
- **One dataset.** A seeded generator builds 64 days of volume and ~600 exceptions. KPIs, chart, table and feed all derive from it, so numbers agree under every filter.
- **Comparable numbers.** Tabular figures, right-aligned amounts, currency in its own column. Each KPI shows its delta and the previous value.
- **Honest chart.** Unmatched volume is ~3% of matched, so it gets its own aligned panel and labelled scale instead of a stacked bar. Keyboard-readable, with a screen-reader table.
- **Accessible.** Labelled filters, status as icon, text and colour, roving-focus table, Esc closes, visible focus, dark mode.
- **Responsive.** The table compacts by container width. Tablet gets an icon rail and drawer; phone shows read-only KPIs and urgent exceptions.
