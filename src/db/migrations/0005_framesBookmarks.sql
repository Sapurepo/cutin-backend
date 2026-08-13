CREATE TABLE "bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "frames" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"background" text NOT NULL,
	"foreground" text NOT NULL,
	"padding" double precision NOT NULL,
	"gutter" double precision NOT NULL,
	"cell_radius" double precision NOT NULL,
	"footer" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "frames_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "frame_id" uuid;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookmarks_post_user_idx" ON "bookmarks" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "bookmarks_user_created_at_idx" ON "bookmarks" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_frame_id_frames_id_fk" FOREIGN KEY ("frame_id") REFERENCES "public"."frames"("id") ON DELETE no action ON UPDATE no action;