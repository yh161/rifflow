-- Add isDirect flag to ChatRoom for 1v1 direct message rooms
ALTER TABLE "ChatRoom" ADD COLUMN "isDirect" BOOLEAN NOT NULL DEFAULT false;
