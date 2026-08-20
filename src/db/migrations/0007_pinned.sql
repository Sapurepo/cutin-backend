ALTER TABLE "posts" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- 이 컬럼 이전에는 "대표 컷을 고른 것"이 곧 고정이었다(클라이언트 표시 규칙). 이미 발행된 포스트가 보이던 대로 남도록 옮긴다.
UPDATE "posts" SET "pinned" = true WHERE "thumbnail_cut_index" <> 0;
