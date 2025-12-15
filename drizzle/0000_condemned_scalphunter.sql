CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" text,
	"username" text NOT NULL,
	"email" text,
	"avatar_url" text,
	"role" text DEFAULT 'user',
	"api_key_hash" text,
	"api_key_prefix" text,
	"api_key_created_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id"),
	CONSTRAINT "users_api_key_prefix_unique" UNIQUE("api_key_prefix")
);
