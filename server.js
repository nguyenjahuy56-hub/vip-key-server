const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { MongoClient } = require("mongodb");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ==========================================
// KÉO BẢO MẬT TỪ BẢNG ENVIRONMENT TRÊN RENDER
// ==========================================
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; 
const ADMIN_ROUTE = process.env.ADMIN_ROUTE || "/vip-9xk2-admin";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

if (!MONGO_URI || !ADMIN_PASSWORD || !GEMINI_API_KEY) {
    console.error("❌ THIẾU MONGO_URI, ADMIN_PASSWORD HOẶC GEMINI_API_KEY TRÊN RENDER!");
}

const client = new MongoClient(MONGO_URI);
let keysCollection;

async function initDB() {
    try {
        await client.connect();
        const db = client.db("vip_tool_db");
        keysCollection = db.collection("keys");
        console.log("✅ Kết nối MongoDB thành công! Đã nạp Gemini AI.");
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

function generateKey() {
    return "KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
}

// ================= KEY SYSTEM (BẢO MẬT GỐC) =================

app.post("/check-key", async (req, res) => {
    const { key, hwid, game } = req.body;
    if (!key) return res.json({ success: false, message: "Thiếu key" });
    if (!hwid) return res.json({ success: false, message: "Thiếu hwid" });
    if (!keysCollection) return res.json({ success: false, message: "Chưa kết nối DB" });

    const now = Date.now();
    const found = await keysCollection.findOne({ key: key });

    if (!found || (found.expire && found.expire <= now)) {
        return res.json({ success: false, message: "Key không tồn tại hoặc hết hạn" });
    }

    if (found.game && game && found.game !== game) {
        return res.json({ success: false, message: `Key này không dùng được cho game ${game.toUpperCase()}` });
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

app.post("/create-key", async (req, res) => {
    const { days, password, maxDevices, game } = req.body;
    if (password !== ADMIN_PASSWORD) return res.json({ success: false, message: "Sai mật khẩu" });
    if (!keysCollection) return res.json({ success: false, message: "Chưa kết nối DB" });

    const daysNum = parseInt(days) || 1;
    let maxDevNum = parseInt(maxDevices);
    if (isNaN(maxDevNum) || maxDevNum < 1) maxDevNum = 1;
    if (maxDevNum > 100) maxDevNum = 100;

    const newKey = generateKey();
    const expire = Date.now() + (daysNum * 86400000);

    const keyDoc = { 
        key: newKey, 
        expire, 
        hwids: [], 
        maxDevices: maxDevNum,
        game: game || "lc79" 
    };
    await keysCollection.insertOne(keyDoc);

    res.json({ success: true, key: newKey, expire, maxDevices: maxDevNum, game: keyDoc.game });
});

app.post("/delete-key", async (req, res) => {
    const { key, password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.json({ success: false });
    if (!keysCollection) return res.json({ success: false });

    await keysCollection.deleteOne({ key: key });
    res.json({ success: true });
});

app.post("/reset-hwid", async (req, res) => {
    const { key, password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.json({ success: false });
    if (!keysCollection) return res.json({ success: false });

    await keysCollection.updateOne({ key: key }, { $set: { hwids: [] } });
    res.json({ success: true });
});

app.get("/keys", async (req, res) => {
    const keys = await loadValidKeys();
    res.json(keys);
});

// ================= FULL AI LOGIC & TỰ HỌC LỖI SAI =================

app.post("/predict", async (req, res) => {
    const { chuoi, key, hwid, lich_su_sai } = req.body;

    if (!Array.isArray(chuoi)) return res.json({ success: false, message: "Chuỗi dữ liệu không hợp lệ" });
    if (!keysCollection) return res.json({ success: false, message: "Server DB chưa sẵn sàng" });

    // 1. Kiểm tra Key và HWID (Giữ bảo mật)
    const found = await keysCollection.findOne({ key: key });
    if (!found || (found.expire && found.expire <= Date.now())) {
        return res.json({ success: false, message: "Key invalid hoặc hết hạn" });
    }

    if (!Array.isArray(found.hwids)) found.hwids = [];
    const maxDev = found.maxDevices || 1;

    if (found.hwids.length > 0 && !found.hwids.includes(hwid) && found.hwids.length >= maxDev) {
        return res.json({ success: false, message: `Key đã đạt tối đa ${maxDev} thiết bị` });
    }
    
    if (hwid && !found.hwids.includes(hwid) && found.hwids.length < maxDev) {
        found.hwids.push(hwid);
        await keysCollection.updateOne({ key: key }, { $set: { hwids: found.hwids } });
    }

    // 2. GỌI AI PHÂN TÍCH CHUỖI VÀ TỰ SỬA SAI
    try {
        let phanTuHoc = "";
        if (lich_su_sai && lich_su_sai.du_doan_cu) {
            phanTuHoc = `LƯU Ý QUAN TRỌNG TỪ HỆ THỐNG: Ở ván trước, bạn đã dự đoán là "${lich_su_sai.du_doan_cu}" nhưng kết quả thực tế lại về "${lich_su_sai.ket_qua_thuc}". Điều này chứng tỏ thuật toán nhận diện nhịp cầu của bạn đang bị nhà cái bẻ. Hãy thay đổi góc nhìn, lật ngược lại tư duy phân tích nhịp cầu ở ván này để sửa sai, tuyệt đối không đi vào lối mòn cũ!`;
        }

        const prompt = `Bạn là hệ thống AI phân tích thống kê xác suất nâng cao trò chơi. 
        Dựa trên chuỗi kết quả lịch sử sau (xếp từ ván cũ nhất đến ván mới nhất): ${chuoi.join(", ")}.
        
        ${phanTuHoc}

        Hãy phân tích quy luật (cầu bệt, cầu nhảy, cầu 1-1, 1-2...) và dự đoán kết quả tiếp theo.
        BẮT BUỘC TRẢ VỀ CHỈ MỘT ĐỐI TƯỢNG JSON ĐÚNG ĐỊNH DẠNG SAU, KHÔNG XUẤT HIỆN BẤT KỲ VĂN BẢN HAY DẤU MARKDOWN NÀO KHÁC BÊN NGOÀI JSON:
        {
            "ket_qua": "Tài" hoặc "Xỉu",
            "ptTai": <tỷ lệ % ra Tài, là số nguyên từ 0 đến 100>,
            "ptXiu": <tỷ lệ % ra Xỉu, là số nguyên từ 0 đến 100>
        }`;

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const aiData = await aiResponse.json();
        
        if (aiData.error) {
            throw new Error(aiData.error.message);
        }

        const textResult = aiData.candidates[0].content.parts[0].text;
        
        // Làm sạch dữ liệu JSON trả về (phòng hờ Gemini kẹp markdown ```json)
        const cleanJson = textResult.replace(/```json/gi, "").replace(/```/gi, "").trim();
        const result = JSON.parse(cleanJson);

        res.json({ success: true, ...result });

    } catch (error) {
        console.error("Lỗi khi gọi AI:", error);
        res.json({ 
            success: true, 
            ket_qua: "Không rõ", 
            ptTai: 50, 
            ptXiu: 50 
        });
    }
});

// ================= ADMIN HTML (GIỮ NGUYÊN GIAO DIỆN ADMIN) =================
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
.game-xd88{background:#d97706;}
.game-all{background:#475569;}
</style>
</head>
<body>
<div class="container">
<h1>🔐 VIP ADMIN PANEL - AI MODE</h1>

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
<div class="small" style="margin-top:8px;">Nhập đúng mật khẩu trên Render mới tạo được Key.</div>
</div>

<div class="card">
<table>
<thead>
<tr>
    <th>Key</th>
    <th>Game</th>
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
        
        let gameClass = "game-all";
        let gameName = "ALL (Key Cũ)";
        if(k.game === 'lc79') { gameClass = ""; gameName = "LC79"; }
        else if(k.game === 'xd88') { gameClass = "game-xd88"; gameName = "XÓC ĐĨA 88"; }

        html+=\`
        <tr>
            <td>\${k.key}</td>
            <td><span class="game-badge \${gameClass}">\${gameName}</span></td>
            <td>\${expireStr}</td>
            <td><span class="limit-badge">\${hwCount} / \${k.maxDevices||1}</span></td>
            <td class="hw-list">\${hwids.length? hwids.join("<br/>") : "<i>Chưa gán</i>"}</td>
            <td>
                <button class="green" onclick="resetKey('\${k.key}')">Reset thiết bị</button>
                <button class="red" onclick="deleteKey('\${k.key}')">Xóa</button>
            </td>
        </tr>\`;
    });

    document.getElementById("tableBody").innerHTML=html;
}

async function createKey(){
    const days=document.getElementById("days").value;
    const password=document.getElementById("password").value;
    const maxDevices=document.getElementById("maxDevices").value || 1;
    const game=document.getElementById("gameSelect").value;

    const res=await fetch("/create-key",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({days,password,maxDevices,game})
    });

    const data=await res.json();
    if(data.success){
        alert("Tạo thành công: " + data.key + "\\nGame: " + data.game.toUpperCase() + "\\nMax devices: " + data.maxDevices);
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
    console.log("Server chạy tại cổng: " + PORT);
});
