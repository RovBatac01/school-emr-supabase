$ErrorActionPreference = "Stop"
if (-not (Test-Path "client/.env")) { throw "Copy client/.env.example to client/.env and add the Supabase URL and anon key." }
if (-not (Test-Path "client/node_modules")) { npm --prefix client install }
npm --prefix client run dev
