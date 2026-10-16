import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { defaults, type Notice, type Opportunity, type Settings } from './model.ts';
import { migrateMarkets } from './markets.ts';
import { assess } from './scoring.ts';
export const utc=()=>new Date().toISOString();
export class Store {db:DatabaseSync;constructor(path:string){if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});this.db=new DatabaseSync(path);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');this.migrate();migrateMarkets(this);}
 migrate(){this.db.exec(`BEGIN IMMEDIATE;
 CREATE TABLE IF NOT EXISTS Migrations(version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS Sources(id TEXT PRIMARY KEY,name TEXT NOT NULL,state TEXT NOT NULL,lastSuccess TEXT,lastError TEXT);
 CREATE TABLE IF NOT EXISTS Opportunities(id INTEGER PRIMARY KEY,source TEXT NOT NULL REFERENCES Sources(id),sourceId TEXT NOT NULL,payload TEXT NOT NULL,hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'NEU' CHECK(status IN ('NEU','PRÜFEN','INTERESSANT','KONTAKTIERT','GEWONNEN','VERLOREN')),saved INTEGER NOT NULL DEFAULT 0,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL,UNIQUE(source,sourceId));
 CREATE TABLE IF NOT EXISTS ScanRuns(id INTEGER PRIMARY KEY,source TEXT NOT NULL REFERENCES Sources(id),startedAt TEXT NOT NULL,finishedAt TEXT,state TEXT NOT NULL,found INTEGER NOT NULL DEFAULT 0,inserted INTEGER NOT NULL DEFAULT 0,changed INTEGER NOT NULL DEFAULT 0,error TEXT,query TEXT);
 CREATE TABLE IF NOT EXISTS OpportunityUpdates(id INTEGER PRIMARY KEY,opportunityId INTEGER NOT NULL REFERENCES Opportunities(id),createdAt TEXT NOT NULL,kind TEXT NOT NULL,before TEXT NOT NULL,after TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS UserNotes(id INTEGER PRIMARY KEY,opportunityId INTEGER NOT NULL REFERENCES Opportunities(id),body TEXT NOT NULL,createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS Settings(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS ScanLock(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT,expiresAt TEXT);
 INSERT OR IGNORE INTO Sources(id,name,state) VALUES('ted','TED · Europäische Union','NICHT VERFÜGBAR');
 INSERT OR IGNORE INTO Sources(id,name,state) VALUES('bekanntmachung','Bekanntmachungsservice DE · geprüft, noch nicht integriert','NICHT VERFÜGBAR');
 INSERT OR IGNORE INTO ScanLock(id) VALUES(1);
 INSERT OR IGNORE INTO Migrations VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
 COMMIT;`);this.db.prepare('INSERT OR IGNORE INTO Settings VALUES(1,?)').run(JSON.stringify(defaults));if(!this.db.prepare('SELECT version FROM Migrations WHERE version=2').get()){this.db.exec("BEGIN IMMEDIATE; UPDATE Settings SET payload=json_remove(payload,'$.minScore') WHERE id=1; INSERT INTO Migrations VALUES(2,strftime('%Y-%m-%dT%H:%M:%fZ','now')); COMMIT;");}}
 settings():Settings{return JSON.parse((this.db.prepare('SELECT payload FROM Settings WHERE id=1').get() as {payload:string}).payload);}
 setSettings(s:Settings){this.db.prepare('UPDATE Settings SET payload=? WHERE id=1').run(JSON.stringify(s));}
 acquire(owner:string){return this.db.prepare('UPDATE ScanLock SET owner=?,expiresAt=? WHERE id=1 AND (owner IS NULL OR expiresAt<?)').run(owner,new Date(Date.now()+120000).toISOString(),utc()).changes===1;}
 renew(owner:string){if(this.db.prepare('UPDATE ScanLock SET expiresAt=? WHERE owner=?').run(new Date(Date.now()+120000).toISOString(),owner).changes!==1)throw new Error('Scan-Sperre verloren');}
 release(owner:string){this.db.prepare('UPDATE ScanLock SET owner=NULL,expiresAt=NULL WHERE owner=?').run(owner);}
 upsert(n:Notice){const payload=JSON.stringify(n);const hash=createHash('sha256').update(payload).digest('hex');this.db.exec('BEGIN IMMEDIATE');try {const old=this.db.prepare('SELECT id,hash,payload FROM Opportunities WHERE source=? AND sourceId=?').get(n.source,n.sourceId) as {id:number;hash:string;payload:string}|undefined;let state='unchanged';if(!old){this.db.prepare('INSERT INTO Opportunities(source,sourceId,payload,hash,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').run(n.source,n.sourceId,payload,hash,utc(),utc());state='inserted';}else if(old.hash!==hash){this.db.prepare('INSERT INTO OpportunityUpdates(opportunityId,createdAt,kind,before,after) VALUES(?,?,?,?,?)').run(old.id,utc(),'source',old.payload,payload);this.db.prepare('UPDATE Opportunities SET payload=?,hash=?,updatedAt=? WHERE id=?').run(payload,hash,utc(),old.id);state='changed';}this.db.exec('COMMIT');return state;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 list():Opportunity[]{const settings=this.settings();return (this.db.prepare('SELECT * FROM Opportunities ORDER BY createdAt DESC,id DESC').all() as unknown as {id:number;payload:string;status:Opportunity['status'];saved:number;createdAt:string;updatedAt:string}[]).map(r=>{const n=JSON.parse(r.payload) as Notice;return {...n,dataKind:n.dataKind??'LIVE-DATEN',id:r.id,status:r.status,saved:!!r.saved,createdAt:r.createdAt,updatedAt:r.updatedAt,assessment:assess(n,settings)};}).sort((a,b)=>(b.published??'').localeCompare(a.published??'')||b.id-a.id);}
 update(id:number,patch:{status?:string;saved?:boolean}){this.db.exec('BEGIN IMMEDIATE');try{const old=this.db.prepare('SELECT status,saved FROM Opportunities WHERE id=?').get(id);if(!old){this.db.exec('ROLLBACK');return false;}this.db.prepare('UPDATE Opportunities SET status=COALESCE(?,status),saved=COALESCE(?,saved),updatedAt=? WHERE id=?').run(patch.status??null,patch.saved===undefined?null:Number(patch.saved),utc(),id);this.db.prepare('INSERT INTO OpportunityUpdates(opportunityId,createdAt,kind,before,after) VALUES(?,?,?,?,?)').run(id,utc(),'workflow',JSON.stringify(old),JSON.stringify(patch));this.db.exec('COMMIT');return true;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 notes(id:number){return this.db.prepare('SELECT * FROM UserNotes WHERE opportunityId=? ORDER BY id DESC').all(id);}
 history(id:number){return this.db.prepare('SELECT id,createdAt,kind FROM OpportunityUpdates WHERE opportunityId=? ORDER BY id DESC').all(id);}
 addNote(id:number,body:string){this.db.prepare('INSERT INTO UserNotes(opportunityId,body,createdAt) VALUES(?,?,?)').run(id,body,utc());}
 sources(){return this.db.prepare('SELECT * FROM Sources').all();}
 runs(){return this.db.prepare('SELECT * FROM ScanRuns ORDER BY id DESC LIMIT 30').all();}
 close(){this.db.close();}}
