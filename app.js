// 百家主注助手（離線）
// 只保留你 Excel 那套：HV/AG/TP -> 主注建議（莊/閒/看一局）
// 並保留：局數、莊/閒/和統計、以及「照建議押」的勝負統計
// plus: undo/redo/reset

const HV_MAP = {1:9, 2:8, 3:7, 4:6, 5:5, 6:1, 7:3, 8:2, 9:2};
const AG_MAP = {0:-4, 1:-5, 2:-5, 3:-2, 4:-1, 5:-1, 6:3, 7:4, 8:5, 9:6};

function rankToVal(r){
  if (r === 1) return 1;
  if (r >= 2 && r <= 9) return r;
  return 0; // 10/J/Q/K
}
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
function winnerLabel(pTotal, bTotal){
  if (pTotal > bTotal) return "閒家";
  if (bTotal > pTotal) return "莊家";
  return "和";
}
function parseHand(line){
  const s = line.trim().toLowerCase();
  if (!s) return null;
  if (["undo","redo","reset","stats","clear"].includes(s)) return {cmd:s};
  const parts = line.trim().split(/\s+/);
  if (parts.length !== 2) throw new Error("格式錯誤：請輸入「閒牌(用.) 莊牌(用.)」，中間用空白隔開，例如：12.12.6 10.12.9");
  const p = parts[0].split('.').filter(Boolean).map(x=>parseInt(x,10));
  const b = parts[1].split('.').filter(Boolean).map(x=>parseInt(x,10));
  for (const r of [...p,...b]){
    if (!(r>=1 && r<=13) || Number.isNaN(r)) throw new Error("牌面需為 1~13 的數字");
  }
  return {p,b};
}

function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

const STORAGE_KEY = "baccarat_main_only_v1";

function newState(){
  return {
    prevP: null,
    prevB: null,
    stats: {handNo:0, bankerWins:0, playerWins:0, ties:0, pickWins:0, pickLosses:0, pickPushes:0, pickSkipped:0},
    log: [],
    undo: [],
    redo: []
  };
}

let state = loadState() ?? newState();

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }catch{ return null; }
}

function snapshot(){
  return { prevP: state.prevP, prevB: state.prevB, stats: deepClone(state.stats), log: deepClone(state.log) };
}
function restore(snap){
  state.prevP = snap.prevP;
  state.prevB = snap.prevB;
  state.stats = deepClone(snap.stats);
  state.log = deepClone(snap.log);
}

function applyPickResult(pick, win){
  const st = state.stats;
  if (!pick || pick === "看一局"){
    st.pickSkipped += 1; return;
  }
  if (win === "和"){
    st.pickPushes += 1; return;
  }
  if (pick === win) st.pickWins += 1;
  else st.pickLosses += 1;
}

function applyHandResult(win){
  const st = state.stats;
  st.handNo += 1;
  if (win === "莊家") st.bankerWins += 1;
  else if (win === "閒家") st.playerWins += 1;
  else st.ties += 1;
}

function excelLikeTPandPick(pRanks, bRanks){
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

  // 更新上一手
  state.prevP = pTotal;
  state.prevB = bTotal;

  return {pTotal, bTotal, tpP, tpB, pick};
}

function fmt(x){
  if (x==null) return "（無）";
  return (Math.round(x*1e6)/1e6).toString();
}

function addLogLine(obj){
  state.log.unshift(obj);
  // 最多留 200 行，避免localStorage爆掉
  if (state.log.length > 200) state.log.length = 200;
}

function cmdUndo(){
  if (!state.undo.length) return {ok:false, msg:"沒有可撤銷的紀錄"};
  state.redo.push(snapshot());
  const snap = state.undo.pop();
  restore(snap);
  return {ok:true, msg:"已撤銷上一手（undo）"};
}
function cmdRedo(){
  if (!state.redo.length) return {ok:false, msg:"沒有可復原的紀錄"};
  state.undo.push(snapshot());
  const snap = state.redo.pop();
  restore(snap);
  return {ok:true, msg:"已復原（redo）"};
}

function cmdClearLog(){
  state.log = [];
  setLastOut("已清除紀錄（log）");
  saveState();
  render();
  return {ok:true, msg:"已清除紀錄（log）"};
}

