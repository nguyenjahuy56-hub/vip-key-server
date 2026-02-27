// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { MongoClient } = require("mongodb");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 3000;

// ==========================================
// MONGODB CONFIG - ĐIỀN MẬT KHẨU VÀO ĐÂY
// ==========================================
const MONGO_URI = "mongodb+srv://nguyenjahuy56_db_user:D1382010@cluster0.siscrvu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
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

const ADMIN_PASSWORD = "123456";
const ADMIN_ROUTE = "/vip-9xk2-admin";

/**
 * Hàm hỗ trợ lấy toàn bộ key hợp lệ (thay thế cho loadKeys cũ)
 * Tự động xóa các key đã hết hạn khỏi DB cho nhẹ
 */
async function loadValidKeys() {
    if (!keysCollection) return [];
    const now = Date.now();
    let keys = await keysCollection.find({}).toArray();

    // Lọc key đã hết hạn và xóa khỏi DB
    const expiredKeys = keys.filter(k => k.expire && k.expire <= now);
    if (expiredKeys.length > 0) {
        const expiredKeyStrings = expiredKeys.map(k => k.key);
        await keysCollection.deleteMany({ key: { $in: expiredKeyStrings } });
    }

    // Fix lỗi data cũ nếu thiếu maxDevices hoặc hwids chưa là array
    let validKeys = keys.filter(k => !k.expire || k.expire > now).map(k => {
        if (!Array.isArray(k.hwids)) k.hwids = k.hwid ? [k.hwid] : [];
        if (typeof k.maxDevices !== 'number' || isNaN(k.maxDevices) || k.maxDevices < 1) k.maxDevices = 1;
        return k;
    });

    return validKeys;
}

function generateKey() {
    return "KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
}

//
// ================= KEY SYSTEM =================
//

/**
 * POST /check-key
 * body: { key, hwid }
 */
app.post("/check-key", async (req, res) => {
    const { key, hwid } = req.body;
    if (!key) return res.json({ success: false, message: "Thiếu key" });
    if (!hwid) return res.json({ success: false, message: "Thiếu hwid" });
    if (!keysCollection) return res.json({ success: false, message: "Chưa kết nối DB" });

    const now = Date.now();
    const found = await keysCollection.findOne({ key: key });

    if (!found || (found.expire && found.expire <= now)) {
        return res.json({ success: false, message: "Key không tồn tại hoặc hết hạn" });
    }

    if (!Array.isArray(found.hwids)) found.hwids = [];
    const maxDev = found.maxDevices || 1;

    if (found.hwids.includes(hwid)) {
        return res.json({ success: true });
    }

    if (found.hwids.length < maxDev) {
        found.hwids.push(hwid);
        await keysCollection.updateOne({ key: key }, { $set: { hwids: found.hwids } });
        return res.json({ success: true });
    } else {
        return res.json({ success: false, message: `Key đã đạt tối đa ${maxDev} thiết bị` });
    }
});

/**
 * POST /create-key
 * body: { days, password, maxDevices }
 */
app.post("/create-key", async (req, res) => {
    const { days, password, maxDevices } = req.body;
    if (password !== ADMIN_PASSWORD)
        return res.json({ success: false, message: "Sai mật khẩu" });
    if (!keysCollection) return res.json({ success: false, message: "Chưa kết nối DB" });

    const daysNum = parseInt(days) || 1;
    let maxDevNum = parseInt(maxDevices);
    if (isNaN(maxDevNum) || maxDevNum < 1) maxDevNum = 1;
    if (maxDevNum > 100) maxDevNum = 100; // safety cap

    const newKey = generateKey();
    const expire = Date.now() + (daysNum * 86400000);

    const keyDoc = { key: newKey, expire, hwids: [], maxDevices: maxDevNum };
    await keysCollection.insertOne(keyDoc);

    res.json({ success: true, key: newKey, expire, maxDevices: maxDevNum });
});

/**
 * POST /delete-key
 * body: { key, password }
 */
