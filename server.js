const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { MongoClient } = require("mongodb");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; 
const ADMIN_ROUTE = process.env.ADMIN_ROUTE || "/vip-9xk2-admin";

// API KEY GEMINI BẠN CẤP
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyDELIGX-4iyh7zAeL1J96AAv_4Pp9VFVVA"; 
const JWT_SECRET = process.env.JWT_SECRET || "chuoi_ky_tu_bi_mat_chi_minh_ban_biet_123456!";

if (!MONGO_URI || !ADMIN_PASSWORD) console.error("❌ THIẾU MONGO_URI HOẶC MẬT KHẨU TRÊN RENDER!");

const client = new MongoClient(MONGO_URI);
let keysCollection;

async function initDB() {
    try {
        await client.connect();
        const db = client.db("vip_tool_db");
        keysCollection = db.collection("keys");
        console.log("✅ Kết nối MongoDB thành công!");
    } catch (error) {
        console.error("❌ Lỗi kết nối MongoDB:", error);
    }
}
initDB();

async function loadValidKeys() {
    if (!keysCollection) return [];
    const now = Date.now();
    let keys = await keysCollection.find({}).toArray();
    const expiredKeys = keys.filter(k => k.expire && k.expire <= now);
    if (expiredKeys.length > 0) {
        const expiredKeyStrings = expiredKeys.map(k => k.key);
        await keysCollection.deleteMany({ key: { $in: expiredKeyStrings } });
    }
    let validKeys = keys.filter(k => !k.expire || k.expire > now).map(k => {
        if (!Array.isArray(k.hwids)) k.hwids = k.hwid ? [k.hwid] : [];
        if (typeof k.maxDevices !== 'number' || isNaN(k.maxDevices) || k.maxDevices < 1) k.maxDevices = 1;
        return k;
    });
    return validKeys;
}

function generateKey() { return "KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase(); }

// ================= KEY SYSTEM =================
app.post("/check-key", async (req, res) => {
    const { key, hwid, game } = req.body;
    if (!key || !hwid) return res.json({ success: false, message: "Thiếu dữ liệu xác thực" });
    if (!keysCollection) return res.json({ success: false, message: "Chưa kết nối DB" });

    const now = Date.now();
    const found = await keysCollection.findOne({ key: key });

    if (!found || (found.expire && found.expire <= now)) return res.json({ success: false, message: "Key không tồn tại hoặc hết hạn" });
    if (found.game && game && found.game !== game) return res.json({ success: false, message: `Key này không dùng được cho game ${game.toUpperCase()}` });

    if (!Array.isArray(found.hwids)) found.hwids = [];
    const maxDev = found.maxDevices || 1;

    if (found.hwids.includes(hwid) || found.hwids.length < maxDev) {
        if (!found.hwids.includes(hwid)) {
            found.hwids.push(hwid);
            await keysCollection.updateOne({ key: key }, { $set: { hwids: found.hwids } });
        }
        const token = jwt.sign({ key: key, hwid: hwid, game: found.game }, JWT_SECRET, { expiresIn: '12h' });
        return res.json({ success: true, token: token });
    } else {
        return res.json({ success: false, message: `Key đã đạt tối đa ${maxDev} thiết bị` });
    }
});

app.post("/create-key", async (req, res) => {
    const { days, password, maxDevices, game } = req.body;
    if (password !== ADMIN_PASSWORD) return res.json({ success: false, message: "Sai mật khẩu" });
    const daysNum = parseInt(days) || 1;
    let maxDevNum = parseInt(maxDevices);
    if (isNaN(maxDevNum) || maxDevNum < 1) maxDevNum = 1;
    if (maxDevNum > 100) maxDevNum = 100;
    const newKey = generateKey();
    const keyDoc = { key: newKey, expire: Date.now() + (daysNum * 86400000), hwids: [], maxDevices: maxDevNum, game: game || "lc79" };
    await keysCollection.insertOne(keyDoc);
    res.json({ success: true, ...keyDoc });
});

app.post("/delete-key", async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.json({ success: false });
    await keysCollection.deleteOne({ key: req.body.key });
    res.json({ success: true });
});

