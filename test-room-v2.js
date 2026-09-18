'use strict';const assert=require('assert'),Rooms=require('./room-v2');
let now=Date.now(),R=new Rooms({ttl:100,rng:()=>.99}),a=R.create('A','u1'),b=R.join(a.code,'B','u2');assert.notEqual(a.token,b.token);assert.throws(()=>R.resume(a.code,'bad'),/invalid/);R.start(a.code,0);assert.throws(()=>R.start(a.code,1),/host/);assert.throws(()=>R.act(a.code,1,{kind:'roll'}),/out of turn/);let e=R.act(a.code,0,{kind:'roll'});assert.equal(e.state.dice,6);assert.throws(()=>R.act(a.code,0,{kind:'pick',idx:9}),/illegal/);R.act(a.code,0,{kind:'pick',idx:0});
R.leave(a.code,0);assert.equal(R.resume(a.code,a.token).seat,0);assert.throws(()=>R.react(a.code,1,'💣'),/reaction/);assert.deepEqual(R.react(a.code,1,'👏'),{seat:1,emoji:'👏'});assert.equal(R.mute(a.code,1,true),true);
// force valid completed state then server declares result once
let room=R.get(a.code);room.game.tokens.red=[56,56,56,55];room.game.turn=0;room.game.dice=null;room.game.awaiting=false;R.rng=()=>.01;e=R.act(a.code,0,{kind:'roll'});e=R.act(a.code,0,{kind:'pick',idx:3});assert(e.resultId);let id=e.resultId;assert.equal(R.rematch(a.code,0).ready,false);let m=R.rematch(a.code,1);assert(m.ready);assert.equal(room.resultId,null);assert.equal(room.game.over,false);
let c=R.create('C'),d=R.join(c.code,'D');R.leave(c.code,0);R.leave(c.code,1);R.reap(Date.now()+101);assert.throws(()=>R.get(c.code),/unavailable/);

// Terminal roll events retain the authoritative face and actor after turn advance.
let nr=R.create('NoMove'),nj=R.join(nr.code,'Other');R.start(nr.code,0);R.rng=()=>.2;let terminal=R.act(nr.code,0,{kind:'roll'});assert.equal(terminal.type,'no-move');assert.equal(terminal.rolled,2);assert.equal(terminal.actor,0);assert.equal(terminal.state.turn,1);assert.equal(terminal.state.dice,null);
let fr=R.create('Forfeit'),fj=R.join(fr.code,'Other');R.start(fr.code,0);let fg=R.get(fr.code).game;fg.tokens.red[0]=0;fg.sixes=2;R.rng=()=>.99;terminal=R.act(fr.code,0,{kind:'roll'});assert.equal(terminal.type,'forfeit');assert.equal(terminal.rolled,6);assert.equal(terminal.actor,0);assert.equal(terminal.state.turn,1);assert.equal(terminal.state.dice,null);
console.log('ROOM V2 TESTS: ALL PASS');