app.post("/delete-key", async (req, res) => {
    const { key, password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.json({ success: false });
    if (!keysCollection) return res.json({ success: false });

    await keysCollection.deleteOne({ key: key });
    res.json({ success: true });
});

/**
 * POST /reset-hwid
 * body: { key, password }
 */
app.post("/reset-hwid", async (req, res) => {
    const { key, password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.json({ success: false });
    if (!keysCollection) return res.json({ success: false });

    await keysCollection.updateOne({ key: key }, { $set: { hwids: [] } });
    res.json({ success: true });
});

/**
 * (Tùy chọn) POST /remove-hwid
 */
app.post("/remove-hwid", async (req, res) => {
    const { key, password, hwid } = req.body;
    if (password !== ADMIN_PASSWORD) return res.json({ success: false });
    if (!key || !hwid) return res.json({ success: false });
    if (!keysCollection) return res.json({ success: false });

    const found = await keysCollection.findOne({ key: key });
    if (!found) return res.json({ success: false });

    let hwids = Array.isArray(found.hwids) ? found.hwids : [];
    hwids = hwids.filter(h => h !== hwid);
    await keysCollection.updateOne({ key: key }, { $set: { hwids: hwids } });

    res.json({ success: true });
});

app.get("/keys", async (req, res) => {
    const keys = await loadValidKeys();
    res.json(keys);
});

//
// ================= FULL AI LOGIC (SERVER ONLY) =================
//
function phanTichChuoiWeighted(chuoi){
    const n = chuoi.length;
    const weights = Array.from({length:n}, (_,i)=>Math.pow(2,i));
    const rev = [...chuoi].reverse();

    let tai=0, xiu=0;
    for(let i=0;i<rev.length;i++){
        if(rev[i]==="T") tai+=weights[i];
        if(rev[i]==="X") xiu+=weights[i];
    }

    const total = weights.reduce((a,b)=>a+b,0);

    return {
        ptTai: +(tai/total*100).toFixed(1),
        ptXiu: +(xiu/total*100).toFixed(1)
    };
}

function demChuoiLienTiep(chuoi, ky_tu){
    let count=0;
    for(let i=chuoi.length-1;i>=0;i--){
        if(chuoi[i]===ky_tu) count++;
        else break;
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
    if(tail6==="TTTTTT"||tail6==="XXXXXX")
        return "Cầu bệt dài bất thường";
    const tail5 = chuoi.slice(-5).join("");
    if (tail5 === "TXTXX" || tail5 === "XTXTT") return "Cầu nhử đảo 1-1-2";
    return null;
}

function duDoanFull(chuoi){

    const {ptTai,ptXiu}=phanTichChuoiWeighted(chuoi);

    let diem_tai=0, diem_xiu=0;

    for(let l=7;l>=3;l--){
        if(chuoi.length>=l){
            const tail=chuoi.slice(-l);
            if(tail.every(x=>x==="T")) diem_tai+=(l-2)*2;
            if(tail.every(x=>x==="X")) diem_xiu+=(l-2)*2;
        }
    }

    const ck=phanTichChuKy(chuoi);
    if(ck==="T") diem_tai+=5;
    if(ck==="X") diem_xiu+=5;

    if(laCauDanXen(chuoi)){
        if(chuoi[chuoi.length-1]==="T") diem_xiu+=4;
        else diem_tai+=4;
    }

    const lt_t=demChuoiLienTiep(chuoi,"T");
    const lt_x=demChuoiLienTiep(chuoi,"X");

    if(lt_t>=3) diem_tai+=Math.pow(2,lt_t-2);
    if(lt_x>=3) diem_xiu+=Math.pow(2,lt_x-2);

    diem_tai+=ptTai/10;
    diem_xiu+=ptXiu/10;

    let ket_qua="Không rõ";
    if(diem_tai>diem_xiu+1) ket_qua="Tài";
    else if(diem_xiu>diem_tai+1) ket_qua="Xỉu";

    return {
        ket_qua,
        ptTai,
        ptXiu,
        cau_bip: phatHienCauBip(chuoi)
    };
}

app.post("/predict", async (req, res) => {
    const {chuoi,key,hwid} = req.body;

    if(!Array.isArray(chuoi)) return res.json({success:false, message: "chuoi invalid"});
    if(!keysCollection) return res.json({success:false, message: "Server DB chưa sẵn sàng"});

    const found = await keysCollection.findOne({ key: key });
    if(!found || (found.expire && found.expire <= Date.now())) {
        return res.json({success:false, message: "Key invalid hoặc hết hạn"});
    }

    // validate hwid binding vs maxDevices
    if(!Array.isArray(found.hwids)) found.hwids = [];
    const maxDev = found.maxDevices || 1;

    if(found.hwids.length > 0 && !found.hwids.includes(hwid) && found.hwids.length >= maxDev) {
        return res.json({ success:false, message: `Key đã đạt tối đa ${maxDev} thiết bị` });
    }
    // if hwid not yet bound and slots available, bind it
    if(hwid && !found.hwids.includes(hwid) && found.hwids.length < maxDev) {
        found.hwids.push(hwid);
        await keysCollection.updateOne({ key: key }, { $set: { hwids: found.hwids } });
    }

    const result = duDoanFull(chuoi);

    res.json({ success:true, ...result });
});

//
// ================= ADMIN HTML =================
//
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
</style>
</head>
<body>
<div class="container">
<h1>🔐 VIP ADMIN PANEL</h1>

<div class="card">
<div style="display:flex;gap:12px;align-items:center;">
    <input type="password" id="password" placeholder="Mật khẩu admin" style="max-width:260px;">
    <select id="days" style="max-width:160px;">
        <option value="1">1 Ngày</option>
        <option value="7" selected>7 Ngày</option>
        <option value="30">30 Ngày</option>
        <option value="365">365 Ngày</option>
    </select>
    <input id="maxDevices" type="number" min="1" max="100" value="1" style="width:120px;" />
    <button class="green" onclick="createKey()">TẠO KEY</button>
    <div style="flex:1"></div>
    <button class="blue" onclick="loadKeys()">Tải danh sách</button>
</div>
<div class="small" style="margin-top:8px;">Khi tạo key, đặt số thiết bị tối đa được phép dùng (max devices). Mặc định 1.</div>
</div>

<div class="card">
<table>
<thead>
<tr>
    <th>Key</th>
    <th>Hết hạn</th>
    <th>Thiết bị (số / giới hạn)</th>
    <th>Danh sách HWID</th>
    <th>Hành động</th>
</tr>
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
        const expireStr = k.expire ? new Date(k.expire).toLocaleString() : "Không có";
        const hwids = Array.isArray(k.hwids) ? k.hwids : (k.hwid ? [k.hwid] : []);
        const hwCount = hwids.length;
        html+=\`
        <tr>
            <td>\${k.key}</td>
            <td>\${expireStr}</td>
            <td><span class="limit-badge">\${hwCount} / \${k.maxDevices||1}</span></td>
            <td class="hw-list">\${hwids.length? hwids.join("<br/>") : "<i>Chưa gán</i>"}</td>
            <td>
                <button class="green" onclick="resetKey('\${k.key}')">Reset (Xóa tất cả thiết bị)</button>
                <button class="red" onclick="deleteKey('\${k.key}')">Xóa Key</button>
            </td>
        </tr>\`;
    });

    document.getElementById("tableBody").innerHTML=html;
}

async function createKey(){
    const days=document.getElementById("days").value;
    const password=document.getElementById("password").value;
    const maxDevices=document.getElementById("maxDevices").value || 1;

    const res=await fetch("/create-key",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({days,password,maxDevices})
    });

    const data=await res.json();
    if(data.success){
        alert("Tạo thành công: " + data.key + "\\\\nMax devices: " + data.maxDevices);
    } else {
        alert("Lỗi tạo key: " + (data.message||"Unknown"));
    }
    loadKeys();
}

async function deleteKey(key){
    const password=document.getElementById("password").value;
    if(!password){ alert("Nhập mật khẩu admin"); return; }
    if(!confirm("Xác nhận xóa key " + key + "?")) return;
    await fetch("/delete-key",{method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({key,password})});
    loadKeys();
}

async function resetKey(key){
    const password=document.getElementById("password").value;
    if(!password){ alert("Nhập mật khẩu admin"); return; }
    if(!confirm("Xác nhận reset (xóa toàn bộ thiết bị) cho key " + key + "?")) return;
    await fetch("/reset-hwid",{method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({key,password})});
    loadKeys();
}

loadKeys();
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
    console.log("Server chạy tại http://localhost:" + PORT);
    console.log("Admin tại: http://localhost:" + PORT + ADMIN_ROUTE);
});
