# TilliTown Admin MCP server

Lets Claude (claude.ai, Claude Desktop, Claude Code) read episodes and write their stories, beat
scripts, sequences, prompts, takes and issue notes straight into the admin, which keeps the record.
You write and review with Claude; the team sees and fixes everything on each sequence's page.

Endpoint: `https://<admin-domain>/api/mcp` (code in `src/lib/mcp/`, route in `src/app/api/mcp/`).

## Setup

1. Run `supabase/migrations/20261102000000_sequence_workspace.sql` in the Supabase SQL editor once.
   It adds issue notes and prompt history; without it those tools report that it is not set up.
2. Make a long random token, for example `openssl rand -hex 32`.
3. Set it as `MCP_ACCESS_TOKEN` in the Vercel project's environment variables (and `.env` for local
   use), then redeploy. Without it the endpoint answers 503 and stays off.
4. Connect Claude:
   - **claude.ai / Claude Desktop:** Settings → Connectors → Add custom connector. URL:
     `https://<admin-domain>/api/mcp/<token>`. Leave the OAuth fields empty. If your plan shows a
     "Request headers" section, you can instead use `https://<admin-domain>/api/mcp` with the header
     `Authorization: Bearer <token>`, which keeps the token out of the URL.
   - **Claude Code:** `claude mcp add --transport http tillitown https://<admin-domain>/api/mcp --header "Authorization: Bearer <token>"`

Anyone with the token can change episodes in the production database, so share it only with the
team. To revoke it, change `MCP_ACCESS_TOKEN` and redeploy, then update the connector URL.

## Tools

A sequence is one 2x2 storyboard and one clip (a `Scene` row), holding up to 4 beats.

| Tool | What it does |
| --- | --- |
| `get_production_guide` | Formats and playbook rules (story, beat script, storyboard prompt template, shot directions, review loop, locked series facts), with the audience and tone from Settings. Claude reads it before writing. |
| `list_episodes` | Episodes with their current step and status. |
| `get_episode` | Story, linked assets with descriptions, the script with per-beat timing, and the sequences with prompts and open issues. |
| `get_sequence` | One sequence: beats, storyboard prompt and takes, clip prompt and takes, issues and notes, recent history. |
| `list_library` | Characters, locations and objects with exact names, descriptions and sheet status. |
| `create_library_item` | Adds a character, location or object (no duplicates by name); optionally links it to an episode. |
| `create_episode` | New episode from a markdown story, with its assets linked by exact name. |
| `update_story` | Replaces the story text or topic. |
| `link_episode_assets` | Adds characters, locations, objects to an episode. |
| `save_script` | Saves the beat script after checking it parses (numbered beats, ACTION, CAMERA) and flags beats over 8 s. Overwriting needs `replace_existing: true`. |
| `save_storyboard` | Saves the sequences and their 2x2 image prompts. Beat text is copied from the saved script with `[DURATION]` lines, as the admin's planner does. Replacing existing sequences deletes their images, clips, issues and history and needs `replace_existing: true`. |
| `update_sequence` | Edits one sequence's title, image prompt, beats (kept in sync with the script), cast or objects. |
| `save_video_plan` | Saves one sequence's lighting and per-beat camera, action and placement; the server adds dialogue and timing and builds the clip prompt (`src/lib/sceneShots.ts`). |
| `add_sequence_note` / `resolve_sequence_note` | Records an issue or note on a sequence; resolves or reopens an issue. |
| `record_storyboard_take` / `record_clip_take` | Saves an image or clip made outside the admin (e.g. with the Magnific connector) as a take, copied to the admin's storage. Pass the Magnific identifier so the admin can generate clips from the storyboard. |
| `restore_prompt_version` | Puts back an earlier version of beats, storyboard prompt or clip prompt; the current text stays in history. |

Every text Claude saves is recorded in the sequence's history as written by Claude. Not available
through MCP: generating sheets, stitching and publishing (do those in the admin). The character
check that runs after the admin plans a storyboard does not run after `save_storyboard`; Claude sets
each sequence's cast itself.
