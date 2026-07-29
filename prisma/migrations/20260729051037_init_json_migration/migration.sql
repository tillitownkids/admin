-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL DEFAULT '',
    "ideaBrief" TEXT NOT NULL DEFAULT '',
    "characters" TEXT NOT NULL DEFAULT '',
    "episode_number" TEXT NOT NULL,
    "generation_type" TEXT NOT NULL DEFAULT 'new',
    "mode" TEXT NOT NULL DEFAULT 'single',
    "content" TEXT NOT NULL,
    "generated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Script" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL DEFAULT '',
    "episode_number" TEXT NOT NULL,
    "generation_type" TEXT NOT NULL DEFAULT 'new',
    "mode" TEXT NOT NULL DEFAULT 'single',
    "content" TEXT NOT NULL DEFAULT '{}',
    "generated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "storyId" TEXT,
    CONSTRAINT "Script_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
