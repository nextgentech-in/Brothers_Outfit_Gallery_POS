import { readFile } from 'node:fs/promises';
import { firebase } from '../server/firebase.js';
import { decodeBackup,validateBackup } from '../server/backup.js';
const file=process.argv[2],confirmed=process.argv[3];
if(!file||!confirmed){console.error('Usage: npm run backup:restore -- backup.json EXACT_TARGET_PROJECT_ID');process.exit(1);}
const backup=validateBackup(JSON.parse(await readFile(file,'utf8'))),{db,projectId}=firebase();
if(projectId!==confirmed)throw new Error('Target project confirmation does not match configured Firebase project.');
// Refuse any overwrite, including unrelated collections. Restore first into an isolated empty project.
for(const collection of await db.listCollections())if(!(await collection.limit(1).get()).empty)throw new Error(`Target project is not empty (${collection.id}). Restore refused.`);
let batch=db.batch(),count=0,total=0;
for(const [collection,rows]of Object.entries(backup.collections))for(const row of rows){batch.create(db.collection(collection).doc(row.id),decodeBackup(row.data));count++;total++;if(count===400){await batch.commit();batch=db.batch();count=0;}}
if(count)await batch.commit();console.log(`Restored ${total} business documents to ${projectId}. Verify balances and stock before using this project.`);
