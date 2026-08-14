CREATE TYPE "public"."round_outcome" AS ENUM('win', 'lose', 'draw');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('active', 'won', 'lost', 'abandoned');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid,
	"run_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"best_wins" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"run_id" uuid NOT NULL,
	"nonce" integer NOT NULL,
	"player_hand" smallint NOT NULL,
	"server_hand" smallint NOT NULL,
	"outcome" "round_outcome" NOT NULL,
	"request_id" text,
	"server_ts" timestamp with time zone DEFAULT now() NOT NULL,
	"latency_ms" integer,
	CONSTRAINT "rounds_run_id_nonce_pk" PRIMARY KEY("run_id","nonce")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_code" text NOT NULL,
	"player_id" uuid NOT NULL,
	"server_seed" text NOT NULL,
	"commitment" text NOT NULL,
	"client_seed" text NOT NULL,
	"status" "run_status" DEFAULT 'active' NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"next_nonce" integer DEFAULT 0 NOT NULL,
	"target_wins" integer NOT NULL,
	"max_rounds" integer NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "runs_run_code_unique" UNIQUE("run_code")
);
--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_run_idx" ON "audit_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "audit_player_created_idx" ON "audit_events" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_player_created_idx" ON "runs" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_status_ended_idx" ON "runs" USING btree ("status","ended_at");