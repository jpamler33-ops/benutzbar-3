import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.OS_E2E_DB ??= join(mkdtempSync(join(tmpdir(),'opportunity-e2e-')),'db.sqlite');
import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',fullyParallel:false,workers:1,use:{baseURL:'http://127.0.0.1:3101',headless:true},webServer:{command:'npm start',url:'http://127.0.0.1:3101/api/health',reuseExistingServer:false,env:{PORT:'3101',ADMIN_TOKEN:'browser-test-token-at-least-24-chars',SCANS_ENABLED:'false',DATABASE_PATH:process.env.OS_E2E_DB!,NODE_ENV:'production'}},projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}]});
