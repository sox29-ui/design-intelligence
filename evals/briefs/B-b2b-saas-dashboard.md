# Brief B — B2B SaaS dashboard

**Product:** *Ledgerline* — a fictional B2B SaaS that reconciles payouts from payment providers against orders and bank deposits for mid-size e-commerce finance teams.

**Screen to design:** the **Reconciliation overview** dashboard (a single screen of the logged-in app).

**Primary user:** a finance operations manager who opens this screen every morning. **Primary task:** see the health of yesterday's reconciliation and triage exceptions quickly (find the urgent ones, open one, assign or resolve).

**Content and data (generate realistic sample data in the page; no backend):**
- KPI summary for the selected period: matched rate (e.g. 97.4%), unmatched amount (e.g. €18,240.55), open exceptions (e.g. 37), median time to resolve (e.g. 1.8 days) — each with change vs previous period.
- 30-day trend of matched vs unmatched volume (chart; can be SVG or canvas you draw yourself).
- Exceptions table: at least 12 rows — ID, provider (Stripe, Adyen, PayPal, Klarna…), amount, currency, age, reason (missing payout, amount mismatch, duplicate, FX difference), status (new / investigating / waiting on provider / resolved), assignee. Must support sorting by age or amount and filtering by status; selecting a row reveals details (side panel or expandable row).
- Filters: date range, payment provider, account/entity, status.
- Activity feed: last 8 events (e.g. "Ana resolved EX-2281").
- App chrome: product navigation (Overview, Exceptions, Payouts, Bank feeds, Rules, Settings), user menu, environment/entity switcher.

**Constraints:**
- Primary viewport desktop 1440×900; must remain usable on a 768 px tablet; on a 390 px phone a read-only priority view is acceptable (KPIs + urgent exceptions).
- Keyboard-operable table, filters with proper labels, status not conveyed by colour alone.
- Numbers must be easy to compare (alignment, tabular figures).
- No marketing-site treatment: this is a tool used daily.