app.post("/reset-hwid", async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.json({ success: false });
    await keysCollection.updateOne({ key: req.body.key }, { $set: { hwids: [] } });
    res.json({ success: true });
});

app.get("/keys", async (req, res) => { res.json(await loadValidKeys()); });

// ================= API GAME & LOGIC =================
const API_URLS = {
    lc79: { normal: "https://wtx.tele68.com/v1/tx/sessions?cp=R&cl=R&pf=web&at=4479e6332082ebf7f206ae3cfcd3ff5e", md5: "https://wtxmd52.tele68.com/v1/txmd5/sessions?cp=R&cl=R&pf=web&at=93b3e543d609af0351163f3ff9a2c495" },
    xd88: { normal: "https://taixiu.system32-cloudfare-356783752985678522.monster/api/luckydice/GetSoiCau", md5: "https://taixiumd5.system32-cloudfare-356783752985678522.monster/api/md5luckydice/GetSoiCau" },
    sunwin_sicbo: { normal: "https://api.wsktnus8.net/v2/history/getLastResult?gameId=ktrng_3979&size=100&tableId=39791215743193&curPage=1", md5: "https://api.wsktnus8.net/v2/history/getLastResult?gameId=ktrng_3979&size=100&tableId=39791215743193&curPage=1" }
};

// CẬP NHẬT: Đã bóc tách chuẩn data.resultList của Sunwin
function extractListFromApiResponse(data) {
    if (!data) return [];
    if (data.data && Array.isArray(data.data.resultList)) return data.data.resultList; // Form chuẩn Sunwin
    if (data.data && Array.isArray(data.data.results)) return data.data.results; 
    if (data.results && Array.isArray(data.results)) return data.results;
    if (Array.isArray(data.list)) return data.list;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.lists)) return data.lists;
    if (Array.isArray(data)) return data; 
    if (data.data && Array.isArray(data.data.list)) return data.data.list;
    return [];
}

// CẬP NHẬT: Đã bóc tách chuẩn 3 hột xúc xắc facesList của Sunwin
function extractDicesFromItem(item) {
    if (!item) return null;
    if (Array.isArray(item.facesList) && item.facesList.length === 3) return item.facesList; // Form chuẩn Sunwin
    if ('dice1' in item && 'dice2' in item && 'dice3' in item) return [Number(item.dice1), Number(item.dice2), Number(item.dice3)]; 
    if ('FirstDice' in item && 'SecondDice' in item && 'ThirdDice' in item) return [Number(item.FirstDice), Number(item.SecondDice), Number(item.ThirdDice)];
    const keys = ['dices','dice','xuc_xac','xucsac','diceValue','dice_values','d'];
    for (const k of keys) {
        if (k in item && Array.isArray(item[k]) && item[k].length === 3) return item[k];
        if (k in item && typeof item[k] === 'string') {
            const parts = item[k].split(/[^0-9]+/).filter(Boolean).map(Number);
            if (parts.length === 3) return parts;
        }
    }
    if (item.detail && Array.isArray(item.detail.dices)) return item.detail.dices;
    return null;
}

function extractResultFromItem(item) {
    if (!item) return null;
    // Sicbo Bão (3 hột giống nhau)
    const dices = extractDicesFromItem(item);
    if (Array.isArray(dices) && dices.length === 3) {
        if (dices[0] === dices[1] && dices[1] === dices[2]) return 'B'; // BÃO
        const sum = dices[0] + dices[1] + dices[2];
        if (!isNaN(sum)) return (sum >= 11 && sum <= 17) ? 'T' : 'X';
    }
    if ('BetSide' in item) return item.BetSide === 0 ? 'T' : 'X';
    const keys = ['resultTruyenThong','result','resultText','result_truyen_thong','result_truyen','ketqua','kq'];
    for (const k of keys) {
        if (k in item && item[k] != null) {
            const v = String(item[k]).toUpperCase();
            if (v.includes('BAO') || v === 'B' || v === 'BÃO') return 'B';
            if (v.includes('TAI') || v === 'T' || v === 'TÀI' || v === 'TA') return 'T';
            if (v.includes('XIU') || v === 'X' || v === 'XỈU' || v === 'XI') return 'X';
        }
    }
    return null;
}

