# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A small internal team (two or three people) who make TilliTown episodes. They know the production pipeline, work at a desktop, and take an episode from idea to a published video themselves.

## Product Purpose

TilliTown Admin is the team's production tool and place of record for the "Tilli & Jaksh" animated children's series. It takes one episode through story, beat script, sequences (storyboard and clip each), a stitched episode and YouTube publishing. Claude writes most of the text through the admin's MCP server; the admin keeps it, shows it, and can generate too. Success is an episode produced end to end without re-learning the process, with characters and locations staying consistent across shots.

## Operating Context

- An episode is the unit of work. It moves through five steps in order: Story, Assets, Script, Sequences, Publish.
- A sequence ("SEQ 07") is one 2x2 storyboard and one clip, holding up to 4 beats. Each has its own page with its beats, storyboard and clip takes, issues and notes, and the history of its prompts.
- Characters and locations are a shared library reused across episodes; each has a reference sheet that keeps its look consistent.
- Generation is paid and slow: images and video run through Magnific (the admin's n8n workflows, or Claude's Magnific connector with takes recorded in the admin), text through an AI model chosen in settings or through Claude. Runs take from seconds to minutes and spend credits.
- The team follows a written production playbook (one action per shot, 2x2 storyboard grids, short clips, unhurried dialogue). The tool's process should match it.

## Capabilities and Constraints

- Generate and edit a story, a beat script, storyboard prompts and images, per-shot video clips; stitch clips into an episode; publish to YouTube.
- Manage the character and location libraries, including generated reference sheets.
- Global settings: target audience, tone, AI model. Credit balance is read from the generation provider.
- All routes require sign-in (Supabase auth).
- Terminology: episode, story, script, beat, sequence (stored as Scene rows), shot, clip, take, storyboard, reference sheet, issue.
- Not built: narration, upscaling, a QA checklist, recap and Story Bible continuity.

## Brand Commitments

- Product name: TilliTown Admin. Series name: Tilli & Jaksh.
- Existing interface identity to preserve: dark neutral surfaces with a single green accent, Inter, shadcn components.

## Evidence on Hand

- Real episodes, scripts, scenes, clips and library entries exist in the production database.
- The production playbook lives outside the repo (the owner's `playbook.md`).

## Product Principles

1. The episode is the unit of work: the tool always knows which episode you are in and what comes next.
2. One primary action per screen; reference material stays out of the way until asked for.
3. Paid or destructive actions say what they will do and how much before they run.
4. Consistency of characters and locations outranks speed.
5. The tool follows the team's playbook rather than inventing its own process.
