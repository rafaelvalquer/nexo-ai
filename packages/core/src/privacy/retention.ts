import type { NexoDatabase } from "../database/db.js";
import type { DocumentService } from "../documents/service.js";

/** Applies only the user-selected local retention horizon. Never touches active work. */
export class RetentionService {
  constructor(private db:NexoDatabase, private documents:DocumentService) {}
  purge(days:number) {
    const normalized=Math.max(1,Math.min(3650,Math.floor(days)||30)); const cutoff=new Date(Date.now()-normalized*86_400_000).toISOString();
    return this.db.transaction(() => {
      this.db.run("DELETE FROM message_presentations WHERE message_id IN (SELECT id FROM messages WHERE created_at < ?)",[cutoff]);
      this.db.run("DELETE FROM chat_resource_actions WHERE message_id IN (SELECT id FROM messages WHERE created_at < ?)",[cutoff]);
      this.db.run("DELETE FROM messages WHERE created_at < ?",[cutoff]);
      this.db.run("DELETE FROM audit_logs WHERE created_at < ?",[cutoff]);
      this.db.run("DELETE FROM local_metrics WHERE created_at < ?",[cutoff]);
      this.db.run("DELETE FROM tasks WHERE finished_at IS NOT NULL AND finished_at < ?",[cutoff]);
      const documents=this.documents.purgeOlderThan(cutoff);
      return {cutoff,documents};
    });
  }
}
