import { randomUUID } from "node:crypto";
import type { NexoDatabase } from "../database/db.js";

/** Local-only operational metrics; values never contain user content or tool payloads. */
export class LocalMetricsService {
  constructor(private db: NexoDatabase) {}
  record(metric: string, value: number, tags: Record<string,string|number|boolean> = {}) {
    this.db.run("INSERT INTO local_metrics(id,metric,value,tags_json,created_at) VALUES(?,?,?,?,?)", [randomUUID(), metric, value, JSON.stringify(tags), new Date().toISOString()]);
  }
  snapshot() {
    const rows=this.db.all<{metric:string;count:number;average:number;latest:string}>("SELECT metric,COUNT(*) AS count,AVG(value) AS average,MAX(created_at) AS latest FROM local_metrics GROUP BY metric ORDER BY metric");
    return rows.map(row=>({metric:row.metric,count:Number(row.count),average:Math.round(Number(row.average)*100)/100,latest:row.latest}));
  }
}