// === LOGIC CŨ CHO LC79 & XÓC ĐĨA (GIỮ NGUYÊN) ===
function phanTichChuoiWeighted(chuoi){ const n = chuoi.length; if (n === 0) return { ptTai: 50, ptXiu: 50 }; const weights = Array.from({length: n}, (_, i) => i + 1); const rev = [...chuoi].reverse(); let tai = 0, xiu = 0; for(let i = 0; i < rev.length; i++){ const weight = weights[n - 1 - i]; if(rev[i] === "T") tai += weight; if(rev[i] === "X") xiu += weight; } const total = weights.reduce((a, b) => a + b, 0); return { ptTai: +(tai / total * 100).toFixed(1), ptXiu: +(xiu / total * 100).toFixed(1) }; }
function demChuoiLienTiep(chuoi, ky_tu){ let count=0; for(let i=chuoi.length-1;i>=0;i--) { if(chuoi[i]===ky_tu) count++; else break; } return count; }
function laCauDanXen(chuoi){ if(chuoi.length<6) return false; for(let i=chuoi.length-6;i<chuoi.length-1;i++) if(chuoi[i]===chuoi[i+1]) return false; return true; }
function phanTichChuKy(chuoi){ for(const l of [5,4,3,2]){ if(chuoi.length>=2*l && chuoi.slice(-l).join("")===chuoi.slice(-2*l,-l).join("")) return chuoi[chuoi.length-1]; } return null; }
function phatHienCauBip(chuoi){ const tail6=chuoi.slice(-6).join(""); if(tail6==="TTTTTT"||tail6==="XXXXXX") return "Cầu bệt dài bất thường"; const tail5 = chuoi.slice(-5).join(""); if (tail5 === "TXTXX" || tail5 === "XTXTT") return "Cầu nhử đảo 1-1-2"; return null; }
function duDoanFull(chuoi){
    const {ptTai, ptXiu} = phanTichChuoiWeighted(chuoi);
    let diem_tai = 0, diem_xiu = 0;
    const ck = phanTichChuKy(chuoi);
    if(ck === "T") diem_tai += 3; if(ck === "X") diem_xiu += 3;
    if(laCauDanXen(chuoi)) { if(chuoi[chuoi.length-1] === "T") diem_xiu += 3; else diem_tai += 3; }
    const lt_t = demChuoiLienTiep(chuoi, "T"), lt_x = demChuoiLienTiep(chuoi, "X");
    if (lt_t >= 3) { if (lt_t <= 5) diem_tai += 3; else if (lt_t >= 7) diem_xiu += 4; }
    if (lt_x >= 3) { if (lt_x <= 5) diem_xiu += 3; else if (lt_x >= 7) diem_tai += 4; }
    diem_tai += ptTai / 20; diem_xiu += ptXiu / 20;
    let ket_qua = "Không rõ"; if (Math.abs(diem_tai - diem_xiu) > 0.5) ket_qua = diem_tai > diem_xiu ? "Tài" : "Xỉu";
    return { ket_qua, ptTai, ptXiu, cau_bip: phatHienCauBip(chuoi) };
}

