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

Unknown names in weekly imports can be matched to an existing bowler or added
using **Add as substitute**. New substitutes are created only after the whole
week passes validation and you click **Import week**. Their weekly team receives
the scores; regular rosters remain unchanged. New substitutes have no entering
average or prior history, so the existing model uses its default 200-pin anchor.
Use **Save league** to persist the imported results and new substitutes. View
them under **Player ratings → Include substitutes**.

## Stats and All-Play

These pages derive their values from the saved imported scores. They do not
write calculated stats back to scores, alter official scoring, change the
simulation engine, or replace regular lineups. Stats refresh on each render,
including after import, undo, restore and loading a saved league.

**Stats** has Overview, Leaders, Consistency, Milestones and Trends sections.
Filter by current season or a historical season, A/B/C/unassigned category,
and minimum games. The automatic minimum is one game through Week 2 and nine
from Week 3 onward; historical views default to nine. Clear the minimum input
to restore the automatic rule. All leaderboards/cards honor these filters.
Click a bowler for their distributions, milestones, real sessions and weekly
average chart. Category can be set there, then persisted with **Save league**.
Categories are assigned on load from entering averages among regular roster
bowlers: highest third A, middle third B, lowest third C (18 each for this
league). Equal averages use alphabetical names, then bowler ID. Substitutes
are excluded. Save league persists assignments; weekly results do not change
them. Category metadata does not change team membership.

### Exact individual formulas

- Average = sum of real scores / real games. Median uses the middle score, or
  the mean of the two middle scores. Standard deviation is the sample standard
  deviation (denominator games − 1); it is unavailable below two games.
- Improvement = average − recorded entering average. Improvement percentage
  = 100 × improvement / entering average, when entering average is positive.
  An unknown baseline remains unavailable. In historical views the baseline
  is the currently recorded entering average, not a prior-season estimate.
- Rating components are qualified-league percentiles for average (45%),
  consistency (20%), high game (10%), high three-game series (10%), low game
  (10%) and fraction of games strictly above own period average (5%).
  Percentile = 100 × (number lower + (number equal − 1)/2)/(qualified count − 1).
  A sole bowler gets 50. Missing three-game-series data gets a neutral 50 for
  that component. Category filtering does not recalculate league percentiles.
- For the consistency rating only, pooled variance = sum of each qualified
  bowler's (games − 1) × sample variance, divided by total degrees of freedom
  (fallback 900). Stabilized variance = ((games − 1) × bowler variance +
  12 × pooled variance)/(games − 1 + 12). Lower stabilized standard deviation
  gets a higher percentile. The displayed standard deviation remains raw.
- Weighted score = sum of component percentile × weight. Final Best Bowler
  Rating = 50 + games/(games + 18) × (weighted score − 50). All components
  and the final rating are bounded 0–100. Minimum games plus shrinkage limit
  small-sample awards; this is a transparent descriptive rating, not a fitted
  skill or forecast model. High/low records still depend on sample size.
- Game milestones count scores at least 200/225/250/275/300; series milestones
  count three-game sessions at least 600/650/700/750. Counts overlap.
- Last-3/5 averages cover real games in the last 3/5 league week numbers ending
  at the latest completed week (latest dated historical week in history mode).
  Missing appearances are not replaced with zero or earlier appearances.
  Windows show their actual sample counts; undated-week history has no recent
  window. Hot/cold = last-3 average − period average.
- Biggest weekly gain is the greatest signed increase between consecutive
  league weeks in the same season; absences are not bridged. Best rolling 3
  is the highest average of any three consecutive real games in that season,
  including across session boundaries. A 200+ streak counts consecutive real
  games; absences do not break the streak, but a real score below 200 does.
- Three-game series statistics use only sessions containing exactly three
  real games. Four-game historical sessions contribute to game stats but not
  series awards. Explicit blind, absent, vacant, simulated, invalid or
  inconsistent partial historical sessions are excluded in full. Existing
  untyped history sessions are treated as real, as in the original import
  contract; weekly individual scores must explicitly have type `actual`.

### Exact All-Play formulas

- Every eligible full week compares each team to every other team once. It
  reuses `matchPoints`: 2 per game, 3 per series; tied games award 1 each and
  tied series 1.5 each. Matchup W/L/T compares earned points with 4.5. Game
  and series records separately compare their respective pin totals.
- Maximum = 9 × eligible opponents × weeks; with 18 teams that is 153/week.
  Point percentage = earned / maximum. Rank uses point percentage then
  points; exact ties share competition rank (1, 1, 3). Team number only
  orders display within an exact tie. W-L-T sorts use wins + half of ties.
- Expected league points = sum of weekly all-play points / weekly opponent
  count. Schedule luck = actual points − expected points. Positive means
  favorable matchups; negative means unfavorable matchups.
- Standing difference = actual standing − all-play standing. Positive means
  better all-play performance than the actual standing suggests. Actual
  standing retains the app's points/team-average/team-number ordering.
