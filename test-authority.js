'use strict';
const assert=require('assert'),E=require('./dice-engine');
const die=n=>()=>((n-.5)/6);
let g=E.create(['A','B']);
assert.throws(()=>E.roll(g,1,die(6)),/out of turn/);
E.roll(g,0,die(6));assert.throws(()=>E.roll(g,0,die(6)),/already rolled/);assert.throws(()=>E.move(g,0,8),/illegal move/);E.move(g,0,0);assert.equal(g.tokens.red[0],0);
E.roll(g,0,die(2));assert.throws(()=>E.move(g,1,0),/out of turn/);E.move(g,0,0);assert.equal(g.turn,1);
// exact finish enforced
g=E.create(['A','B']);g.tokens.red[0]=55;E.roll(g,0,die(2));assert.equal(g.turn,1);assert.equal(g.tokens.red[0],55);
// capture is server-calculated
g=E.create(['A','B']);g.tokens.red[0]=4;g.tokens.yellow[0]=36;E.roll(g,0,die(6));let ev=E.move(g,0,0);assert.equal(ev.capture,1);assert.equal(g.tokens.yellow[0],-1);
// triple six forfeits even if client asks to move
g=E.create(['A','B']);E.roll(g,0,die(6));E.move(g,0,0);E.roll(g,0,die(6));E.move(g,0,0);ev=E.roll(g,0,die(6));assert.equal(ev.type,'forfeit');assert.equal(g.turn,1);assert.throws(()=>E.move(g,0,0),/out of turn/);
// server alone declares winner
g=E.create(['A','B']);g.tokens.red=[56,56,56,55];E.roll(g,0,die(1));ev=E.move(g,0,3);assert.equal(ev.type,'win');assert.equal(g.winner,0);assert.throws(()=>E.roll(g,0,die(1)),/game over/);
console.log('SERVER AUTHORITY TESTS: ALL PASS');
