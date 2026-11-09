import test from 'node:test';
import assert from 'node:assert/strict';
import {store} from '../lib/store.mjs';
test('draft balance includes in-flight reservations and completed refunds across days',()=>{const s=store(':memory:');s.run('INSERT INTO captures VALUES (?,?,?,?,?)','CAPTURE',3000,'USD',1,'Synthetic');const r=s.propose({capture:'CAPTURE',amount:500,idem:'remaining-check',note:'Synthetic partial refund'});assert.equal(s.remaining('CAPTURE'),2500);s.settle(r.id,'completed','REFUND');s.run("UPDATE requests SET day='2020-01-01' WHERE id=?",r.id);assert.equal(s.remaining('CAPTURE'),2500);assert.equal(s.remaining('MISSING'),null);s.db.close();});