// === HÀM GỌI GEMINI AI RIÊNG CHO SUNWIN ===
async function duDoanBangAI(chuoi) {
    try {
        const chuoiString = chuoi.join(" - ");
        const promptText = `Tôi đang chơi Sicbo. Kết quả ${chuoi.length} ván gần nhất là (T=Tài, X=Xỉu, B=Bão): ${chuoiString}. 
        Hãy đóng vai siêu AI soi cầu, phân tích quy luật. Tay tiếp theo tỷ lệ ra Tài, Xỉu hay Bão là cao nhất?
        Chỉ trả về định dạng JSON, tuyệt đối không giải thích thêm:
        {"ket_qua": "Tài" hoặc "Xỉu" hoặc "Bão", "ptTai": số %, "ptXiu": số %, "ptBao": số %, "cau_bip": "1 câu khuyên ngắn gọn"}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });

        const data = await response.json();
        let rawText = data.candidates[0].content.parts[0].text;
        rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        
        const finalResult = JSON.parse(rawText);
        return finalResult;
    } catch (e) {
        console.error("Lỗi AI Gemini:", e);
        return { ket_qua: "Không rõ", ptTai: 45, ptXiu: 45, ptBao: 10, cau_bip: "⚠️ AI đang kết nối lại, đánh nhỏ tay này!" };
    }
}

app.post("/predict", async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.json({ success: false, message: "Từ chối truy cập!" });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { source, seqLength, invertChain } = req.body;
        
        const game = decoded.game || 'lc79';
        const apiUrl = API_URLS[game][source || 'normal'];
        
        const timestamp = new Date().getTime();
        const response = await fetch(apiUrl + (apiUrl.includes('?') ? '&' : '?') + 'nocache=' + timestamp);
        const data = await response.json();
        const list = extractListFromApiResponse(data);

        if (!list || list.length === 0) return res.json({success: false, message: "Không lấy được cầu từ Game."});

        // Chỉ cắt đủ số lượng ván (10-15) mà người dùng gửi lên từ Frontend
        let maxItems = Math.min(seqLength || 13, list.length);
        let ketQuaTuApi = [];
        
        for (let i = 0; i < maxItems; i++) {
            let r = extractResultFromItem(list[i]);
            if (!r) {
                const dices = extractDicesFromItem(list[i]);
                if (dices && dices.length===3) {
                    if(dices[0]===dices[1] && dices[1]===dices[2]) r = 'B';
                    else { const s = dices[0]+dices[1]+dices[2]; r = s >= 11 ? 'T' : 'X'; }
                } else r = 'X';
            }
            ketQuaTuApi.push(r);
        }

        let chuoiN = ketQuaTuApi.reverse(); 
        let chainForAnalysis = chuoiN.slice();
        
        if(invertChain) {
            chainForAnalysis = chainForAnalysis.map(c => c === 'T' ? 'X' : (c === 'X' ? 'T' : c));
        }
        
        const firstItem = list[0];
        const lastDice = extractDicesFromItem(firstItem) || [];

        let result;
        if (game === 'sunwin_sicbo') {
            // Ném đúng chuỗi 10-15 ván vào AI
            result = await duDoanBangAI(chainForAnalysis);
        } else {
            result = duDoanFull(chainForAnalysis);
        }
        
        res.json({ success: true, chuoiN, lastDice, ...result });

    } catch (err) {
        return res.json({ success: false, message: "Lỗi kết nối Server hoặc token hết hạn." });
    }
});

// ================= ADMIN HTML =================
app.get(ADMIN_ROUTE, (req, res) => {
res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>VIP ADMIN</title><style>body{margin:0;font-family:Segoe UI;background:linear-gradient(135deg,#0f172a,#1e293b);color:white;} .container{max-width:1100px;margin:auto;padding:30px;} .card{backdrop-filter:blur(20px);background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:18px;border-radius:12px;margin-bottom:18px;} .row{display:flex;gap:12px;align-items:center;} input,select{padding:8px;border-radius:8px;border:none;width:100%;margin:5px 0;background:rgba(0,0,0,0.35);color:#fff;} button{padding:8px 14px;border:none;border-radius:8px;cursor:pointer;font-weight:700;} .green{background:#16a34a;} .red{background:#ef4444;color:white;} .blue{background:#2563eb;color:white;} table{width:100%;border-collapse:collapse;margin-top:10px;} th,td{padding:10px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;} .small{font-size:12px;color:#cbd5e1;} .hw-list{font-size:12px;text-align:left;color:#e2e8f0;} .limit-badge{background:rgba(255,255,255,0.04);padding:6px;border-radius:6px;} .game-badge{background:#8b5cf6;padding:4px 8px;border-radius:4px;font-weight:bold;font-size:11px;color:#fff;} .game-xd88{background:#d97706;} .game-sunwin{background:#e84393;color:#fff;} .game-all{background:#475569;}</style></head><body>
<div class="container"><h1>🔐 VIP ADMIN PANEL</h1><div class="card"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;"><input type="password" id="password" placeholder="Mật khẩu admin" style="max-width:200px;">
    <select id="gameSelect" style="max-width:140px;">
        <option value="lc79">Game: LC79</option>
        <option value="xd88">Game: XOCDIA88</option>
        <option value="sunwin_sicbo">Game: SUNWIN SICBO (AI)</option>
    </select>
    <select id="days" style="max-width:140px;"><option value="1">1 Ngày</option><option value="7" selected>7 Ngày</option><option value="30">30 Ngày</option><option value="365">365 Ngày</option></select><div style="display:flex;align-items:center;gap:6px;font-size:14px;">Thiết bị: <input id="maxDevices" type="number" min="1" max="100" value="1" style="width:60px;margin:0;" /></div><button class="green" onclick="createKey()">TẠO KEY</button><div style="flex:1"></div><button class="blue" onclick="loadKeys()">Tải danh sách</button></div><div class="small" style="margin-top:8px;">Nhập đúng mật khẩu trên Render mới tạo được Key.</div></div>
<div class="card"><table><thead><tr><th>Key</th><th>Game</th><th>Hết hạn</th><th>Thiết bị (số / giới hạn)</th><th>Danh sách HWID</th><th>Hành động</th></tr></thead><tbody id="tableBody"></tbody></table></div></div>
<script>
async function loadKeys(){ const res=await fetch("/keys"); const data=await res.json(); let html=""; data.forEach(k=>{ const expireStr = k.expire ? new Date(k.expire).toLocaleString() : "Không có"; const hwids = Array.isArray(k.hwids) ? k.hwids : (k.hwid ? [k.hwid] : []); const hwCount = hwids.length; let gameClass = "game-all"; let gameName = "ALL (Key Cũ)"; if(k.game === 'lc79') { gameClass = ""; gameName = "LC79"; } else if(k.game === 'xd88') { gameClass = "game-xd88"; gameName = "XÓC ĐĨA 88"; } else if(k.game === 'sunwin_sicbo') { gameClass = "game-sunwin"; gameName = "SUNWIN (AI)"; } html+=\`<tr><td>\${k.key}</td><td><span class="game-badge \${gameClass}">\${gameName}</span></td><td>\${expireStr}</td><td><span class="limit-badge">\${hwCount} / \${k.maxDevices||1}</span></td><td class="hw-list">\${hwids.length? hwids.join("<br/>") : "<i>Chưa gán</i>"}</td><td><button class="green" onclick="resetKey('\${k.key}')">Reset thiết bị</button> <button class="red" onclick="deleteKey('\${k.key}')">Xóa</button></td></tr>\`; }); document.getElementById("tableBody").innerHTML=html; }
async function createKey(){ const days=document.getElementById("days").value; const password=document.getElementById("password").value; const maxDevices=document.getElementById("maxDevices").value || 1; const game=document.getElementById("gameSelect").value; const res=await fetch("/create-key",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({days,password,maxDevices,game}) }); const data=await res.json(); if(data.success) alert("Tạo thành công: " + data.key + "\\nGame: " + data.game.toUpperCase() + "\\nMax devices: " + data.maxDevices); else alert("Lỗi tạo key: " + (data.message||"Unknown")); loadKeys(); }
async function deleteKey(key){ const password=document.getElementById("password").value; if(!password){ alert("Nhập mật khẩu admin"); return; } if(!confirm("Xác nhận xóa key " + key + "?")) return; await fetch("/delete-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key,password})}); loadKeys(); }
async function resetKey(key){ const password=document.getElementById("password").value; if(!password){ alert("Nhập mật khẩu admin"); return; } if(!confirm("Xác nhận reset thiết bị key " + key + "?")) return; await fetch("/reset-hwid",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key,password})}); loadKeys(); }
loadKeys();
</script></body></html>`);
});

app.listen(PORT, () => {
    console.log("Server chạy tại cổng: " + PORT);
});
