const express = require("express");

const cors = require("cors");

const bodyParser = require("body-parser");

const { MongoClient } = require("mongodb");

const app = express();

app.use(cors());

app.use(bodyParser.json());

// --- CONFIG ---
const PORT = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGO_URI;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; 

const ADMIN_ROUTE = process.env.ADMIN_ROUTE || "";

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

// --- EXTRACTION LOGIC (CỦA DŨNG) ---
function extractListFromApiResponse(data) {
    if (!data) return [];
    if (Array.isArray(data.list)) return data.list;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data)) return data; 
    if (data.data && Array.isArray(data.data.list)) return data.data.list;
    return [];
}

function extractResultFromItem(item) {
    if (!item) return null;
    if ('BetSide' in item) return item.BetSide === 0 ? 'T' : 'X';
    const keys = ['resultTruyenThong','result','resultText','ketqua','kq'];
    for (const k of keys) {
        if (k in item && item[k] !== undefined && item[k] !== null) {
            const v = String(item[k]).toUpperCase();
            if (v.includes('TAI') || v === 'T' || v === 'TÀI') return 'T';
            if (v.includes('XIU') || v === 'X' || v === 'XỈU') return 'X';
        }
    }
    return null;
}

function extractDicesFromItem(item) {
    if (!item) return null;
    if ('FirstDice' in item && 'SecondDice' in item && 'ThirdDice' in item) {
        return [Number(item.FirstDice), Number(item.SecondDice), Number(item.ThirdDice)];
    }
    if (item.detail && Array.isArray(item.detail.dices)) return item.detail.dices;
    return null;
}

// --- AI PREDICTION LOGIC (GIỮ NGUYÊN 100%) ---
function phanTichChuoiWeighted(chuoi){
    const n = chuoi.length;
    if (n === 0) return { ptTai: 50, ptXiu: 50 };
    const weights = Array.from({length: n}, (_, i) => i + 1);
    const rev = [...chuoi].reverse();
    let tai = 0, xiu = 0;
    for(let i = 0; i < rev.length; i++){
        const weight = weights[n - 1 - i];
        if(rev[i] === "T") tai += weight;
        if(rev[i] === "X") xiu += weight;
    }
    const total = weights.reduce((a, b) => a + b, 0);
    return { ptTai: +(tai / total * 100).toFixed(1), ptXiu: +(xiu / total * 100).toFixed(1) };
}

function demChuoiLienTiep(chuoi, ky_tu){
    let count=0;
    for(let i=chuoi.length-1;i>=0;i--){
        if(chuoi[i]===ky_tu) count++; else break;
    }
    return count;
}

function laCauDanXen(chuoi){
    if(chuoi.length<6) return false;
    for(let i=chuoi.length-6;i<chuoi.length-1;i++){
        if(chuoi[i]===chuoi[i+1]) return false;
    }
    return true;
}

function phanTichChuKy(chuoi){
    const Ls=[5,4,3,2];
    for(const l of Ls){
        if(chuoi.length>=2*l){
            const a=chuoi.slice(-l).join("");
            const b=chuoi.slice(-2*l,-l).join("");
            if(a===b) return chuoi[chuoi.length-1];
        }
    }
    return null;
}

function phatHienCauBip(chuoi){
    const tail6=chuoi.slice(-6).join("");
    if(tail6==="TTTTTT"||tail6==="XXXXXX") return "Cầu bệt dài bất thường";
    const tail5 = chuoi.slice(-5).join("");
    if (tail5 === "TXTXX" || tail5 === "XTXTT") return "Cầu nhử đảo 1-1-2";
    return null;
}

function duDoanFull(chuoi){
    const {ptTai, ptXiu} = phanTichChuoiWeighted(chuoi);
    let diem_tai = 0, diem_xiu = 0;
    const ck = phanTichChuKy(chuoi);
    if(ck === "T") diem_tai += 3;
    if(ck === "X") diem_xiu += 3;
    if(laCauDanXen(chuoi)){
        if(chuoi[chuoi.length-1] === "T") diem_xiu += 3;
        else diem_tai += 3;
    }
    const lt_t = demChuoiLienTiep(chuoi, "T");
    const lt_x = demChuoiLienTiep(chuoi, "X");
    const MAX_STREAK_THUAN = 5;
    if (lt_t >= 3) {
        if (lt_t <= MAX_STREAK_THUAN) diem_tai += 3;
        else if (lt_t >= 7) diem_xiu += 4;
    }
    if (lt_x >= 3) {
        if (lt_x <= MAX_STREAK_THUAN) diem_xiu += 3;
        else if (lt_x >= 7) diem_tai += 4;
    }
    diem_tai += ptTai / 20;
    diem_xiu += ptXiu / 20;
    let ket_qua = "Không rõ";
    if (Math.abs(diem_tai - diem_xiu) > 0.5) {
        if(diem_tai > diem_xiu) ket_qua = "Tài";
        else ket_qua = "Xỉu";
    }
    return { ket_qua, ptTai, ptXiu, cau_bip: phatHienCauBip(chuoi) };
}

