# Scratch League App

Foundation for the Upstate Amusements Scratch Classic prediction app.

## Status

Database migration and confirmed rules prepared. Application, authentication,
CSV import UI, and prediction engine are not implemented yet. No predictions
have been generated. Player history and completed results are still needed.

## Supabase setup

1. Open the project's SQL Editor.
2. Run `supabase/migrations/001_foundation.sql` once.
3. Run `supabase/migrations/002_seed_league.sql` once.

Both scripts use transactions. Tables start with row-level security enabled
and no client access; application permissions will be added alongside login.
The publishable key in `.env.example` is intentionally public. Never commit a
secret key, service-role key, or database password.

## Identity and data

Team numbers are unique within a season. Names can change without changing
the team identity. Bowlers have permanent IDs, independent of team assignments.
Joe Renaldi is a substitute; Team 17's regulars are Bianchi, Edwards, and Lyon.
The duplicate Team 0 Mark Edwards entry is not seeded as another person;
its identity should be confirmed before importing substitute history. Placeholder 120/0 substitute averages
are not treated as skill estimates. A/B/C assignments remain unknown.

The uploaded schedule lists weeks 37–39 as roll-offs; those dates are retained
as unconfirmed, not assumed to be actual championship matches. The championship
date remains unknown. Confirmed rules are in `config/league-rules.json`.

## Next implementation

Build authenticated administration and read policies, import preview and
duplicate handling, authoritative standings, and a tested simulation engine.
Manual skill scenarios must not overwrite observed scoring history. Save the
model version, inputs, iteration count, and random seed with every run.
Before marking a matchup complete, validate both teams, score counts, and
that each team appears only once in that week's regular-season matchups.