- Strength of schedule = mean season all-play point percentage of actual
  opponents, counting repeat meetings. Higher means stronger opponents.
  This descriptive measure updates with later results and is not adjusted
  for circularity or intended as proof of luck.
- Only completed regular-season `results` are read. Simulation runs and
  future schedules never supply scores. Incomplete, duplicate or invalid
  team-score weeks are excluded in full and listed in a warning. All-Play's
  actual comparison uses the same eligible weeks; official standings remain
  unchanged. Recorded official team totals, including blind scores, count
  for All-Play even though blind scores do not count for individual Stats.
- Subs contribute to their own stats and the team identified in their weekly
  score entry. Regular team roster membership is not used to attribute stats.

The team weekly-odds page includes season and weekly All-Play results. Tables
support sorting, including points, percentage, standing difference and luck.
Debug report version 2 includes default and selected-filter Stats, normalized
rating components, weekly pair comparisons, season rollups, exact formulas,
and independent coverage, tie, reconciliation, attribution and bounds checks.
Existing debug fields and the full workspace snapshot remain available.

Run `node --test tests/*.test.mjs` and `node scripts/validate.mjs` to validate
the existing model, imports, substitute flow, analytics and rendered sections.

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

## GitHub Pages

The authored dist directory is tracked. The Pages workflow validates and deploys
only dist when app files change on main. It can also be run manually.

1. Open repository Settings → Pages.
2. Under Build and deployment, choose GitHub Actions as the Source.
3. Open Actions → Deploy league app to GitHub Pages → Run workflow (main).
4. Use the URL shown by the successful deployment:
   https://dsr119.github.io/ScratchLeagueAppV1Codex/

The HTML interface is public. Saved league workspaces remain in Supabase,
protected by the existing administrator policies. Do not commit scoring-history
files or league backups to this public repository.

To load the prepared private backup, sign in under Setup / rules, select Restore
backup, then Save league. Restore replaces the current draft; export it first
if it contains other changes. The JSON backup is not a Table Editor CSV import.


## Team weekly odds and diagnostics

Team weekly odds shows all 34 regular-season matchups, actual results for imported
weeks, and forecast win/tie probabilities and expected points for future weeks.
Winning a week means taking more than 4.5 of the nine available points. Position
round opponents are distributions across simulated standings; expanded rows show
conditional win probabilities for each possible opponent. Rerun older simulations
to populate weekly forecasts. Retained runs show changes in playoff and title odds
over time (up to 12 runs); they are not reconstructed historical forecasts.

Download debug report is available on Team weekly odds and Setup & rules. The JSON
contains the current league data, selected simulation and original inputs, seed,
ratings, import log, current error, and arithmetic/structural checks. It excludes
auth session storage and credentials. It includes personal scoring histories and
is intended to be shared privately for review, never committed to this repository.
Passing checks do not establish statistical calibration or server health.


### Actual-season audit (debug report v3)

`actual-season.js` is the canonical actual scoring API:
`getCurrentSeasonSessions(state, bowlerId)` reads only actual three-game player
entries from `state.results`, sorted by week. It preserves weekly team, scores
and series total. `getCurrentSeasonStats` derives total pins, average, all
scoring records, milestones, distributions and trends from those sessions.
Neither function imports the model or reads historical scores. Duplicate or
malformed actual sessions block aggregation with an explicit error, rather
than silently omitting or double-counting real games. Blind/absent entries are
excluded. Historical statistics use the separate `getHistoricalSessions` route.
The model's `profile()` and future simulations are unchanged.

The required Doug Smith and Robert Lane three-week fixtures assert 2065 and
2128 total pins, averages 229.444444 and 236.444444, and high series 704 and 757.
Tests verify history, entering averages, simulated output and display-name
changes cannot affect actual scoring results.

`commitWeeklyImport` validates first and returns an entirely new workspace only
when all teams/player rows pass. The original state remains untouched on error.
The existing Supabase RPC writes the whole workspace in one transaction.
Saving now reads the workspace back and compares the entire state and revision
before confirming success. A failure after sending a save requires reloading;
it does not mean the server necessarily rejected the write.

Debug v3 adds `actualSeasonPlayerStats`, with canonical bowler IDs, total pins,
low/high series and `weeklySessions`; `week3Audit`; `categoryAudit`; and
`workspacePersistence`, which identifies whether a server read occurred in the
current browser session. A local audit or preview is never proof of persistence.
The scoring audit checks row counts, identities, duplicates, team-game sums,
averages, high series, blind exclusion and independence from model/history.

A/B/C rankings are disabled until all regular players have valid categories.
Per the league owner's updated instruction, categories are derived from entering
averages in equal thirds, not historical draft labels. The assignment method,
entering averages and assigned categories are included in workspace debug data.
The September 9 snapshot contains only Weeks 1–2; this describes the supplied
snapshot, not the current live database. Importing Week 3 and saving the league
is required to persist those scores in the user's workspace.
