<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Tool Auto Dự Đoán VIP - Anti Fake HWID</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js"></script>
    <style>
        :root { --panel-scale: 1; --accent: #3366ff; --glass: rgba(32,36,45,0.6); --card:#0f1720; }
        html,body { margin:0;padding:0;height:100%;background:#0d0d12;font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;color:#fff; }
        
        .overlay { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:linear-gradient(180deg, rgba(2,6,12,0.7), rgba(2,6,12,0.85)); z-index:20000; }
        .panel-card { width:420px; max-width:94vw; border-radius:14px; padding:22px; box-shadow:0 18px 60px rgba(0,0,0,0.7); background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)); border:1px solid rgba(255,255,255,0.04); backdrop-filter: blur(6px); }
        .panel-card h2 { margin:0 0 6px 0; font-size:18px; text-align:center; text-transform: uppercase; }
        .sub { font-size:13px; color:#bdbdbd; text-align:center; margin-bottom:12px; }
        .price-grid { display:flex; gap:8px; justify-content:space-between; margin:12px 0; }
        .price-item { flex:1; background:rgba(255,255,255,0.02); padding:10px;border-radius:8px;text-align:center;font-weight:600; border:1px solid rgba(255,255,255,0.03); }
        .input-row { display:flex; gap:8px; margin-top:10px; }
        input[type="text"]{ flex:1;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.45);color:#fff;outline:none; }
        .btn { padding:10px 14px;border-radius:10px;border:none;cursor:pointer;font-weight:700;background:linear-gradient(180deg,var(--accent),#234ed6); color:#fff; transition: opacity 0.2s; }
        .btn:hover { opacity: 0.9; }
        .btn-ghost { background:transparent;border:1px solid rgba(255,255,255,0.06); color:#ddd; padding:10px 14px; border-radius:10px; cursor:pointer; font-weight:700; transition: background 0.2s; }
        .btn-ghost:hover { background: rgba(255,255,255,0.05); }
        .msg { text-align:center; margin-top:10px; min-height:20px; font-size:14px; }
        .msg.success { color:#9effc9; }
        .msg.error { color:#ff9ea6; }
        .small { font-size:12px;color:#aab; text-align:center; margin-top:8px; }

        #game-frame { width:100%; height:100vh; border: none; display:block; filter:none; }
        #toggle-tool { position:fixed; top:15px; right:15px; z-index:10000; padding:10px 14px; background:var(--accent); color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold; display:none; }
        #tool-panel { position:absolute; top:15px; right:15px; width:340px; min-width:240px; min-height:120px; background: rgba(20, 24, 34, 0.95); color: #fff; padding: 0; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.8); border: 1px solid #333; z-index:9999; overflow: hidden; backdrop-filter: blur(10px); resize: both; transform-origin: top right; transform: scale(var(--panel-scale)); touch-action:none; display:none; }
        #tool-panel.horizontal { width: 560px; }
        #tool-panel.horizontal .pred-grid { grid-template-columns: 1fr 1fr 1fr; }
        #tool-panel.horizontal .pred-final { grid-column: span 1; }

        @keyframes flash-border { 0% { border-color: #ffd700; box-shadow: 0 0 5px rgba(255,215,0,0.2); } 50% { border-color: #ff4d4d; box-shadow: 0 0 15px rgba(255,77,77,0.8); } 100% { border-color: #ffd700; box-shadow: 0 0 5px rgba(255,215,0,0.2); } }
        #tool-panel.compact-mode { width: 250px !important; min-width: 200px; }
        #tool-panel.compact-mode #panel-settings, #tool-panel.compact-mode .hide-on-compact { display: none !important; }
        #tool-panel.compact-mode .pred-grid { display: flex; flex-direction: column; gap: 6px; }
        #tool-panel.compact-mode .pred-box { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-radius: 6px; }
        #tool-panel.compact-mode .pred-title { font-size: 11px; text-align: left; margin: 0; color: #ccc; }
        #tool-panel.compact-mode .pred-value { font-size: 14px; font-weight: 800; }
        #tool-panel.compact-mode .pred-final { background: linear-gradient(90deg, #2a2a3a, #1a1e29); border: 1px solid #ffd700; animation: flash-border 1.2s infinite; }
        #tool-panel.compact-mode .warn-box { font-size: 10px; padding: 6px; margin-bottom: 6px; text-align: center; }

        .panel-header { background: linear-gradient(90deg, #ff3333, var(--accent)); padding:12px; display:flex; justify-content:space-between; align-items:center; gap:8px; border-top-left-radius:12px; border-top-right-radius:12px; }
        .header-left { display:flex; gap:8px; align-items:center; }
        .header-title { font-weight:700; text-transform: uppercase; }
        .expire-badge { font-size:12px; background:rgba(255,255,255,0.05); padding:6px 8px; border-radius:8px; color:#ffd; }
        .panel-body { padding:12px; overflow:auto; max-height:calc(100% - 56px); display:flex; flex-direction:column; gap:12px; }
        #btn-auto{ width:100%; padding:12px; background:linear-gradient(180deg,#ffd700,#ffaa00); color:#000; font-weight:700; border:none; border-radius:8px; cursor:pointer; }
        .select-row { display:flex; gap:8px; align-items:center; }
        .seq-text{ letter-spacing:3px; font-family:monospace; color:#ffd700; font-weight:700; }

        .info-row { background:#1a1e29;padding:10px;border-radius:8px;font-size:14px;border:1px solid #2a2f3a; }
        .bar-container { width:100%;height:28px;background:#222;border-radius:12px;display:flex;overflow:hidden;border:1px solid #444; }
        .bar-tai { height:100%;display:flex;align-items:center;padding-left:10px;background:#ff4d4d;color:#000; transition: width 0.5s ease-in-out; }
        .bar-xiu { height:100%;display:flex;align-items:center;justify-content:flex-end;padding-right:10px;background:#4da6ff;color:#000; transition: width 0.5s ease-in-out; }
        
        .pred-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .pred-box{background:#1a1e29;padding:10px;border-radius:8px;text-align:center;border:1px solid #333;}
        .pred-final{grid-column:span 2;background:linear-gradient(45deg,#2a2a3a,#1a1e29);border:1px solid #ffd700;padding:12px;}
        .hint-box{text-align:center;font-size:14px;color:#fff;background:rgba(255,255,255,0.03);padding:8px;border-radius:6px;}

        .control-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .tiny { font-size:12px; color:#cfcfcf; }
        .toggle-btn { padding:6px 8px; border-radius:8px; border:1px solid #444; background:transparent; color:#fff; cursor:pointer; }
        .toggle-btn.active { background:#2a2a3a; border-color:#888; }

        #toast-container { position: fixed; bottom: 20px; right: 20px; display: flex; flex-direction: column; gap: 10px; z-index: 100000; pointer-events: none; }
        .toast { background: rgba(20, 24, 34, 0.95); color: #fff; padding: 12px 20px; border-radius: 8px; border-left: 4px solid #3366ff; box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-size: 14px; animation: toast-in 0.3s forwards, toast-out 0.3s forwards 3s; }
        .toast.error { border-left-color: #ff4d4d; }
        .toast.success { border-left-color: #00c853; }
        @keyframes toast-in { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
        @keyframes toast-out { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(100%); } }

        @media (max-width:720px) {
            #toggle-tool { right:12px; top:12px; }
            #tool-panel{ left:8px; right:8px; width:auto; min-width:auto; transform-origin:top center; }
            #tool-panel.horizontal { width: auto; }
            #tool-panel.horizontal .pred-grid { grid-template-columns: 1fr 1fr; }
            #tool-panel.horizontal .pred-final { grid-column: span 2; }
            .panel-body{ padding:10px; max-height:60vh; }
        }
    </style>
</head>
<body>

    <div id="toast-container"></div>

    <div id="gameSelectOverlay" class="overlay" role="dialog" aria-modal="true">
        <div class="panel-card" role="document">
            <h2>🎮 CHỌN GAME SỬ DỤNG TOOL</h2>
            <div class="sub">Vui lòng chọn cổng game bạn muốn dự đoán</div>
            <div style="display:flex;flex-direction:column;gap:12px;margin-top:20px;">
                <button id="btn-select-lc79" class="btn" style="background:linear-gradient(180deg,#00c853,#00b44a); padding: 14px;">MỞ TOOL LC79</button>
                <button id="btn-select-xd88" class="btn" style="background:linear-gradient(180deg,#f39c12,#d35400); padding: 14px;">MỞ TOOL XOCDIA88</button>
                <button id="btn-select-betvip" class="btn" style="background:linear-gradient(180deg,#e11d48,#be123c); padding: 14px;">MỞ TOOL BETVIP</button>
                <button id="btn-select-sunwin" class="btn" style="background:linear-gradient(180deg,#c2410c,#9a3412); padding: 14px;">MỞ TOOL SUNWIN</button>
            </div>
        </div>
    </div>

    <div id="entryOverlay" class="overlay" role="dialog" aria-modal="true" style="display:none;">
        <div class="panel-card" role="document">
            <h2 id="entryTitle">🔐 Kích hoạt VIP - <span id="gameNameDisplay" style="color:#ffd700;"></span></h2>
            <div class="sub">Nhập key dành riêng cho <span id="gameNameSub"></span>. Bảng giá:</div>

            <div class="price-grid" aria-hidden="false">
                <div class="price-item"><div style="font-size:14px;color:#ffd;">49k</div><div style="font-size:12px;color:#bdbdbd">1 Day</div></div>
                <div class="price-item"><div style="font-size:14px;color:#ffd;">99k</div><div style="font-size:12px;color:#bdbdbd">7 Days</div></div>
                <div class="price-item"><div style="font-size:14px;color:#ffd;">199k</div><div style="font-size:12px;color:#bdbdbd">30 Days</div></div>
            </div>

            <div style="margin-top:6px">
                <label class="small">Nhập Key</label>
                <div class="input-row">
                    <input id="keyInput" type="text" placeholder="Nhập key của bạn..." autocomplete="off" />
                    <button id="checkBtn" class="btn">KIỂM TRA</button>
                </div>
                <div id="entryMsg" class="msg"></div>
                <div class="small" style="margin-bottom: 10px;">Lưu ý: key chỉ dùng cho 1 thiết bị trên game này.</div>
                <button id="backToGameSelectBtn" class="btn-ghost" style="width:100%;">⬅ Quay lại chọn game</button>
            </div>
        </div>
    </div>

    <iframe id="game-frame" src="about:blank" style="width:100%;height:100vh;border:0;display:none;"></iframe>
    <button id="toggle-tool" onclick="togglePanel()">MỞ TOOL</button>

    <div id="tool-panel" aria-hidden="true">
        <div class="panel-header" id="panel-header">
            <div class="header-left"><div class="header-title" id="tool-title">🎯 TOOL DỰ ĐOÁN</div></div>
            <div style="display:flex;align-items:center;gap:8px">
                <div id="expireBadge" class="expire-badge" title="Thời hạn key">Key: --</div>
                <div class="controls">
                    <button class="icon" title="Thu gọn" onclick="toggleCompactMode()">⏬</button>
                    <button class="icon" title="Thu nhỏ" onclick="changeScale(-0.1)">−</button>
                    <button class="icon" title="Phóng to" onclick="changeScale(0.1)">+</button>
                    <button class="icon" title="Reset" onclick="resetScale()">R</button>
                    <button class="icon" id="orientBtn" title="Chuyển ngang" onclick="toggleOrientation()">↔</button>
                    <button class="close-btn" onclick="togglePanel()">×</button>
                </div>
            </div>
        </div>

        <div class="panel-body" id="panel-body">
            <div style="flex: 0 0 100%;"><button id="btn-auto" onclick="fetchApiAndPredict()">🔄 CẬP NHẬT DỮ LIỆU CẦU</button></div>

            <div id="panel-settings" style="display:flex; flex-direction:column; gap:12px;">
                <div class="select-row">
                    <label>Độ dài chuỗi:</label>
                    <select id="seq-length-select">
                        <option value="11">11</option><option value="12">12</option><option value="13" selected>13</option><option value="14">14</option>
                    </select>
                </div>
                <div class="select-row">
                    <label>Chọn bàn:</label>
                    <select id="api-source-select">
                        <option value="normal">Bàn thường</option><option value="md5">Bàn MD5</option>
                    </select>
                </div>
                <div class="control-row tiny">
                    <label><input type="checkbox" id="skip-dice-checkbox" /> Bỏ phân tích xúc xắc</label>
                    <label><input type="checkbox" id="hide-suggestion-checkbox" /> Ẩn gợi ý đánh</label>
                </div>
                <div class="control-row tiny">
                    <label><input type="checkbox" id="auto-refresh-checkbox" /> Tự động cập nhật (10s)</label>
                    <label><input type="checkbox" id="sound-alert-checkbox" checked /> Âm thanh thông báo</label>
                </div>

                <button id="btn-advanced-toggle" class="toggle-btn" style="width:100%;">⚙ Nâng cao</button>

                <div id="advanced-section" style="display:none;">
                    <div class="control-row tiny">
                        <label><input type="checkbox" id="invert-chain-checkbox" /> Bẻ phân tích chuỗi</label>
                        <label><input type="checkbox" id="invert-final-checkbox" /> Bẻ kết quả tổng hợp</label>
                    </div>
                    <div class="control-row">
                        <button id="btn-invert-all" class="toggle-btn">Đảo cầu (Toàn bộ)</button>
                        <button id="btn-invert-chain" class="toggle-btn">Đảo cầu (Chỉ chuỗi)</button>
                    </div>
                </div>

                <div class="select-row" style="align-items:flex-start; gap:10px;">
                    <label style="align-self:flex-start;">Chú thích:</label>
                    <textarea id="annotation-input" rows="2" style="flex:1; padding:8px; border-radius:8px; background:rgba(0,0,0,0.45); border:1px solid rgba(255,255,255,0.04); color:#fff; resize:vertical;" placeholder="Thêm ghi chú..."></textarea>
                </div>
            </div>
            <div id="result-box" style="flex:1 1 auto;"><div style="text-align:center;color:#888;padding:20px 0;"><i>Chưa có dữ liệu. Hãy bấm cập nhật...</i></div></div>
        </div>
    </div>

<script>
// ================= BẢO MẬT CHỐNG F12 & CHUỘT PHẢI =================
document.addEventListener('contextmenu', event => event.preventDefault()); 
document.addEventListener('keydown', function(e) {
    if(e.keyCode === 123) { e.preventDefault(); return false; } 
    if(e.ctrlKey && e.shiftKey && e.keyCode === 73) { e.preventDefault(); return false; } 
    if(e.ctrlKey && e.shiftKey && e.keyCode === 74) { e.preventDefault(); return false; } 
    if(e.ctrlKey && e.keyCode === 85) { e.preventDefault(); return false; } 
});

// ================= BẪY DEBUGGER CHỐNG SOI CODE =================
setInterval(function() {
    (function() { return false; }['constructor']('debugger')());
}, 50);

const KEY_SERVER_URL = "https://vip-key-server.onrender.com";
const HWID_SECRET = "MY_SUPER_SECRET_HWID_KEY_2026"; 

window.lastDataString = ""; 
let selectedGame = ''; 
let sessionToken = null; 
let currentKey = null;

function generateSignature(hwid, timestamp) {
    return CryptoJS.HmacSHA256(hwid + timestamp, HWID_SECRET).toString();
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

let audioCtx = null;
function playBeep(type) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        if (type === 'warn') { osc.type = 'square'; osc.frequency.setValueAtTime(400, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.3); gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3); osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.3);
        } else { osc.type = 'sine'; osc.frequency.setValueAtTime(600, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.1); gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2); osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.2); }
    } catch(e) {}
}

async function getHWID() {
    let id = localStorage.getItem("device_hw");
    if(id) return id;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = "top"; ctx.font = "14px 'Arial'"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60"; ctx.fillRect(125,1,62,20);
    ctx.fillStyle = "#069"; ctx.fillText("vip-tool", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)"; ctx.fillText("vip-tool", 4, 17);
    const dataURL = canvas.toDataURL();
    const str = navigator.userAgent + screen.width + "x" + screen.height + navigator.language + dataURL;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; 
    }
    id = "HWID-" + Math.abs(hash).toString(16).toUpperCase();
    localStorage.setItem("device_hw", id);
    return id;
}

const gameSelectOverlay = document.getElementById("gameSelectOverlay");
const entryOverlay = document.getElementById("entryOverlay");
const entryMsg = document.getElementById("entryMsg");
const checkBtn = document.getElementById("checkBtn");
const keyInput = document.getElementById("keyInput");
const btnSelectLc79 = document.getElementById("btn-select-lc79");
const btnSelectXd88 = document.getElementById("btn-select-xd88");
const btnSelectBetvip = document.getElementById("btn-select-betvip");
const btnSelectSunwin = document.getElementById("btn-select-sunwin");
const backToGameSelectBtn = document.getElementById("backToGameSelectBtn");
const gameNameDisplay = document.getElementById("gameNameDisplay");
const gameNameSub = document.getElementById("gameNameSub");
const expireBadge = document.getElementById("expireBadge");
const gameFrame = document.getElementById("game-frame");
const toolPanel = document.getElementById("tool-panel");
const toggleBtn = document.getElementById("toggle-tool");
const toolTitle = document.getElementById("tool-title");

const invertChainCheckbox = () => document.getElementById('invert-chain-checkbox');
const invertFinalCheckbox = () => document.getElementById('invert-final-checkbox');
const skipDiceCheckbox = () => document.getElementById('skip-dice-checkbox');
const hideSuggestionCheckbox = () => document.getElementById('hide-suggestion-checkbox');
const annotationInput = () => document.getElementById('annotation-input');
const btnInvertAll = document.getElementById('btn-invert-all');
const btnInvertChain = document.getElementById('btn-invert-chain');

function show(el){ el.style.display = ""; }
function hide(el){ el.style.display = "none"; }

let expireTimer = null;
let autoRefreshInterval = null;

btnSelectLc79.addEventListener("click", () => { selectedGame = 'lc79'; gameNameDisplay.innerText = "LC79"; gameNameSub.innerText = "LC79"; hide(gameSelectOverlay); show(entryOverlay); });
btnSelectXd88.addEventListener("click", () => { selectedGame = 'xd88'; gameNameDisplay.innerText = "XOCDIA88"; gameNameSub.innerText = "XOCDIA88"; hide(gameSelectOverlay); show(entryOverlay); });
btnSelectBetvip.addEventListener("click", () => { selectedGame = 'betvip'; gameNameDisplay.innerText = "BETVIP"; gameNameSub.innerText = "BETVIP"; hide(gameSelectOverlay); show(entryOverlay); });
if (btnSelectSunwin) { btnSelectSunwin.addEventListener("click", () => { selectedGame = 'sunwin'; gameNameDisplay.innerText = "SUNWIN"; gameNameSub.innerText = "SUNWIN"; hide(gameSelectOverlay); show(entryOverlay); }); }
backToGameSelectBtn.addEventListener("click", () => { hide(entryOverlay); show(gameSelectOverlay); keyInput.value = ""; entryMsg.innerText = ""; });

document.getElementById('auto-refresh-checkbox').addEventListener('change', (e) => {
    if(e.target.checked) {
        autoRefreshInterval = setInterval(fetchApiAndPredict, 10000); 
        showToast('Đã bật tự động lấy dữ liệu (10s)', 'success');
        fetchApiAndPredict(); 
    } else {
        clearInterval(autoRefreshInterval);
        showToast('Đã tắt tự động lấy dữ liệu', 'success');
    }
});

function startExpireCountdown(expireTs){
    if(expireTimer) clearInterval(expireTimer);
    function update(){
        const now = Date.now(); const diff = expireTs - now;
        if(diff <= 0){ 
            expireBadge.innerText = "Key: Hết hạn"; 
            clearInterval(expireTimer); 
            showToast("⏳ Key đã hết hạn. Đang đóng tool...", "error");
            setTimeout(() => location.reload(), 2000);
            return; 
        }
        const totalSec = Math.floor(diff/1000);
        const days = Math.floor(totalSec / 86400), hours = Math.floor((totalSec % 86400) / 3600), mins = Math.floor((totalSec % 3600) / 60);
        expireBadge.innerText = "Key expires: " + (days>0? days+"d ":"") + String(hours).padStart(2,"0")+":"+String(mins).padStart(2,"0");
    } 
    update(); 
    expireTimer = setInterval(update, 1000);
}

async function checkKeyFlow(){
    const key = (keyInput.value || "").trim();
    if(!key){ entryMsg.className="msg error"; entryMsg.innerText="Vui lòng nhập key"; return; }
    entryMsg.className="msg"; entryMsg.innerText="Đang kiểm tra..."; checkBtn.disabled = true;
    try{
        const hwid = await getHWID(); 
        const timestamp = Date.now();
        const signature = generateSignature(hwid, timestamp);

        const resp = await fetch(KEY_SERVER_URL + "/check-key", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ key, hwid, game: selectedGame, timestamp, signature })
        });
        
        const data = await resp.json();
        if(data && data.success){
            sessionToken = data.token;
            currentKey = key;
            if(data.expire) startExpireCountdown(data.expire); else expireBadge.innerText = "Key: (no expire)";
            
            entryMsg.className = "msg success";
            entryMsg.innerText = `✅ Key hợp lệ cho ${selectedGame.toUpperCase()}. Đang mở game...`;
            setTimeout(()=> { hide(entryOverlay); openGameFrame(selectedGame); }, 800);
        } else {
            entryMsg.className="msg error"; entryMsg.innerText = data && data.message ? ("❌ " + data.message) : "Key không hợp lệ hoặc sai game";
        }
    }catch(err){ entryMsg.className="msg error"; entryMsg.innerText = "Lỗi kết nối server"; } finally { checkBtn.disabled = false; }
}

keyInput.addEventListener("keydown", (e) => { if(e.key === "Enter") checkKeyFlow(); });
checkBtn.addEventListener("click", checkKeyFlow);

function openGameFrame(gameType) {
    if(gameType === 'lc79') { gameFrame.src = "https://lc79b.bet/"; toolTitle.innerText = "🎯 TOOL DỰ ĐOÁN LC79"; } 
    else if(gameType === 'xd88') { gameFrame.src = "https://play.xocdia88.green/"; toolTitle.innerText = "🎯 TOOL DỰ ĐOÁN XOCDIA88"; }
    else if(gameType === 'betvip') { gameFrame.src = "https://play.betvip.fit/"; toolTitle.innerText = "🎯 TOOL DỰ ĐOÁN BETVIP"; }
    else if(gameType === 'sunwin') { gameFrame.src = "https://web.sunwin.lt/?affId=Sunwin"; toolTitle.innerText = "🎯 TOOL DỰ ĐOÁN SUNWIN"; }
    show(gameFrame);
    setTimeout(()=>{ toolPanel.style.display = "block"; toolPanel.setAttribute("aria-hidden","false"); toggleBtn.style.display = "none"; window.lastDataString = ""; }, 300);
}

function togglePanel(){
    if(toolPanel.style.display === "none" || toolPanel.getAttribute('aria-hidden') === 'true'){ toolPanel.style.display = "block"; toolPanel.setAttribute('aria-hidden','false'); toggleBtn.style.display = "none"; } 
    else { toolPanel.style.display = "none"; toolPanel.setAttribute('aria-hidden','true'); toggleBtn.style.display = "block"; }
}

document.querySelector(".close-btn").addEventListener("click", ()=> { togglePanel(); });

const GOI_Y_NGUONG = [ [90, "Rất tự tin đặt"], [70, "Nên đặt"], [60, "Cân nhắc"] ];
function goiYDat(du_doan, percent) {
    if(du_doan === "Không rõ") return "Bỏ qua";
    for (let i = 0; i < GOI_Y_NGUONG.length; i++) {
        if (percent >= GOI_Y_NGUONG[i][0]) return percent < 70 ? `${GOI_Y_NGUONG[i][1]} (vì tỷ lệ chưa cao)` : GOI_Y_NGUONG[i][1];
    } return "Bỏ qua";
}

function duDoanTuXucXac(dices) {
    if (!dices || dices.length !== 3) return ["Không rõ", null];
    const tong = dices[0] + dices[1] + dices[2];
    if (tong >= 11 && tong <= 17) return ["Tài", tong];
    if (tong >= 4 && tong <= 10) return ["Xỉu", tong];
    return ["Không rõ", tong];
}

function duDoanTongHop(kq_chuoi, xuc_xac) {
    let kq_xx = "Không rõ", tong_xx = null;
    if (xuc_xac && xuc_xac.length === 3) { const tmp = duDoanTuXucXac(xuc_xac); kq_xx = tmp[0]; tong_xx = tmp[1]; }
    let ket_qua = (kq_chuoi === kq_xx && kq_chuoi !== "Không rõ") ? kq_chuoi : (kq_chuoi !== "Không rõ" && kq_xx === "Không rõ") ? kq_chuoi : (kq_chuoi === "Không rõ" && kq_xx !== "Không rõ") ? kq_xx : "Không rõ";
    return { ket_qua, kq_xx, tong_xx };
}

function getMlsClass(kq) { return (kq === "Tài" || kq === "T") ? "color-tai" : (kq === "Xỉu" || kq === "X") ? "color-xiu" : ""; }
function invertKQ(k){ if(!k) return k; return (k === 'Tài' || k === 'T' || k === 'TAI' ) ? 'Xỉu' : (k === 'Xỉu' || k === 'X' || k === 'XIU') ? 'Tài' : k; }

document.getElementById('api-source-select').addEventListener('change', () => { window.lastDataString = ""; document.getElementById("btn-auto").innerHTML = "🔄 ĐANG CHUYỂN BÀN..."; setTimeout(fetchApiAndPredict, 500); });

async function fetchApiAndPredict() {
    const resultBox = document.getElementById("result-box");
    const btn = document.getElementById("btn-auto");
    const source = document.getElementById("api-source-select").value || 'normal';
    const selectedLen = parseInt(document.getElementById("seq-length-select").value, 10) || 13;

    btn.innerHTML = "⏳ ĐANG XỬ LÝ..."; btn.style.opacity = "0.7";

    const invertChain = invertChainCheckbox() && invertChainCheckbox().checked;
    const invertFinal = invertFinalCheckbox() && invertFinalCheckbox().checked;
    const skipDice = skipDiceCheckbox() && skipDiceCheckbox().checked;
    const hideSuggestion = hideSuggestionCheckbox() && hideSuggestionCheckbox().checked;
    const annotation = annotationInput() ? annotationInput().value.trim() : '';

    let kq_chuoi = "Không rõ", pt = 50, px = 50, cau_bip = null, chuoiN = [], lastDice = [];

    try {
        const hwid = await getHWID();
        const timestamp = Date.now();
        const signature = generateSignature(hwid, timestamp);

        const predictResp = await fetch(KEY_SERVER_URL + "/predict", {
            method: "POST",
            headers: { "Content-Type":"application/json", "Authorization": "Bearer " + sessionToken },
            body: JSON.stringify({ 
                source: source, 
                seqLength: selectedLen, 
                invertChain: invertChain,
                timestamp,
                signature,
                game: selectedGame
            })
        });
        const predictData = await predictResp.json();
        
        if (predictData && predictData.success) {
            pt = Number(predictData.ptTai);
            px = Number(predictData.ptXiu);
            kq_chuoi = predictData.ket_qua || kq_chuoi;
            cau_bip = predictData.cau_bip || null;
            chuoiN = predictData.chuoiN || [];
            lastDice = predictData.lastDice || [];
        } else {
            showToast(`Lỗi: ${predictData.message || 'Lỗi hệ thống.'}`, 'error');
            btn.innerHTML = "🔄 CẬP NHẬT DỮ LIỆU CẦU"; btn.style.opacity = "1"; 
            if (predictData.kicked) {
                setTimeout(() => { location.reload(); }, 2500); 
            }
            return;
        }
    } catch (e) {
        showToast("Lỗi kết nối Server.", "error");
        btn.innerHTML = "🔄 CẬP NHẬT DỮ LIỆU CẦU"; btn.style.opacity = "1"; return;
    }

    let currentDataString = chuoiN.join("") + "-" + (lastDice ? lastDice.join("") : "");
    if (window.lastDataString === currentDataString) { showToast("Đang chờ dữ liệu mới...", "info"); btn.innerHTML = "🔄 CẬP NHẬT DỮ LIỆU CẦU"; btn.style.opacity = "1"; return; }
    else { if (window.lastDataString !== "") showToast("Phát hiện cầu mới! Đang cập nhật...", "success"); window.lastDataString = currentDataString; }

    const invertAllActive = btnInvertAll.classList.contains('active');
    const invertChainBtnActive = btnInvertChain.classList.contains('active');

    if(invertChainBtnActive && !invertChain) { kq_chuoi = invertKQ(kq_chuoi); let temp = pt; pt = px; px = temp; }

    let ketQuaObj = duDoanTongHop(kq_chuoi, skipDice ? null : lastDice);
    let kq_xx = ketQuaObj.kq_xx, tong_xx = ketQuaObj.tong_xx, ket_qua = skipDice ? (kq_chuoi !== 'Không rõ' ? kq_chuoi : 'Không rõ') : ketQuaObj.ket_qua;

    if(invertFinal) ket_qua = invertKQ(ket_qua);
    if(invertAllActive) ket_qua = invertKQ(ket_qua);

    const goi_y = goiYDat(ket_qua, Math.max(pt, px));
    const soundEnabled = document.getElementById('sound-alert-checkbox').checked;
    if (soundEnabled) { if (cau_bip) playBeep('warn'); else if (Math.max(pt, px) >= 80) playBeep('high'); }

    resultBox.innerHTML = `
        <div class="info-row hide-on-compact" style="min-width:140px;">
            <div style="color:#aaa; font-size:12px; margin-bottom:4px;">Nguồn: <b>${source === 'md5' && selectedGame !== 'sunwin' ? 'Bàn MD5' : 'Bàn thường'}</b> — Chuỗi ${chuoiN.length} ván:</div>
            <div class="seq-text">${chuoiN.join("")}</div>
        </div>
        <div class="info-row hide-on-compact" style="min-width:140px;">
            <div style="color:#aaa; font-size:12px; margin-bottom:4px;">Kết quả phiên trước:</div>
            <div>🎲 Xúc xắc: <b>${lastDice.length ? lastDice.join(" - ") : "?"}</b> (Tổng <b class="${getMlsClass(kq_xx)}">${tong_xx !== null ? tong_xx : "?"}</b>)</div>
        </div>
        <div style="min-width:200px; margin-bottom: 6px;">
            <div class="bar-container">
                <div class="bar-tai" style="width: ${pt}%">${pt}%</div><div class="bar-xiu" style="width: ${px}%">${px}%</div>
            </div>
        </div>
        <div class="pred-grid" style="min-width:200px;">
            <div class="pred-box"><div class="pred-title">📊 DỰ ĐOÁN CHUỖI</div><div class="pred-value ${getMlsClass(kq_chuoi)}">${kq_chuoi}</div></div>
            <div class="pred-box"><div class="pred-title">🎲 DỰ ĐOÁN XÚC XẮC</div><div class="pred-value ${getMlsClass(kq_xx)}">${kq_xx}</div></div>
            <div class="pred-box pred-final"><div class="pred-title">🔥 CHỐT KẾT QUẢ TỔNG HỢP 🔥</div><div class="pred-value ${getMlsClass(ket_qua)}">${ket_qua}</div></div>
        </div>
        <div class="hint-box hide-on-compact" style="min-width:160px;">💡 <b>Gợi ý đánh:</b> <span style="color:#ffd700;">${hideSuggestion ? '— (bị ẩn bởi người dùng)' : goi_y}</span></div>
        <div class="hide-on-compact" style="margin-top:8px; font-size:12px; color:#cfcfcf;">
            <div><b>Tùy chọn đang bật:</b> ${invertChain ? 'Bẻ chuỗi; ' : ''}${invertFinal ? 'Bẻ cuối; ' : ''}${skipDice ? 'Bỏ xúc xắc; ' : ''}${btnInvertAll.classList.contains('active') ? 'Đảo toàn bộ bằng nút; ' : ''}${btnInvertChain.classList.contains('active') ? 'Đảo chuỗi bằng nút; ' : ''}</div>
            <div style="margin-top:6px;"><b>Chú thích:</b> ${annotation ? annotation : '—'}</div>
        </div>
    `;

    if (cau_bip) {
        const warnHtml = document.createElement('div'); warnHtml.className = 'info-row warn-box'; warnHtml.style.border = '1px solid #ffb3b3';
        let more = cau_bip === "Cầu bệt dài bất thường" ? "Gợi ý: Đặt ngược lại hoặc cân nhắc không đặt." : cau_bip === "Cầu nhử đảo 1-1-2" ? "Gợi ý: Đặt theo chu kỳ đảo hoặc bỏ qua." : "Gợi ý: Đặt theo xu hướng mới hoặc chờ thêm kết quả.";
        warnHtml.innerHTML = `<div style="color:#ffdddd; font-weight:bold;">⚠️ CẢNH BÁO: ${cau_bip}</div><div class="hide-on-compact" style="color:#ffd9b3; margin-top:6px;">${more}</div>`;
        resultBox.prepend(warnHtml);
    }
    btn.innerHTML = "🔄 CẬP NHẬT DỮ LIỆU CẦU"; btn.style.opacity = "1";
}

btnInvertAll.addEventListener('click', ()=>{ btnInvertAll.classList.toggle('active'); });
btnInvertChain.addEventListener('click', ()=>{ btnInvertChain.classList.toggle('active'); });

const btnAdvancedToggle = document.getElementById('btn-advanced-toggle');
const advancedSection = document.getElementById('advanced-section');
if(btnAdvancedToggle && advancedSection){
    btnAdvancedToggle.addEventListener('click', ()=>{ const isHidden = advancedSection.style.display === 'none'; advancedSection.style.display = isHidden ? 'block' : 'none'; btnAdvancedToggle.textContent = isHidden ? '⚙ Ẩn nâng cao' : '⚙ Nâng cao'; });
}

const panel = document.getElementById("tool-panel"); const header = document.getElementById("panel-header");
function toggleCompactMode() { panel.classList.toggle('compact-mode'); }
function toggleOrientation() { panel.classList.toggle('horizontal'); const btn = document.getElementById('orientBtn'); if (panel.classList.contains('horizontal')) btn.title = "Chế độ ngang"; else btn.title = "Chế độ dọc"; }
function changeScale(delta) { let current = parseFloat(getComputedStyle(panel).getPropertyValue('--panel-scale')) || 1; let next = Math.min(2, Math.max(0.6, +(current + delta).toFixed(2))); panel.style.setProperty('--panel-scale', next); }
function resetScale() { panel.style.setProperty('--panel-scale', 1); }

let isDragging=false, offsetX=0, offsetY=0;
header.addEventListener('mousedown',(e)=>{ isDragging=true; const rect=panel.getBoundingClientRect(); offsetX = e.clientX - rect.left; offsetY = e.clientY - rect.top; panel.style.right='auto'; });
document.addEventListener('mousemove',(e)=>{ if(!isDragging) return; panel.style.left = (e.clientX - offsetX) + 'px'; panel.style.top = (e.clientY - offsetY) + 'px'; });
document.addEventListener('mouseup',()=>{ isDragging=false; });
header.addEventListener('touchstart',(ev)=>{ const t=ev.touches[0]; isDragging=true; const rect=panel.getBoundingClientRect(); offsetX=t.clientX-rect.left; offsetY=t.clientY-rect.top; panel.style.right='auto'; }, {passive:true});
document.addEventListener('touchmove',(ev)=>{ if(!isDragging) return; const t=ev.touches[0]; panel.style.left=(t.clientX-offsetX)+'px'; panel.style.top=(t.clientY-offsetY)+'px'; }, {passive:true});
document.addEventListener('touchend',()=>{ isDragging=false; });

window.addEventListener('load', ()=> { show(gameSelectOverlay); hide(entryOverlay); hide(toolPanel); hide(gameFrame); toggleBtn.style.display='none'; });
window.addEventListener('resize', ()=> { if(toolPanel.style.display === "none" || toolPanel.getAttribute('aria-hidden') === 'true'){ toggleBtn.style.display = 'block'; } else { toggleBtn.style.display = 'none'; } });
</script>
</body>
</html>
