(async()=>{
  const d=window.__wbDebug, cv=document.getElementById('stage');
  const R=cv.getBoundingClientRect();
  const sleep=ms=>new Promise(r=>setTimeout(r,ms)); await sleep(800);
  const it=()=>d.doc.pages[d.doc.active].items;
  function pe(t,x,y){cv.dispatchEvent(new PointerEvent(t,{pointerId:1,pointerType:'pen',isPrimary:true,bubbles:true,cancelable:true,button:0,clientX:R.left+x,clientY:R.top+y,pressure:.6,buttons:t==='pointerup'?0:1}));}
  d.setTool('pen'); d.setWidth(5); d.setColor('#111111');
  pe('pointerdown',200,220); for(let i=1;i<=24;i++) pe('pointermove',200+i*9,220+Math.sin(i/3)*60); pe('pointerup',416,220);
  await sleep(900);   // 等 500ms 防抖 flush 落盘
  return {items:it().length, title:document.getElementById('titleText').value, board:localStorage.getItem('wb-board-id')};
})()
