// 百家主注助手（離線）v3
// 只保留你 Excel 那套：HV/AG/TP -> 「下局」主注建議（莊/閒/看一局）
// 修正：主注統計「贏/輸/和/略過」會用「上一局的建議」去對照「本局開牌結果」
//
// 指令：undo / redo / reset / clear
// UI：可用文字輸入，也可用按鈕輸入（閒/莊切換 + 1~13）

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

const STORAGE_KEY = "baccarat_main_only_v3";

function newState(){
  return {
    prevP: null,
    prevB: null,
    pendingPick: null, // 上一局產生的「下局建議」，等待本局結算

    stats: {
      handNo:0,
      bankerWins:0, playerWins:0, ties:0,
      pickWins:0, pickLosses:0, pickTies:0, pickSkipped:0
    },

    log: [],
    undo: [],
    redo: [],

    keypad: { side: "P", p: [], b: [] } // side: "P" or "B"
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
  return {
    prevP: state.prevP,
    prevB: state.prevB,
    pendingPick: state.pendingPick,
    stats: deepClone(state.stats),
    log: deepClone(state.log),
    keypad: deepClone(state.keypad)
  };
}
function restore(snap){
  state.prevP = snap.prevP;
  state.prevB = snap.prevB;
  state.pendingPick = snap.pendingPick;
  state.stats = deepClone(snap.stats);
  state.log = deepClone(snap.log);
  state.keypad = deepClone(snap.keypad ?? {side:"P",p:[],b:[]});
}

function applyHandResult(win){
  const st = state.stats;
  st.handNo += 1;
  if (win === "莊家") st.bankerWins += 1;
  else if (win === "閒家") st.playerWins += 1;
  else st.ties += 1;
}

function settlePendingPick(win){
  const st = state.stats;
  const pick = state.pendingPick;
  if (!pick || pick === "看一局"){
    st.pickSkipped += 1;
    return {evaluated: pick ?? "（無）", result: "略過"};
  }
  if (win === "和"){
    st.pickTies += 1;
    return {evaluated: pick, result: "和"};
  }
  if (pick === win){
    st.pickWins += 1;
    return {evaluated: pick, result: "贏"};
  }else{
    st.pickLosses += 1;
    return {evaluated: pick, result: "輸"};
  }
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

function fmt(x){
  if (x==null) return "（無）";
  return (Math.round(x*1e6)/1e6).toString();
}

function addLogLine(obj){
  state.log.unshift(obj);
  if (state.log.length > 200) state.log.length = 200;
}


function showMsg(text, ok=false){
  const el = document.getElementById("msg");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  el.classList.toggle("ok", !!ok);
  clearTimeout(el._t);
  el._t = setTimeout(()=>{ el.classList.remove("show"); }, 3000);
}
function clearMsg(){
  const el = document.getElementById("msg");
  if (!el) return;
  el.classList.remove("show");
}

function setText(id, text){
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}



// ---- commands ----
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
function cmdReset(){
  state = newState();
  saveState();
  render();
  return {ok:true, msg:"已重置（新靴/新一輪）"};
}
function cmdClearLog(){
  state.log = [];
  saveState();
  render();
  return {ok:true, msg:"已清除紀錄（log）"};
}

// ---- submit ----
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
      if (r.msg) setText("lastOut", r.msg);
      saveState(); render();
    }
    return;
  }

  state.redo = [];
  state.undo.push(snapshot());

  const {p,b} = parsed;

  // 本局結果
  const pTotal = handTotal(p);
  const bTotal = handTotal(b);
  const win = winnerLabel(pTotal, bTotal);

  // 結算上一局建議（對照本局）
  const settled = settlePendingPick(win);

  // 記入本局統計
  applyHandResult(win);

  // 產生下局建議
  const res = excelNextPick(p,b);
  state.pendingPick = res.nextPick;

  addLogLine({
    n: state.stats.handNo,
    input: line.trim(),
    pTotal: res.pTotal,
    bTotal: res.bTotal,
    win,
    prevPick: settled.evaluated,
    prevPickResult: settled.result,
    nextPick: res.nextPick ?? "（前兩手不足）",
    tpP: res.tpP,
    tpB: res.tpB,
    ts: Date.now()
  });

  const winEl = document.getElementById("thisWin");