// --- ENDPOINT DỰ ĐOÁN (ĐỒNG BỘ VỚI INDEX.HTML) ---
app.post("/predict", async (req, res) => {
    const { key, hwid, game, source, seqLen } = req.body;
    
    if (!key || !hwid) return res.json({ success: false, message: "Thiếu thông tin xác thực" });

    const found = await keysCollection.findOne({ key: key });
    
    if (!found || (found.expire && found.expire <= Date.now())) {
        return res.json({ success: false, message: "Key lậu hoặc hết hạn" });
    }

    if (found.game && game && found.game !== game) {
        return res.json({ success: false, message: `Key không dùng được cho \${game.toUpperCase()}` });
    }

    if (Array.isArray(found.hwids) && found.hwids.length >= (found.maxDevices || 1) && !found.hwids.includes(hwid)) {
        return res.json({ success: false, message: "Hết lượt dùng máy" });
    }

    if (hwid && !found.hwids.includes(hwid)) {
        await keysCollection.updateOne({ key: key }, { $push: { hwids: hwid } });
    }

    let API_URL = "";
    if (game === 'lc79') {
        API_URL = (source === 'md5') 
            ? "https://wtxmd52.tele68.com/v1/txmd5/sessions?cp=R&cl=R&pf=web&at=93b3e543d609af0351163f3ff9a2c495"
            : "https://wtx.tele68.com/v1/tx/sessions?cp=R&cl=R&pf=web&at=4479e6332082ebf7f206ae3cfcd3ff5e";
    } else {
        API_URL = (source === 'md5')
            ? "https://taixiumd5.system32-cloudfare-356783752985678522.monster/api/md5luckydice/GetSoiCau"
            : "https://taixiu.system32-cloudfare-356783752985678522.monster/api/luckydice/GetSoiCau";
    }

    try {
        const response = await fetch(API_URL, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });
        const data = await response.json();
        const list = extractListFromApiResponse(data);
        if (!list.length) return res.json({ success: false, message: "Không lấy được dữ liệu" });

        let ketQuaTuApi = [];
        let limit = parseInt(seqLen) || 13;
        for (let i = 0; i < Math.min(limit, list.length); i++) {
            let r = extractResultFromItem(list[i]);
            if (r) ketQuaTuApi.push(r);
        }

        const chuoiN = ketQuaTuApi.reverse();
        const lastDice = extractDicesFromItem(list[0]) || [];
        const result = duDoanFull(chuoiN);

        res.json({ success: true, chuoi: chuoiN.join(""), lastDice, ...result });
    } catch (err) {
        res.json({ success: false, message: "Lỗi kết nối Game API" });
    }
});

// --- QUẢN LÝ KEY (GIỮ NGUYÊN) ---
app.post("/check-key", async (req, res) => {
    const { key, hwid, game } = req.body;
    const found = await keysCollection.findOne({ key: key });
    if (!found || (found.expire && found.expire <= Date.now())) return res.json({ success: false, message: "Key hỏng" });
    if (!found.hwids.includes(hwid) && found.hwids.length >= (found.maxDevices || 1)) return res.json({ success: false, message: "Hết slot" });
    if (!found.hwids.includes(hwid)) await keysCollection.updateOne({ key: key }, { $push: { hwids: hwid } });
    res.json({ success: true });
});

app.post("/create-key", async (req, res) => {
    const { days, password, maxDevices, game } = req.body;
    if (password !== ADMIN_PASSWORD) return res.json({ success: false, message: "Sai pass" });
    const newKey = "KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
    await keysCollection.insertOne({ key: newKey, expire: Date.now() + (parseInt(days) * 86400000), hwids: [], maxDevices: parseInt(maxDevices) || 1, game: game || "lc79" });
    res.json({ success: true, key: newKey });
});

