// 豪樂百家輔助程式 v9
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

function baccaratPoint(v){
  // v: 1-13 (A..K), baccarat point: A=1, 2-9=face, 10/J/Q/K=0
  if (!v) return 0;
  if (v >= 10) return 0;
  return v;
}
function baccaratTotal(cards){
  let s = 0;
  for (const v of (cards||[])) s += baccaratPoint(v);
  return s % 10;
}
function isNatural(p2, b2){
  return p2 === 8 || p2 === 9 || b2 === 8 || b2 === 9;
}
function bankerShouldDraw(b2, p3Point){
  // assumes player drew third card; use standard table
  if (b2 <= 2) return true;
  if (b2 === 3) return p3Point !== 8;
  if (b2 === 4) return p3Point >= 2 && p3Point <= 7;
  if (b2 === 5) return p3Point >= 4 && p3Point <= 7;
  if (b2 === 6) return p3Point === 6 || p3Point === 7;
  return false; // 7 stands
}
function expectedSide(){
  // Auto dealing order with forced draw rules
  const p = state.keypad.p || [];
  const b = state.keypad.b || [];
  const seq = state.keypad.seq || [];
  const total = p.length + b.length;

  if (total < 2) return "P";      // Player first two
  if (total < 4) return "B";      // Banker next two

  const p2 = baccaratTotal(p.slice(0,2));
  const b2 = baccaratTotal(b.slice(0,2));

  if (isNatural(p2,b2)) return null; // no draws

  // Need to ensure we don't allow impossible states
  if (p.length < 2 || b.length < 2) return null;

  // Player draw decision
  if (p.length === 2 && b.length === 2){
    if (p2 <= 5) return "P"; // player draws third
    // player stands, banker draws on 0-5
    if (b2 <= 5) return "B";
    return null;
  }

  // After player drew third
  if (p.length === 3 && b.length === 2){
    const p3 = baccaratPoint(p[2]);
    if (bankerShouldDraw(b2, p3)) return "B";
    return null;
  }

  // If banker already drew third, stop
  return null;
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

    keypad: { side: "P", p: [], b: [], seq: [] } // side: "P" or "B" (auto v17)
  };
}

let state = loadState() ?? newState();
// v17: ensure keypad seq exists
state.keypad = state.keypad || {side:"P",p:[],b:[],seq:[]};
state.keypad.seq = state.keypad.seq || [];

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

  setText("thisWin", win);
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
    setText("nextPick", state.pendingPick ?? "—");
    setText("lastOut", "—");
  }else{
    setText("thisWin", state.log[0].win);
    setText("nextPick", state.log[0].nextPick);
    setText("lastOut", state.log[0].win);
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
          <span class="pill ${pillClass}">${row.win}</span>
          <span class="pill">上局建議：${row.prevPick}</span>
          <span class="pill">結果：${row.prevPickResult}</span>
          <span class="pill">下局：${row.nextPick}</span>
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
}

function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

// ---- keypad UI ----
function renderKeypad(){
  // Auto decide which side to input next
  const nextSide = expectedSide();
  state.keypad.side = nextSide || "P";

  setText("pCardsDisp", state.keypad.p.length ? state.keypad.p.join(".") : "（空）");
  setText("bCardsDisp", state.keypad.b.length ? state.keypad.b.join(".") : "（空）");

  const sideP = document.getElementById("sidePlayer");
  const sideB = document.getElementById("sideBanker");
  if (sideP && sideB){
    if (nextSide === "P"){
      sideP.classList.add("primary");
      sideB.classList.remove("primary");
      const pHint = document.getElementById("pHint"); if (pHint) pHint.textContent = "正在輸入";
      const bHint = document.getElementById("bHint"); if (bHint) bHint.textContent = "";
    }else if (nextSide === "B"){
      sideB.classList.add("primary");
      sideP.classList.remove("primary");
      const bHint = document.getElementById("bHint"); if (bHint) bHint.textContent = "正在輸入";
      const pHint = document.getElementById("pHint"); if (pHint) pHint.textContent = "";
    }else{
      // no more cards
      sideP.classList.remove("primary");
      sideB.classList.remove("primary");
      const pHint = document.getElementById("pHint"); if (pHint) pHint.textContent = "";
      const bHint = document.getElementById("bHint"); if (bHint) bHint.textContent = "";
    }
  }

  const pad = document.getElementById("cardPad");
  if (pad && !pad.dataset.ready){
    const labels = [
      {v:1, t:"A"},{v:2,t:"2"},{v:3,t:"3"},{v:4,t:"4"},{v:5,t:"5"},{v:6,t:"6"},{v:7,t:"7"},
      {v:8,t:"8"},{v:9,t:"9"},{v:10,t:"10"},{v:11,t:"J"},{v:12,t:"Q"},{v:13,t:"K"},
      {v:"BACK", t:"⌫"}
    ];
    for (const it of labels){
      const btn = document.createElement("button");
      btn.className = "key";
      btn.type = "button";
      btn.dataset.v = String(it.v);

      const txt = document.createElement("span");
      txt.className = "keyText";
      txt.textContent = it.t;
      btn.appendChild(txt);

      const wrap = document.createElement("span");
      wrap.className = "badgeWrap";
      btn.appendChild(wrap);

      if (it.v === "BACK"){
        btn.classList.add("keyBack");
        btn.addEventListener("click", ()=>{
          keypadBackspace();
        });
      }else{
        btn.addEventListener("click", ()=>{
          const side = expectedSide();
          if (!side){
            alert("依百家樂補牌規則，本局不需要再補牌");
            return;
          }
          if (side === "P"){
            if (state.keypad.p.length < 3){
              state.keypad.p.push(it.v);
              state.keypad.seq.push("P");
            }
          }else{
            if (state.keypad.b.length < 3){
              state.keypad.b.push(it.v);
              state.keypad.seq.push("B");
            }
          }
          saveState();
          renderKeypad();
        });
      }

      pad.appendChild(btn);
    }
    pad.dataset.ready = "1";
  }

  updateKeyBadges();
}

