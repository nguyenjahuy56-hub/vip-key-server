const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 3000;
const DATA_FILE = "keys.json";

// ======= CẤU HÌNH =======
const ADMIN_PASSWORD = "123456"; // đổi mật khẩu
const ADMIN_ROUTE = "/vip-9xk2-admin"; // đổi link bí mật ở đây

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

function loadKeys() {
    const keys = JSON.parse(fs.readFileSync(DATA_FILE));
    const now = Date.now();

    // tự xoá key hết hạn
    const filtered = keys.filter(k => k.expire > now);

    if (filtered.length !== keys.length) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(filtered, null, 2));
    }

    return filtered;
}

function saveKeys(keys) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(keys, null, 2));
}

function generateKey() {
    return "KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
}

//
// ================= CHECK KEY =================
//
app.post("/check-key", (req, res) => {
    const { key, hwid } = req.body;
    const keys = loadKeys();

    const found = keys.find(k => k.key === key);
    if (!found) return res.json({ success: false, message: "Key không tồn tại" });

    if (!found.hwid) {
        found.hwid = hwid;
        saveKeys(keys);
    } else if (found.hwid !== hwid) {
        return res.json({ success: false, message: "Key đã dùng trên thiết bị khác" });
    }

    res.json({ success: true, message: "Key hợp lệ" });
});

//
// ================= RESET HWID =================
//
app.post("/reset-hwid", (req, res) => {
    const { key, password } = req.body;
    if (password !== ADMIN_PASSWORD)
        return res.json({ success: false, message: "Sai mật khẩu" });

    const keys = loadKeys();
    const found = keys.find(k => k.key === key);
    if (!found) return res.json({ success: false, message: "Không tìm thấy key" });

    found.hwid = null;
    saveKeys(keys);

    res.json({ success: true, message: "Đã reset thiết bị" });
});

//
// ================= CREATE KEY =================
//
app.post("/create-key", (req, res) => {
    const { days, password } = req.body;
    if (password !== ADMIN_PASSWORD)
        return res.json({ success: false, message: "Sai mật khẩu" });

    const keys = loadKeys();
    const newKey = generateKey();
    const expire = Date.now() + (parseInt(days) * 24 * 60 * 60 * 1000);

    keys.push({ key: newKey, expire, hwid: null });
    saveKeys(keys);

    res.json({ success: true, key: newKey, expire });
});

//
// ================= DELETE KEY =================
//
app.post("/delete-key", (req, res) => {
    const { key, password } = req.body;
    if (password !== ADMIN_PASSWORD)
        return res.json({ success: false, message: "Sai mật khẩu" });

    let keys = loadKeys();
    keys = keys.filter(k => k.key !== key);
    saveKeys(keys);

    res.json({ success: true, message: "Đã xoá key" });
});

//
// ================= GET KEYS =================
//
app.get("/keys", (req, res) => {
    const keys = loadKeys();
    res.json(keys);
});

//
// ================= ADMIN PAGE (GLASS UI) =================
//
app.get(ADMIN_ROUTE, (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>VIP Admin</title>
<style>
body{
    margin:0;
    font-family:Segoe UI;
    background:linear-gradient(135deg,#0f172a,#1e293b);
    color:white;
}
.container{
    max-width:1000px;
    margin:auto;
    padding:40px;
}
.card{
    backdrop-filter:blur(20px);
    background:rgba(255,255,255,0.05);
    border:1px solid rgba(255,255,255,0.1);
    padding:20px;
    border-radius:15px;
    margin-bottom:25px;
}
input,select{
    padding:8px;
    border-radius:8px;
    border:none;
    width:100%;
    margin:5px 0;
}
button{
    padding:8px 15px;
    border:none;
    border-radius:8px;
    cursor:pointer;
    font-weight:bold;
}
.green{background:#22c55e;}
.red{background:#ef4444;color:white;}
.blue{background:#3b82f6;color:white;}
table{
    width:100%;
    border-collapse:collapse;
}
th,td{
    padding:8px;
    text-align:center;
    border-bottom:1px solid rgba(255,255,255,0.1);
}
.stats{
    display:flex;
    justify-content:space-between;
}
</style>
</head>
<body>
<div class="container">

<h1>🔐 VIP ADMIN PANEL</h1>

<div class="card stats">
    <div>Tổng key: <span id="total">0</span></div>
    <div>Key đang active: <span id="active">0</span></div>
</div>

<div class="card">
    <h3>Tạo Key</h3>
    <input type="password" id="password" placeholder="Mật khẩu admin">
    <select id="days">
        <option value="1">1 Ngày</option>
        <option value="7">7 Ngày</option>
        <option value="30">30 Ngày</option>
    </select>
    <button class="green" onclick="createKey()">TẠO KEY</button>
    <p id="createMsg"></p>
</div>

<div class="card">
    <h3>Danh sách Key</h3>
    <button class="blue" onclick="loadKeys()">Tải danh sách</button>
    <table>
        <thead>
            <tr>
                <th>Key</th>
                <th>Hết hạn</th>
                <th>Thiết bị</th>
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

    document.getElementById("total").innerText=data.length;

    let active=0;
    let html="";
    data.forEach(k=>{
        active++;
        html+=\`
        <tr>
            <td>\${k.key}</td>
            <td>\${new Date(k.expire).toLocaleString()}</td>
            <td>\${k.hwid||"Chưa gán"}</td>
            <td>
                <button class="blue" onclick="resetKey('\${k.key}')">Reset</button>
                <button class="red" onclick="deleteKey('\${k.key}')">Xóa</button>
            </td>
        </tr>\`;
    });

    document.getElementById("active").innerText=active;
    document.getElementById("tableBody").innerHTML=html;
}

async function createKey(){
    const days=document.getElementById("days").value;
    const password=document.getElementById("password").value;

    const res=await fetch("/create-key",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({days,password})
    });

    const data=await res.json();
    document.getElementById("createMsg").innerText=data.message||data.key;
    loadKeys();
}

async function deleteKey(key){
    const password=document.getElementById("password").value;

    await fetch("/delete-key",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({key,password})
    });

    loadKeys();
}

async function resetKey(key){
    const password=document.getElementById("password").value;

    await fetch("/reset-hwid",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({key,password})
    });

    loadKeys();
}

loadKeys();
</script>
</body>
</html>
`);
});

app.listen(PORT, () => {
    console.log("Server chạy tại http://localhost:" + PORT);
    console.log("Admin bí mật tại: http://localhost:" + PORT + ADMIN_ROUTE);
});