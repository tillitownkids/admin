/*
  Warnings:

  - You are about to drop the column `characters` on the `Story` table. All the data in the column will be lost.
  - You are about to drop the column `ideaBrief` on the `Story` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Story" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL DEFAULT '',
    "concept" TEXT NOT NULL DEFAULT '',
    "storyOverview" TEXT NOT NULL DEFAULT '',
    "teachLesson" TEXT NOT NULL DEFAULT '',
    "episode_number" TEXT NOT NULL,
    "generation_type" TEXT NOT NULL DEFAULT 'new',
    "mode" TEXT NOT NULL DEFAULT 'single',
    "content" TEXT NOT NULL,
    "generated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL
);
INSERT INTO "new_Story" ("content", "episode_number", "generated_at", "generation_type", "id", "mode", "status", "topic") SELECT "content", "episode_number", "generated_at", "generation_type", "id", "mode", "status", "topic" FROM "Story";
DROP TABLE "Story";
ALTER TABLE "new_Story" RENAME TO "Story";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