function updateKeyBadges(){
  const pad = document.getElementById("cardPad");
  if (!pad) return;
  const btns = pad.querySelectorAll("button.key");
  const p = state.keypad.p || [];
  const b = state.keypad.b || [];
  const pThird = p.length >= 3 ? p[2] : null;
  const bThird = b.length >= 3 ? b[2] : null;

  const countMap = new Map();
  for (const v of [...p, ...b]) countMap.set(v, (countMap.get(v)||0)+1);

  for (const btn of btns){
    const raw = btn.dataset.v || "";
    if (raw === "BACK") continue;

    const v = Number(raw);
    btn.classList.remove("selected");
    const wrap = btn.querySelector(".badgeWrap");
    if (wrap) wrap.innerHTML = "";

    const badges = [];

    const inP = p.includes(v);
    const inB = b.includes(v);

    if (inP || inB) btn.classList.add("selected");

    if (inP) badges.push({t:"閒", cls:"badgeP"});
    if (inB) badges.push({t:"莊", cls:"badgeB"});

    if (v === pThird || v === bThird) badges.push({t:"補", cls:"badgeS"});

    const c = countMap.get(v);
    if (c && c > 1) badges.push({t:`x${c}`, cls:"badgeN"});

    if (wrap && badges.length){
      for (const bd of badges){
        const s = document.createElement("span");
        s.className = "badge " + bd.cls;
        s.textContent = bd.t;
        wrap.appendChild(s);
      }
    }
  }
}


function keypadBackspace(){
  state.keypad.seq = state.keypad.seq || [];
  const last = state.keypad.seq.pop();
  if (last === "P"){
    state.keypad.p.pop();
  }else if (last === "B"){
    state.keypad.b.pop();
  }else{
    // fallback
    if ((state.keypad.b||[]).length > (state.keypad.p||[]).length) state.keypad.b.pop();
    else state.keypad.p.pop();
  }
}

function keypadClearSide(){
  // auto mode: clear the side that is currently expected
  const side = expectedSide() || "P";
  if (side === "P"){
    // remove any player cards and rebuild seq
    state.keypad.p = [];
  }else{
    state.keypad.b = [];
  }
  // rebuild seq based on counts: P P B B [P] [B]
  state.keypad.seq = [];
  for (let i=0;i<state.keypad.p.length;i++) state.keypad.seq.push("P");
  for (let i=0;i<state.keypad.b.length;i++) state.keypad.seq.push("B");
}

function keypadClearBoth(){
  state.keypad.p = [];
  state.keypad.b = [];
  state.keypad.seq = [];
}

function keypadSubmit(){
  const p = state.keypad.p || [];
  const b = state.keypad.b || [];
  if (p.length < 2 || b.length < 2){
    alert("請先輸入閒家兩張、莊家兩張");
    return;
  }
  const next = expectedSide();
  if (next === "P"){
    alert("依補牌規則，閒家需要補一張");
    return;
  }
  if (next === "B"){
    alert("依補牌規則，莊家需要補一張");
    return;
  }
  const line = `${p.join(".")} ${b.join(".")}`;
  submit(line);
  keypadClearBoth();
  saveState();
  render();
}


// ---- bind DOM ----
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
  const r = cmdUndo(); if (!r.ok) alert(r.msg); else setText("lastOut", r.msg);
  saveState(); render();
});
document.getElementById("redoBtn").addEventListener("click", ()=>{
  const r = cmdRedo(); if (!r.ok) alert(r.msg); else setText("lastOut", r.msg);
  saveState(); render();
});
document.getElementById("resetBtn").addEventListener("click", ()=>{
  if (!confirm("確定要重置嗎？（新靴/洗牌用）")) return;
  const r = cmdReset(); setText("lastOut", r.msg);
});
document.getElementById("clearBtn").addEventListener("click", ()=>{
  if (!confirm("確定要清除紀錄嗎？（只清除最下方紀錄，不影響局數/統計）")) return;
  const r = cmdClearLog(); setText("lastOut", r.msg);
});

document.getElementById("sidePlayer").addEventListener("click", ()=>{ /* auto mode */ });
document.getElementById("sideBanker").addEventListener("click", ()=>{ /* auto mode */ });
document.getElementById("bkspBtn").addEventListener("click", ()=>{
  keypadBackspace(); saveState(); renderKeypad();
});
document.getElementById("clearSideBtn").addEventListener("click", ()=>{
  keypadClearSide(); saveState(); renderKeypad();
});
document.getElementById("clearBothBtn").addEventListener("click", ()=>{
  keypadClearBoth(); saveState(); renderKeypad();
});
document.getElementById("submitKeypadBtn").addEventListener("click", ()=>{
  try{ keypadSubmit(); }catch(e){ alert(e.message || String(e)); }
});

// 初次載入
render();
