import { DatabaseSync,backup } from 'node:sqlite';
import { resolve } from 'node:path';
import { mkdirSync,existsSync } from 'node:fs';
const source=process.env.DATABASE_PATH??'data/opportunity.sqlite';
const destination=process.argv[2];
if(!destination)throw new Error('Ziel angeben: node --env-file=.env --import tsx scripts/backup.ts backups/opportunity.sqlite');
if(!existsSync(source))throw new Error('Quelldatenbank fehlt');
if(existsSync(destination))throw new Error('Backupziel existiert bereits; keine Überschreibung');
if(resolve(source)===resolve(destination))throw new Error('Backupziel muss sich von der Quelle unterscheiden');
mkdirSync(resolve(destination,'..'),{recursive:true});
const db=new DatabaseSync(source,{readOnly:true});
try {await backup(db,destination);console.log(`Konsistentes SQLite-Backup erstellt: ${destination}`);}finally{db.close();}
