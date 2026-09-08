# Scratch Classic · League Forecast

Working first version: static ES-module frontend, Supabase auth and persistent
workspace storage, and Monte Carlo simulations in a Web Worker.

## Included

- 18 teams, 54 regulars, 43 substitute identities, editable team names, 34 weeks.
- Individual scoring histories are imported privately; none are bundled in source.
- CSV/XLSX history imports, multi-sheet workbooks, previews, explicit name
  matching, duplicate/conflict detection, and summary/marked blind exclusion.
- Full-week CSV import, complete-match validation, and sequential-week checks.
- Nine-point standings, position rounds, skill ramps, seeded season simulations,
  seven playoff qualifiers, and the three-game/four-game championship bracket.
- Save/load to Supabase, administrator access, revision conflict protection,
  historical simulation snapshots, and downloadable/restorable JSON backups.

## Supabase setup (not executed remotely)

Run these scripts once, in order, in the project SQL Editor. Skip any already
successfully applied script:

1. `supabase/migrations/001_foundation.sql`
2. `supabase/migrations/002_seed_league.sql`
3. `supabase/migrations/003_app_access.sql`

Create a confirmed email/password user in Authentication > Users, then run:

```sql
insert into public.app_admins(user_id)
select id from auth.users where email = 'YOUR_EMAIL_HERE'
on conflict do nothing;
```

Sign in to the app and choose **Save league**. The Setup screen provides the
same SQL scripts. Never commit a secret key, service-role key, or password.
The publishable key is intentionally public.

## Persistence

`league_workspaces.state` is the authoritative saved workspace in this release.
It saves names, history, results, adjustments, and recent simulation runs
atomically. Revision checking prevents silent overwrites by another session.
RLS and the save RPC restrict access to explicitly approved administrators.
Signing up does not grant access.

The normalized tables in migrations 001/002 are initial seeds and are **not
synchronized live** with the workspace yet. Edit data through the app. Before
setup/login, the app labels edits as unsaved drafts. Export before closing.
Browser session storage stores only authentication, never authoritative league
data. Passwords are not stored.

## Formats

History: `Week, Date, Gm1, Gm2, Gm3, Gm4, SS` (Gm4 and SS optional).
One bowler per sheet. Date supports Excel serial, ISO, or US dates. Cached cell
values are read; workbook formulas are never executed. Missing or inconsistent
scores block import until corrected in the source file or import preview. Numeric absence scores must be marked `ScoreType=blind`.
History sessions are keyed by bowler, season, and date; this version assumes
one historical league session per bowler per date.

Weekly CSV: `Week, TeamNumber, Bowler, Gm1, Gm2, Gm3, ScoreType`.
Use the app’s prefilled template. Types are actual or blind. Substitute scores
train that substitute, not the replaced regular. To correct results, remove
the latest imported week and reimport it.

## Provisional model

Not backtested. Historical mean is recency-weighted and anchored with 12 games
at entering average. Current scores blend with 30 games of prior weight.
Standard deviation shrinks toward 30 pins with 24 games of weight. Bounded,
rounded normal scores include a shared condition effect (SD 5) and a bowler
session effect (SD 8). These are initial assumptions, not fitted settings.

Actual results remain fixed. Position pairings are recalculated per trial.
Unique third winners qualify first; season points fill remaining places to
seven. A multiple-third winner is seed 1. Matches are three games except the
four-game championship; tied matches use a one-game roll-off. Actual third
roll-off winners can be recorded as overrides.

Pending assumptions are visible in Setup: exactly tied points/team average
uses team-number order for position rounds; tied seeds and multi-team
qualification use simultaneous one-game scores; calculated team average is
season-to-date team pins divided by team games.

Future games assume the regular lineup attends. Forecasting absences and
substitute eligibility, A/B/C entry, completed playoff imports, and backtesting
remain future work. Championship date is TBD; projection Week 37 is the final,
not a confirmed date. Probabilities remain provisional while histories arrive.

## Development

No dependencies or build step. Serve `dist/` with a static server. Current
browsers need ES modules, Workers, and native deflate-raw DecompressionStream
for XLSX; CSV is the fallback. XLS, XLSM, and outer ZIP uploads are unsupported.

```sh
node --test tests/model.test.mjs
node scripts/validate.mjs
```

Tests cover scoring, fixed results, roster validation, duplicate handling,
four-game sessions, ramps, repeatability, and conservation of points and odds.
Remote database execution and browser interaction QA have not been performed.

The authored dist directory is tracked. Sites hosts it privately. Relative
asset paths also support GitHub Pages; no GitHub Pages deploy was enabled.
