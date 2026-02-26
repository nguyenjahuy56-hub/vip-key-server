// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 3000;
const DATA_FILE = path.join(__dirname, "keys.json");

const ADMIN_PASSWORD = "123456";
const ADMIN_ROUTE = "/vip-9xk2-admin";

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

/**
 * loadKeys:
 * - đọc file
 * - migrate: nếu key có 'hwid' (string) -> chuyển thành hwids: [hwid]
 * - nếu thiếu maxDevices -> gán mặc định 1
 * - lọc key đã hết hạn
 * - nếu migrate hoặc có keys hết hạn -> lưu lại file
 */
function loadKeys() {
    let raw = fs.readFileSync(DATA_FILE, "utf8");
    let keys;
    try {
        keys = JSON.parse(raw);
        if (!Array.isArray(keys)) keys = [];
    } catch (e) {
        keys = [];
    }

    const now = Date.now();
    let changed = false;

    // migrate old format -> new format
    keys = keys.map(k => {
        const copy = Object.assign({}, k);
        if (copy.hwid && !copy.hwids) {
            // migrate single hwid to hwids array
            copy.hwids = [copy.hwid];
            delete copy.hwid;
            changed = true;
        }
        if (!Array.isArray(copy.hwids)) {
            copy.hwids = [];
            changed = true;
        }
        if (typeof copy.maxDevices !== 'number' || isNaN(copy.maxDevices) || copy.maxDevices < 1) {
            copy.maxDevices = 1;
            changed = true;
        }
        return copy;
    });

    // filter expired
    const filtered = keys.filter(k => {
        if (!k.expire) return true; // if no expire, keep (optional)
        return k.expire > now;
    });

    if (filtered.length !== keys.length) changed = true;

    if (changed) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(filtered, null, 2), "utf8");
    }

    return filtered;
}

function saveKeys(keys) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(keys, null, 2), "utf8");
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
 *
 * Logic:
 *  - tìm key
 *  - nếu không tồn tại -> fail
 *  - nếu key.hwids contains hwid -> success
 *  - else nếu hwids.length < maxDevices -> push hwid, save -> success
 *  - else -> fail (đạt max thiết bị)
 */
app.post("/check-key", (req, res) => {
    const { key, hwid } = req.body;
    if (!key) return res.json({ success: false, message: "Thiếu key" });
    if (!hwid) return res.json({ success: false, message: "Thiếu hwid" });

    const keys = loadKeys();
    const found = keys.find(k => k.key === key);

    if (!found) return res.json({ success: false, message: "Key không tồn tại" });

    // ensure hwids array present
    if (!Array.isArray(found.hwids)) found.hwids = [];

    if (found.hwids.includes(hwid)) {
        return res.json({ success: true });
    }

    if (found.hwids.length < (found.maxDevices || 1)) {
        found.hwids.push(hwid);
        saveKeys(keys);
        return res.json({ success: true });
    } else {
        return res.json({ success: false, message: `Key đã đạt tối đa ${found.maxDevices} thiết bị` });
    }
});

/**
 * POST /create-key
 * body: { days, password, maxDevices }
 */
app.post("/create-key", (req, res) => {
    const { days, password, maxDevices } = req.body;
    if (password !== ADMIN_PASSWORD)
        return res.json({ success: false, message: "Sai mật khẩu" });

    const daysNum = parseInt(days) || 1;
    let maxDevNum = parseInt(maxDevices);
    if (isNaN(maxDevNum) || maxDevNum < 1) maxDevNum = 1;
    if (maxDevNum > 100) maxDevNum = 100; // safety cap

    const keys = loadKeys();
    const newKey = generateKey();
    const expire = Date.now() + (daysNum * 86400000);

    keys.push({ key: newKey, expire, hwids: [], maxDevices: maxDevNum });
    saveKeys(keys);

    res.json({ success: true, key: newKey, expire, maxDevices: maxDevNum });
});

/**
 * POST /delete-key
 * body: { key, password }
 */
app.post("/delete-key", (req, res) => {
    const { key, password } = req.body;
    if (password !== ADMIN_PASSWORD)
        return res.json({ success: false });

    let keys = loadKeys();
    keys = keys.filter(k => k.key !== key);
    saveKeys(keys);

    res.json({ success: true });
});

/**
 * POST /reset-hwid
 * body: { key, password }
 * -> xóa toàn bộ hwids cho key (reset gán thiết bị)
 */
app.post("/reset-hwid", (req, res) => {
    const { key, password } = req.body;
    if (password !== ADMIN_PASSWORD)
        return res.json({ success: false });

    const keys = loadKeys();
    const found = keys.find(k => k.key === key);
    if (!found) return res.json({ success: false });

    found.hwids = [];
    saveKeys(keys);

    res.json({ success: true });
});

/**
 * (Tùy chọn) POST /remove-hwid
 * body: { key, password, hwid } -> remove single hwid from hwids array
 */
app.post("/remove-hwid", (req, res) => {
    const { key, password, hwid } = req.body;
    if (password !== ADMIN_PASSWORD) return res.json({ success: false });
    if (!key || !hwid) return res.json({ success: false });

    const keys = loadKeys();
    const found = keys.find(k => k.key === key);
    if (!found) return res.json({ success: false });

    if (!Array.isArray(found.hwids)) found.hwids = [];
    found.hwids = found.hwids.filter(h => h !== hwid);
    saveKeys(keys);
    res.json({ success: true });
});

app.get("/keys", (req, res) => {
    // trả đầy đủ: key, expire, hwids, maxDevices
    res.json(loadKeys());
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

app.post("/predict",(req,res)=>{
    const {chuoi,key,hwid} = req.body;

    if(!Array.isArray(chuoi))
        return res.json({success:false, message: "chuoi invalid"});

    const keys = loadKeys();
    const found = keys.find(k => k.key === key);
    if(!found) return res.json({success:false, message: "Key invalid"});

    // validate hwid binding vs maxDevices
    if(!Array.isArray(found.hwids)) found.hwids = [];
    if(found.hwids.length > 0 && !found.hwids.includes(hwid) && found.hwids.length >= (found.maxDevices || 1)) {
        return res.json({ success:false, message: `Key đã đạt tối đa ${found.maxDevices} thiết bị` });
    }
    // if hwid not yet bound and slots available, bind it
    if(hwid && !found.hwids.includes(hwid) && found.hwids.length < (found.maxDevices || 1)) {
        found.hwids.push(hwid);
        saveKeys(keys);
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
        alert("Tạo thành công: " + data.key + "\\nMax devices: " + data.maxDevices);
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