winEl.textContent = win;
winEl.classList.remove("win-banker","win-player","win-tie");
if (win === "莊家") winEl.classList.add("win-banker");
else if (win === "閒家") winEl.classList.add("win-player");
else if (win === "和") winEl.classList.add("win-tie");
  setText("nextPick", res.nextPick ?? "（前兩手不足）");
  setText("lastOut", win);

  saveState();
  render();
}

// ---- UI render ----
function render(){
  const st = state.stats;
  setText("handNo", st.handNo.toString());
  setText("wlt", `${st.bankerWins} / ${st.playerWins} / ${st.ties}`);
  setText("pickStats", `${st.pickWins} / ${st.pickLosses} / ${st.pickTies} / ${st.pickSkipped}`);

  if (!state.log.length){
    setText("thisWin", "—");
    setText("nextPick", state.pendingPick ?? "—");    setText("lastOut", "—");
  }else{
    setText("thisWin", state.log[0].win);
    const nextPickEl = document.getElementById("nextPick");
const pick = state.log[0].nextPick;
nextPickEl.textContent = pick;
nextPickEl.classList.remove("pick-banker","pick-player","pick-skip");
if (pick === "莊家") nextPickEl.classList.add("pick-banker");
else if (pick === "閒家") nextPickEl.classList.add("pick-player");
else if (pick === "看一局") nextPickEl.classList.add("pick-skip");    setText("lastOut", state.log[0].win);
  }

  const logEl = document.getElementById("log");
  if (logEl){
    logEl.innerHTML = "";
    for (const row of state.log){
      const div = document.createElement("div");
      div.className = "line";
      const pillClass = row.win==="莊家" ? "good" : (row.win==="閒家" ? "bad" : "");
      div.innerHTML = `
        <div class="mono">
          <b>第${row.n}局</b>
          <span class="pill ${pillClass}">${markWin(row.win)} ${row.win}</span>
          <span class="pill">上局建議：${markPick(row.prevPick)} ${row.prevPick}</span>
          <span class="pill">結果：${row.prevPickResult}</span>
          <span class="pill">下局：${markPick(row.nextPick)} ${row.nextPick}</span>
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

  renderKeypad();

  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  if (undoBtn) undoBtn.disabled = !state.undo.length;
  if (redoBtn) redoBtn.disabled = !state.redo.length;
}


function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

function markWin(w){
  if (w==="莊家") return "🔴B";
  if (w==="閒家") return "🔵P";
  return "🟡T";
}
function markPick(p){
  if (p==="莊家") return "🔴B";
  if (p==="閒家") return "🔵P";
  if (p==="看一局") return "🟢WAIT";
  return "—";
}


// ---- keypad UI ----
function renderKeypad(){
  setText("pCardsDisp", state.keypad.p.length ? state.keypad.p.join(".") : "（空）");
  setText("bCardsDisp", state.keypad.b.length ? state.keypad.b.join(".") : "（空）");

  const sideP = document.getElementById("sidePlayer");
  const sideB = document.getElementById("sideBanker");
  if (sideP && sideB){
    if (state.keypad.side === "P"){
      sideP.classList.add("primary");
      sideP.textContent = "正在輸入：閒";
      sideB.classList.remove("primary");
      sideB.textContent = "切換到：莊";
    }else{
      sideB.classList.add("primary");
      sideB.textContent = "正在輸入：莊";
      sideP.classList.remove("primary");
      sideP.textContent = "切換到：閒";
    }
  }

  const pad = document.getElementById("cardPad");
  if (pad && !pad.dataset.ready){
    const labels = [
      {v:1, t:"1(A)"},{v:2,t:"2"},{v:3,t:"3"},{v:4,t:"4"},{v:5,t:"5"},
      {v:6,t:"6"},{v:7,t:"7"},{v:8,t:"8"},{v:9,t:"9"},{v:10,t:"10"},
      {v:11,t:"11(J)"},{v:12,t:"12(Q)"},{v:13,t:"13(K)"}
    ];
    for (const it of labels){
      const btn = document.createElement("button");
      btn.textContent = it.t;
      btn.addEventListener("click", ()=>{
        if (state.keypad.side === "P") if(state.keypad.p.length<3){state.keypad.p.push(it.v);}else{alert('閒家最多只能輸入三張');}
        else if(state.keypad.b.length<3){state.keypad.b.push(it.v);}else{alert('莊家最多只能輸入三張');}
        saveState();
        renderKeypad();
      });
      pad.appendChild(btn);
    }
    pad.dataset.ready = "1";
  }
}

function keypadBackspace(){
  const arr = (state.keypad.side === "P") ? state.keypad.p : state.keypad.b;
  if (arr.length) arr.pop();
}
function keypadClearSide(){
  if (state.keypad.side === "P") state.keypad.p = [];
  else state.keypad.b = [];
}
function keypadClearBoth(){
  state.keypad.p = [];
  state.keypad.b = [];
}
function keypadSubmit(){
  if (!state.keypad.p.length || !state.keypad.b.length){
    alert("請先用按鈕輸入閒牌與莊牌（兩邊都要有）");
    return;
  }
  const line = `${state.keypad.p.join(".")} ${state.keypad.b.join(".")}`;
  submit(line);
  keypadClearBoth();
  saveState();
  render();
}

// ---- bind DOM ----
document.getElementById("submitBtn").addEventListener("click", ()=>{
  const v = document.getElementById("handInput").value;
  document.getElementById("handInput").value = "";
  try{ submit(v); clearMsg(); }catch(e){ showMsg(e.message || String(e), false); }
});
document.getElementById("handInput").addEventListener("keydown", (e)=>{
  if (e.key === "Enter"){
    const v = document.getElementById("handInput").value;
    document.getElementById("handInput").value = "";
    try{ submit(v); clearMsg(); }catch(err){ showMsg(err.message || String(err), false); }
  }
});
document.getElementById("undoBtn").addEventListener("click", ()=>{
  const r = cmdUndo(); if (!r.ok) alert(r.msg); else setText("lastOut", r.msg);
  saveState(); render();
});
document.getElementById("redoBtn").addEventListener("click", ()=>{
  const r = cmdRedo(); if (!r.ok) alert(r.msg); else setText("lastOut", r.msg);
  saveState(); render();
});
document.getElementById("resetBtn").addEventListener("click", ()=>{
  if (!confirm("確定要重置牌靴嗎？會清空局數、統計、以及下局建議（相當於洗牌/新靴）。")) return;
  const r = cmdReset(); setText("lastOut", r.msg);
});
document.getElementById("clearBtn").addEventListener("click", ()=>{
  if (!confirm("確定只清除下方紀錄（log）嗎？局數與統計不會改變。")) return;
  const r = cmdClearLog(); setText("lastOut", r.msg);
});

document.getElementById("sidePlayer").addEventListener("click", ()=>{
  state.keypad.side = (state.keypad.side === "P") ? "B" : "P";
  saveState(); renderKeypad();

  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  if (undoBtn) undoBtn.disabled = !state.undo.length;
  if (redoBtn) redoBtn.disabled = !state.redo.length;
}
);
document.getElementById("sideBanker").addEventListener("click", ()=>{
  state.keypad.side = (state.keypad.side === "P") ? "B" : "P";
  saveState(); renderKeypad();

  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  if (undoBtn) undoBtn.disabled = !state.undo.length;
  if (redoBtn) redoBtn.disabled = !state.redo.length;
}
);
document.getElementById("bkspBtn").addEventListener("click", ()=>{
  keypadBackspace(); saveState(); renderKeypad();

  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  if (undoBtn) undoBtn.disabled = !state.undo.length;
  if (redoBtn) redoBtn.disabled = !state.redo.length;
}
);
document.getElementById("clearSideBtn").addEventListener("click", ()=>{
  keypadClearSide(); saveState(); renderKeypad();

  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  if (undoBtn) undoBtn.disabled = !state.undo.length;
  if (redoBtn) redoBtn.disabled = !state.redo.length;
}
);
document.getElementById("clearBothBtn").addEventListener("click", ()=>{
  keypadClearBoth(); saveState(); renderKeypad();

  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  if (undoBtn) undoBtn.disabled = !state.undo.length;
  if (redoBtn) redoBtn.disabled = !state.redo.length;
}
);
document.getElementById("submitKeypadBtn").addEventListener("click", ()=>{
  try{ keypadSubmit(); clearMsg(); }catch(e){ showMsg(e.message || String(e), false); }
});

// 初次載入
render();
