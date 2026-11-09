import test from 'node:test';
import assert from 'node:assert/strict';
import {createDraftState} from '../public/draft-state.js';
test('editing input cancels and invalidates an in-flight response',()=>{const s=createDraftState();const a=s.begin();s.invalidate();assert.equal(a.signal.aborted,true);assert.equal(s.current(a),false);assert.equal(s.busy,false);});
test('closing then reopening cannot accept an earlier draft',()=>{const s=createDraftState();const a=s.begin();s.invalidate();const b=s.begin();assert.equal(s.current(a),false);assert.equal(s.current(b),true);s.finish(a);assert.equal(s.busy,true);s.finish(b);assert.equal(s.busy,false);});
test('starting again aborts the earlier request',()=>{const s=createDraftState();const a=s.begin();const b=s.begin();assert.equal(a.signal.aborted,true);assert.equal(s.current(b),true);});
