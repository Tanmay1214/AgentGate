import {test} from 'node:test';
import assert from 'node:assert/strict';
import {queueRows} from '../public/refund-grid.js';
test('review queues separate human approvals, unresolved outcomes and policy denials',()=>{
 const rows=['approval','executing','pending','unknown','denied','completed','failed'].map(status=>({status}));
 assert.deepEqual(queueRows(rows,'approval').map(r=>r.status),['approval']);
 assert.deepEqual(queueRows(rows,'uncertain').map(r=>r.status),['executing','pending','unknown']);
 assert.deepEqual(queueRows(rows,'blocked').map(r=>r.status),['denied']);
 assert.equal(queueRows(rows,'all').length,7);assert.equal(rows.length,7);
});
