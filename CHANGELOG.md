# Mail-Zero Changelog

## [1.0.1] - 2026-03-06
### Added
- **Google Workspace Integration (Calendar & Tasks):** Parsed raw text outputs from `google-workspace-mcp` into rich JSON so the frontend correctly renders upcoming events with dates/links and allows for one-click Task creation directly from email threads.
- **Google Contacts Sync:** Added `searchContacts` tRPC endpoint which securely queries the Google Workspace MCP for matches and merges results dynamically into the "To/CC/BCC" autocomplete dropdown.
- **Nginx Proxies:** Built out custom routing configurations for `/oauth2callback` blocks on both `lair404` and `n1njanode` reverse proxies to redirect Google OAuth consent flow to internal port 5009 where the workspace MCP listener expects it.

### Changed
- **Styling updates:** Updated the frontend UI navigation to visually highlight the connected Google Workspace user in an orange border with an orange checkmark for simple differentiation from other integrations.
- **Environment variables structure:** Moved from inline replacement in startup scripts (`REPLACE-BACKEND-URL`) to proper Next.js / Vite build-time environment variable declarations (`VITE_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_APP_URL`) in `docker-compose.n1njanode.yaml`.
- **Database passwords:** Corrected issue where the `n1njanode` database required manual password reset via `ALTER ROLE` instead of utilizing the `POSTGRES_PASSWORD` env logic.
- **MCP Transport configurations:** Shifted the `mail-zero-mcp` to use the `stdio` transport instead of `sse` for direct CLI integration via SSH bridging from local Gemini setups.

### Fixed
- Fixed the `invalid_client` OAuth error where placeholder variables weren't replaced in `.env.n1njanode`.
- Fixed the 500 Authentication Server Error triggered by `mailzero` user credential mismatch after redeploy.
- Repaired `mail-zero-fork/deploy-n1njanode.sh` workflow logic to ensure new local build customizations successfully propagate instead of pulling generic images from GHCR.
