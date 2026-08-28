$ErrorActionPreference = "Stop"
Write-Host "School Clinic EMR - Supabase deployment" -ForegroundColor Cyan
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw "Supabase CLI was not found. Install it with: npm install -g supabase"
}
if (-not (Test-Path ".env")) { throw "Copy .env.example to .env and add your Supabase project keys first." }
if (-not (Test-Path "client/.env")) { throw "Copy client/.env.example to client/.env and add the URL and anon key first." }
Write-Host "Linking/pushing database migrations..." -ForegroundColor Yellow
Write-Host "Run 'supabase link --project-ref YOUR_PROJECT_REF' when prompted if the project is not linked." -ForegroundColor DarkYellow
supabase db push
Write-Host "Deploying Edge Functions..." -ForegroundColor Yellow
supabase functions deploy username-login --no-verify-jwt
supabase functions deploy admin-create-user
supabase functions deploy admin-update-user
supabase functions deploy admin-reset-password
Write-Host "Install script dependencies and bootstrap fictional development users:" -ForegroundColor Yellow
npm --prefix scripts install
npm run bootstrap
npm run seed
Write-Host "Supabase backend deployment completed." -ForegroundColor Green