function cmdReset(){
  state = newState();
  saveState();
  render();
  return {ok:true, msg:"已重置（新靴/新一輪）"};
}

function submit(line){
  const parsed = parseHand(line);
  if (!parsed) return;
  if (parsed.cmd){
    let r;
    if (parsed.cmd==="undo") r = cmdUndo();
    else if (parsed.cmd==="redo") r = cmdRedo();
    else if (parsed.cmd==="reset") r = cmdReset();
    else if (parsed.cmd==="clear") r = cmdClearLog();
    else r = {ok:true, msg:""};
    if (parsed.cmd!=="reset"){
      if (r.msg) setLastOut(r.msg);
      saveState(); render();
    }
    return;
  }

  // 新輸入會讓 redo 失效
  state.redo = [];

  // 存「輸入前」狀態到 undo
  state.undo.push(snapshot());

  const {p,b} = parsed;
  const res = excelLikeTPandPick(p,b);
  const win = winnerLabel(res.pTotal, res.bTotal);

  applyHandResult(win);
  applyPickResult(res.pick, win);

  addLogLine({
    n: state.stats.handNo,
    input: line.trim(),
    pTotal: res.pTotal,
    bTotal: res.bTotal,
    win,
    tpP: res.tpP,
    tpB: res.tpB,
    pick: res.pick ?? "（前兩手不足）",
    ts: Date.now()
  });

  setLastOut(`第${state.stats.handNo}局｜勝利=${win}｜建議=${res.pick ?? "（前兩手不足）"}`);
  saveState();
  render();
}

function setLastOut(text){
  document.getElementById("lastOut").textContent = text;
}

// ===== UI =====
function render(){
  const st = state.stats;
  document.getElementById("handNo").textContent = st.handNo.toString();
  document.getElementById("wlt").textContent = `${st.bankerWins} / ${st.playerWins} / ${st.ties}`;
  document.getElementById("pickStats").textContent = `${st.pickWins} / ${st.pickLosses} / ${st.pickPushes} / ${st.pickSkipped}`;

  const logEl = document.getElementById("log");
  logEl.innerHTML = "";
  for (const row of state.log){
    const div = document.createElement("div");
    div.className = "line";
    const pillClass = row.win==="莊家" ? "good" : (row.win==="閒家" ? "bad" : "");
    div.innerHTML = `
      <div class="mono">
        <b>第${row.n}局</b>
        <span class="pill ${pillClass}">${row.win}</span>
        <span class="pill">${row.pick}</span>
      </div>
      <div class="mono muted" style="margin-top:6px;">
        輸入：${escapeHtml(row.input)}<br/>
        點數：閒=${row.pTotal} 莊=${row.bTotal}<br/>
        TP：閒=${row.tpP==null?"（無）":escapeHtml(fmt(row.tpP))} ｜ 莊=${row.tpB==null?"（無）":escapeHtml(fmt(row.tpB))}
      </div>
    `;
    logEl.appendChild(div);
  }
}

function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

document.getElementById("submitBtn").addEventListener("click", ()=>{
  const v = document.getElementById("handInput").value;
  document.getElementById("handInput").value = "";
  try{ submit(v); }catch(e){ alert(e.message || String(e)); }
});
document.getElementById("handInput").addEventListener("keydown", (e)=>{
  if (e.key === "Enter"){
    const v = document.getElementById("handInput").value;
    document.getElementById("handInput").value = "";
    try{ submit(v); }catch(err){ alert(err.message || String(err)); }
  }
});
document.getElementById("undoBtn").addEventListener("click", ()=>{
  const r = cmdUndo(); if (!r.ok) alert(r.msg); else setLastOut(r.msg);
  saveState(); render();
});
document.getElementById("redoBtn").addEventListener("click", ()=>{
  const r = cmdRedo(); if (!r.ok) alert(r.msg); else setLastOut(r.msg);
  saveState(); render();
});
document.getElementById("resetBtn").addEventListener("click", ()=>{
  if (!confirm("確定要重置嗎？（新靴/洗牌用）")) return;
  const r = cmdReset(); setLastOut(r.msg);
});

// 初次載入
render();


document.getElementById("clearBtn").addEventListener("click", ()=>{
  if (!confirm("確定要清除紀錄嗎？（只清 log，不影響局數/統計）")) return;
  cmdClearLog();
});
