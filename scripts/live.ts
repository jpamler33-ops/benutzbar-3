import { EnvHttpProxyAgent,setGlobalDispatcher } from 'undici';
import { TedAdapter,buildQuery } from '../server/ted.ts';
import { defaults } from '../server/model.ts';
import { Store } from '../server/db.ts';
import { Scanner } from '../server/scanner.ts';
if(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)setGlobalDispatcher(new EnvHttpProxyAgent());
const db=new Store(process.env.DATABASE_PATH??'data/live-verification.sqlite');
try {console.log('Query:',buildQuery(defaults));const scanner=new Scanner(db,new TedAdapter());const first=await scanner.scan();const count=db.list().length;const second=await scanner.scan();if(db.list().length!==count)throw new Error('Unerwartete Änderung der Trefferzahl zwischen Scans; prüfen');if(second.inserted!==0)throw new Error('Duplikatprüfung fehlgeschlagen');console.log(JSON.stringify({verifiedAt:new Date().toISOString(),source:'TED official Search API',first,second,persisted:count,regional:db.list().filter(o=>o.assessment.regionMatch).length,sample:db.list().slice(0,3).map(o=>({id:o.sourceId,title:o.title,url:o.url}))},null,2));}finally{db.close();}
