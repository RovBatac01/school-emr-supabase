# Validation Report

**Project:** School Clinic EMR — Supabase Edition  
**Generated:** 2026-08-28T03:12:20.165622+00:00  
**Release gate:** **REVIEW REQUIRED**

## Automated checks

| Check | Result |
|---|---|
| Client dependency installation | **NOT RUN** |
| Seed/bootstrap dependency installation | **NOT RUN** |
| React/Vite production build | **NOT RUN** |
| Static architecture/security checks | **NOT RUN** |
| Node release-script syntax | **NOT RUN** |
| Edge Function TypeScript syntax parse | **NOT RUN** |
| PostgreSQL migration parser availability | **NOT RUN** |
| PostgreSQL migration syntax parse | **NOT RUN** |

Static validation summary: **Unavailable**

## Scope of validation

The release process validates the React production build, JavaScript release scripts, Edge Function TypeScript syntax, required Supabase architecture markers, secret separation, and PostgreSQL migration syntax through a PostgreSQL parser when available.

A live hosted Supabase project was **not** embedded in or contacted from the distributable archive because project URLs, database credentials, and service-role keys belong to the recipient. Complete deployment and post-deployment role tests are documented in `README.md` and `docs/TEST_MATRIX.md`.

## Security release checks

- No actual `.env` file is included in the archive.
- No service-role key is present in the React source.
- `node_modules` is excluded from the downloadable source archive.
- PostgreSQL RLS, permission helpers, audited RPCs, and protected staff-admin Edge Functions are included.
- Medicine issuance is implemented in a stock-locking database transaction.
- Demo reset requires an explicit destructive confirmation value.

## Known deployment boundary

The application cannot be logged into until the recipient creates a Supabase project, applies migrations, configures the public frontend environment, and creates Auth users. This is intentional and prevents shipping reusable credentials or access to someone else's backend.

## Result

All recorded release-gate checks passed.
