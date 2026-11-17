(async()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms)); await sleep(1200);
  const d=window.__wbDebug;
  const it=()=>d.doc.pages[d.doc.active].items;
  return {items:it().length, kinds:it().map(x=>x.kind), title:document.getElementById('titleText').value, board:localStorage.getItem('wb-board-id'), nPts:it()[0]?it()[0].pts.length:0};
})()
