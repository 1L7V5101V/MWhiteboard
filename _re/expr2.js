(function () {
  var e1 = new PointerEvent('pointerdown', { pointerType: 'mouse', pointerId: 1 });
  var e2 = new PointerEvent('pointerdown', { pointerType: 'pen', pointerId: 2, pressure: .7 });
  var e3 = new PointerEvent('pointerdown', {});
  return JSON.stringify({
    mouse: e1.pointerType, pen: e2.pointerType, penP: e2.pressure, def: e3.pointerType,
    hasCoalesced: typeof e1.getCoalescedEvents,
    coalescedLen: (function () { try { return e1.getCoalescedEvents().length; } catch (err) { return 'throw:' + err.message; } })(),
    title: document.title,
    hasInk: !!window.__wbDebug.ink,
    flat2: window.__wbDebug.ink.flat2
  });
})()