app.post("/delete-key", async (req, res) => {
    const { key, password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.json({ success: false });
    await keysCollection.deleteOne({ key: key });
    res.json({ success: true });
});

app.post("/reset-hwid", async (req, res) => {
    const { key, password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.json({ success: false });
    await keysCollection.updateOne({ key: key }, { $set: { hwids: [] } });
    res.json({ success: true });
});

app.get("/keys", async (req, res) => {
    const now = Date.now();
    let keys = await keysCollection.find({}).toArray();
    res.json(keys.filter(k => !k.expire || k.expire > now));
});

// --- ADMIN PANEL (GIỮ NGUYÊN 100% GIAO DIỆN) ---
app.get(ADMIN_ROUTE, (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>VIP ADMIN</title>
<style>
body{margin:0;font-family:Segoe UI;background:linear-gradient(135deg,#0f172a,#1e293b);color:white;}
.container{max-width:1100px;margin:auto;padding:30px;}
.card{backdrop-filter:blur(20px);background:rgba(255,255,255,0.04);
border:1px solid rgba(255,255,255,0.08);padding:18px;border-radius:12px;margin-bottom:18px;}
.row{display:flex;gap:12px;align-items:center;}
input,select{padding:8px;border-radius:8px;border:none;width:100%;margin:5px 0;background:rgba(0,0,0,0.35);color:#fff;}
button{padding:8px 14px;border:none;border-radius:8px;cursor:pointer;font-weight:700;}
.green{background:#16a34a;} .red{background:#ef4444;color:white;} .blue{background:#2563eb;color:white;}
table{width:100%;border-collapse:collapse;margin-top:10px;}
th,td{padding:10px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;}
.small{font-size:12px;color:#cbd5e1;}
.hw-list{font-size:12px;text-align:left;color:#e2e8f0;}
.limit-badge{background:rgba(255,255,255,0.04);padding:6px;border-radius:6px;}
.game-badge{background:#8b5cf6;padding:4px 8px;border-radius:4px;font-weight:bold;font-size:11px;color:#fff;}
</style>
</head>
<body>
<div class="container">
<h1>🔐 VIP ADMIN PANEL</h1>
<div class="card">
<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
    <input type="password" id="password" placeholder="Mật khẩu admin" style="max-width:200px;">
    <select id="gameSelect" style="max-width:140px;">
        <option value="lc79">Game: LC79</option>
        <option value="xd88">Game: XOCDIA88</option>
    </select>
    <select id="days" style="max-width:140px;">
        <option value="1">1 Ngày</option>
        <option value="7" selected>7 Ngày</option>
        <option value="30">30 Ngày</option>
        <option value="365">365 Ngày</option>
    </select>
    <div style="display:flex;align-items:center;gap:6px;font-size:14px;">Thiết bị: <input id="maxDevices" type="number" min="1" max="100" value="1" style="width:60px;margin:0;" /></div>
    <button class="green" onclick="createKey()">TẠO KEY</button>
    <div style="flex:1"></div>
    <button class="blue" onclick="loadKeys()">Tải danh sách</button>
</div>
</div>
<div class="card">
<table>
<thead>
<tr><th>Key</th><th>Game</th><th>Hết hạn</th><th>Thiết bị</th><th>Danh sách HWID</th><th>Hành động</th></tr>
</thead>
<tbody id="tableBody"></tbody>
</table>
</div>
</div>
<script>
async function loadKeys(){
    const res=await fetch("/keys");
    const data=await res.json();
    let html="";
    data.forEach(k=>{
        const expireStr = k.expire ? new Date(k.expire).toLocaleString() : "N/A";
        const hwids = Array.isArray(k.hwids) ? k.hwids : [];
        let gameName = k.game === 'lc79' ? 'LC79' : 'XOCDIA88';
        html+=\`<tr>
            <td>\${k.key}</td>
            <td><span class="game-badge">\${gameName}</span></td>
            <td>\${expireStr}</td>
            <td><span class="limit-badge">\${hwids.length}/\${k.maxDevices}</span></td>
            <td class="hw-list">\${hwids.join("<br/>") || "Trống"}</td>
            <td>
                <button class="green" onclick="resetKey('\${k.key}')">Reset</button>
                <button class="red" onclick="deleteKey('\${k.key}')">Xóa</button>
            </td>
        </tr>\`;
    });
    document.getElementById("tableBody").innerHTML=html;
}
async function createKey(){
    const days=document.getElementById("days").value;
    const password=document.getElementById("password").value;
    const maxDevices=document.getElementById("maxDevices").value;
    const game=document.getElementById("gameSelect").value;
    const res=await fetch("/create-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({days,password,maxDevices,game})});
    const data=await res.json();
    if(data.success) alert("Key: " + data.key);
    else alert("Lỗi: " + data.message);
    loadKeys();
}
async function deleteKey(key){
    const password=document.getElementById("password").value;
    if(confirm("Xóa?")) await fetch("/delete-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key,password})});
    loadKeys();
}
async function resetKey(key){
    const password=document.getElementById("password").value;
    await fetch("/reset-hwid",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key,password})});
    loadKeys();
}
loadKeys();
</script>
</body>
</html>\`);
});

app.listen(PORT, () => console.log("Server running on port: " + PORT));
