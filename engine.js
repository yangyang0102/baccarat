// engine.js - extracted pure logic for baccarat helper
// Version: v14
(function(){
function handTotal(ranks){
  let s = 0;
  for (const r of ranks) s += rankToVal(r);
  return s % 10;
}

function max1to9(ranks){
  const vals = [];
  for (const r of ranks){
    if (r === 1) vals.push(1);
    else if (r >= 2 && r <= 9) vals.push(r);
  }
  if (!vals.length) return null;
  return Math.max(...vals);
}

function excelNextPick(pRanks, bRanks){
  const pTotal = handTotal(pRanks);
  const bTotal = handTotal(bRanks);

  const pMax = max1to9(pRanks);
  const bMax = max1to9(bRanks);

  const pHv = (pMax==null)? null : (HV_MAP[pMax] ?? null);
  const bHv = (bMax==null)? null : (HV_MAP[bMax] ?? null);

  const pAg = (state.prevP==null)? null : (AG_MAP[Math.abs(pTotal - state.prevP)] ?? null);
  const bAg = (state.prevB==null)? null : (AG_MAP[Math.abs(bTotal - state.prevB)] ?? null);

  const tpP = (pHv==null || pAg==null || pAg===0)? null : (pHv / pAg);
  const tpB = (bHv==null || bAg==null || bAg===0)? null : (bHv / bAg);

  let pick = null;
  if (tpP!=null && tpB!=null){
    if (tpP > tpB) pick = "莊家";
    else if (tpB > tpP) pick = "閒家";
    else pick = "看一局";
  }

  state.prevP = pTotal;
  state.prevB = bTotal;

  return {pTotal, bTotal, tpP, tpB, nextPick: pick};
}


  window.Engine = { handTotal, max1to9, excelNextPick };
})();
