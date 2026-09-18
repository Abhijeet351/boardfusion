// BoardFusion room client - talks to server.js relay.
// Host runs the authoritative game; clients send move intents.
window.NET = (function(){
  let ws = null, mode = 'off', room = null, name = null;
  const handlers = {};
  const on = (ev, fn) => { handlers[ev] = fn; };
  const emit = (ev, d) => { if (handlers[ev]) handlers[ev](d); };
  function connect(url){
    return new Promise((res, rej) => {
      ws = new WebSocket(url);
      ws.onopen = () => res();
      ws.onerror = e => rej(e);
      ws.onclose = () => emit('closed', {});
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch(_) { return; }
        if (m.t === 'created') { mode = 'host'; room = m.code; }
        else if (m.t === 'joined') { mode = 'client'; room = m.code; }
        emit(m.t === 'move' ? 'intent' : m.t, m);
      };
    });
  }
  const create = n => { name = n; ws.send(JSON.stringify({t:'create', name:n})); };
  const join = (code, n) => { name = n; ws.send(JSON.stringify({t:'join', code:code.toUpperCase(), name:n})); };
  const intent = p => { p.t = 'move'; p.from = name; ws.send(JSON.stringify(p)); };
  const hostSend = p => { p.t = 'state'; ws.send(JSON.stringify(p)); };
  const hostStart = p => { p.t = 'start'; ws.send(JSON.stringify(p)); };
  return { connect, create, join, intent, hostSend, hostStart, on,
    get mode(){ return mode; }, get room(){ return room; }, get name(){ return name; } };
})();
