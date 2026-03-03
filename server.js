const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { MongoClient } = require("mongodb");
const jwt = require("jsonwebtoken");
const crypto = require("crypto"); 

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; 
const ADMIN_ROUTE = process.env.ADMIN_ROUTE || "/vip-9xk2-admin";
const JWT_SECRET = process.env.JWT_SECRET || "chuoi_ky_tu_bi_mat_chi_minh_ban_biet_123456!";

// KEY BẢO MẬT ĐỂ CHỐNG FAKE HWID (Lấy từ Render)
const HWID_SECRET = process.env.HWID_SECRET || "MY_SUPER_SECRET_HWID_KEY_2026"; 

if (!MONGO_URI || !ADMIN_PASSWORD) console.error("❌ THIẾU MONGO_URI HOẶC MẬT KHẨU TRÊN RENDER!");

const client = new MongoClient(MONGO_URI);
let keysCollection;

async function initDB() {
    try {
        await client.connect();
        const db = client.db("vip_tool_db");
        keysCollection = db.collection("keys");
        console.log("✅ Kết nối MongoDB thành công! Đã áp dụng bảo mật HWID.");
    } catch (error) {
        console.error("❌ Lỗi kết nối MongoDB:", error);
    }
}
initDB();

// ================= HÀM LẤY IP & CHỐNG SPAM =================
const getClientIp = (req) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    return ip ? ip.split(',')[0].trim() : 'unknown';
};

const rateLimitMap = new Map();
function antiSpam(req, res, next) {
    const ip = getClientIp(req);
    const now = Date.now();
    if (rateLimitMap.has(ip)) {
        const lastReq = rateLimitMap.get(ip);
        if (now - lastReq < 1500) { 
            return res.json({ success: false, message: "Spam server! Vui lòng thao tác chậm lại." });
        }
    }
    rateLimitMap.set(ip, now);
    next();
}

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

// ================= MIDDLEWARE BẢO MẬT ADMIN =================
function verifyAdmin(req, res, next) {
    const { timestamp, authHash } = req.body;
    if (!timestamp || !authHash) {
        return res.json({ success: false, message: "Yêu cầu không hợp lệ (Thiếu xác thực)!" });
    }
    if (Math.abs(Date.now() - timestamp) > 2 * 60 * 1000) {
        return res.json({ success: false, message: "Yêu cầu đã hết hạn!" });
    }
    const expectedHash = crypto.createHash("sha256").update(ADMIN_PASSWORD + timestamp).digest("hex");
    if (authHash !== expectedHash) {
        return res.json({ success: false, message: "Sai mật khẩu Admin!" });
    }
    next();
}

// ================= KEY SYSTEM =================
app.post("/check-key", antiSpam, async (req, res) => {
    const { key, hwid, game, timestamp, signature } = req.body;
    const clientIp = getClientIp(req);
    
    if (!key || !hwid || !timestamp || !signature) {
        return res.json({ success: false, message: "Yêu cầu không hợp lệ (Thiếu chữ ký bảo mật)" });
    }

    const now = Date.now();
    if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
        return res.json({ success: false, message: "Yêu cầu đã hết hạn (Timestamp invalid)" });
    }

    const expectedSignature = crypto
        .createHmac("sha256", HWID_SECRET)
        .update(hwid + timestamp)
        .digest("hex");

    if (signature !== expectedSignature) {
        return res.json({ success: false, message: "Phát hiện gian lận HWID qua Postman!" });
    }

    if (!keysCollection) return res.json({ success: false, message: "Chưa kết nối DB" });

    const found = await keysCollection.findOne({ key: key });

    if (!found || (found.expire && found.expire <= now)) {
        return res.json({ success: false, message: "Key không tồn tại hoặc hết hạn" });
    }
    
    if (found.game && game && found.game !== game && found.game !== 'all') {
        return res.json({ success: false, message: `Key này không dùng được cho game ${game.toUpperCase()}` });
    }

    if (!Array.isArray(found.hwids)) found.hwids = [];
    const maxDev = found.maxDevices || 1;

    if (found.hwids.includes(hwid) || found.hwids.length < maxDev) {
        if (!found.hwids.includes(hwid)) {
            found.hwids.push(hwid);
            await keysCollection.updateOne({ key: key }, { $set: { hwids: found.hwids } });
        }
        const token = jwt.sign({ key: key, hwid: hwid, game: found.game, ip: clientIp }, JWT_SECRET, { expiresIn: '12h' });
        
        return res.json({ success: true, token: token, expire: found.expire });
    } else {
        return res.json({ success: false, message: `Key đã đạt tối đa ${maxDev} thiết bị` });
    }
});

app.post("/create-key", verifyAdmin, async (req, res) => {
    const { days, maxDevices, game } = req.body;
    const daysNum = parseInt(days) || 1;
    let maxDevNum = parseInt(maxDevices);
    if (isNaN(maxDevNum) || maxDevNum < 1) maxDevNum = 1;
    if (maxDevNum > 100) maxDevNum = 100;
    const newKey = generateKey();
    const keyDoc = { key: newKey, expire: Date.now() + (daysNum * 86400000), hwids: [], maxDevices: maxDevNum, game: game || "lc79" };
    await keysCollection.insertOne(keyDoc);
    res.json({ success: true, ...keyDoc });
});

app.post("/delete-key", verifyAdmin, async (req, res) => {
    await keysCollection.deleteOne({ key: req.body.key });
    res.json({ success: true });
});

app.post("/reset-hwid", verifyAdmin, async (req, res) => {
    await keysCollection.updateOne({ key: req.body.key }, { $set: { hwids: [] } });
    res.json({ success: true });
});

app.post("/admin-keys", verifyAdmin, async (req, res) => {
    res.json(await loadValidKeys());
});


// ================= ẨN TOÀN BỘ LOGIC GAME VÀO SERVER =================

const API_URLS = {
    lc79: {
        normal: "https://wtx.tele68.com/v1/tx/sessions?cp=R&cl=R&pf=web&at=4479e6332082ebf7f206ae3cfcd3ff5e",
        md5: "https://wtxmd52.tele68.com/v1/txmd5/sessions?cp=R&cl=R&pf=web&at=93b3e543d609af0351163f3ff9a2c495"
    },
    xd88: {
        normal: "https://taixiu.system32-cloudfare-356783752985678522.monster/api/luckydice/GetSoiCau",
        md5: "https://taixiumd5.system32-cloudfare-356783752985678522.monster/api/md5luckydice/GetSoiCau"
    },
    betvip: {
        normal: "https://wtx.macminim6.online/v1/tx/sessions?cp=R&cl=R&pf=web&at=f03c4feaa20161043de2006ec62b3439",
        md5: "https://wtxmd52.macminim6.online/v1/txmd5/sessions?cp=R&cl=R&pf=web&at=f03c4feaa20161043de2006ec62b3439"
    },
    sunwin: {
        normal: "https://apisuntcbm.onrender.com/sunlon",
        md5: "https://apisuntcbm.onrender.com/sunlon" 
    }
};

function extractListFromApiResponse(data) {
    if (!data) return [];
    if (Array.isArray(data.list)) return data.list;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.lists)) return data.lists;
    if (Array.isArray(data)) return data; 
    if (data.data && Array.isArray(data.data.list)) return data.data.list;
    return [];
}

function extractDicesFromItem(item) {
    if (!item) return null;
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
    if ('BetSide' in item) return item.BetSide === 0 ? 'T' : 'X';
    const keys = ['resultTruyenThong','result','resultText','result_truyen_thong','result_truyen','ketqua','kq'];
    for (const k of keys) {
        if (k in item && item[k] != null) {
            const v = String(item[k]).toUpperCase();
            if (v.includes('TAI') || v === 'T' || v === 'TÀI' || v === 'TA') return 'T';
            if (v.includes('XIU') || v === 'X' || v === 'XỈU' || v === 'XI') return 'X';
        }
    }
    const dices = extractDicesFromItem(item);
    if (Array.isArray(dices) && dices.length === 3) {
        const sum = dices[0] + dices[1] + dices[2];
        if (!isNaN(sum)) return (sum >= 11 && sum <= 17) ? 'T' : 'X';
    }
    return null;
}

// ================= THUẬT TOÁN NHẬN DIỆN MẪU CẦU MỚI =================
function nhanDienMauCau(chuoi) {
    const str = chuoi.join("");
    const len = str.length;
    if (len < 4) return null;

    const tail4 = str.slice(-4);
    const tail5 = str.slice(-5);
    const tail6 = str.slice(-6);

    // 1. Cầu 1-1 (Ping Pong)
    if (tail6 === "TXTXTX" || tail6 === "XTXTXT") return { ten: "Cầu 1-1 dài", du_doan: str[len-1] === "T" ? "X" : "T", diem: 5 };
    if (tail5 === "TXTXT" || tail5 === "XTXTX") return { ten: "Cầu 1-1", du_doan: str[len-1] === "T" ? "X" : "T", diem: 4 };

    // 2. Cầu 2-2
    if (tail6 === "TTXXTT") return { ten: "Cầu 2-2", du_doan: "X", diem: 4.5 };
    if (tail6 === "XXTTXX") return { ten: "Cầu 2-2", du_doan: "T", diem: 4.5 };
    if (tail5 === "TTXXT") return { ten: "Cầu 2-2", du_doan: "T", diem: 4 };
    if (tail5 === "XXTTX") return { ten: "Cầu 2-2", du_doan: "X", diem: 4 };
    if (tail4 === "TTXX") return { ten: "Cầu 2-2", du_doan: "T", diem: 3 };
    if (tail4 === "XXTT") return { ten: "Cầu 2-2", du_doan: "X", diem: 3 };

    // 3. Cầu 3-3
    if (tail6 === "TTTXXX") return { ten: "Cầu 3-3", du_doan: "T", diem: 4 };
    if (tail6 === "XXXTTT") return { ten: "Cầu 3-3", du_doan: "X", diem: 4 };

    // 4. Cầu 1-2-1
    if (tail5 === "TTXTT") return { ten: "Cầu 1-2-1 gãy", du_doan: "X", diem: 3 };
    if (tail5 === "XXTXX") return { ten: "Cầu 1-2-1 gãy", du_doan: "T", diem: 3 };
    if (tail4 === "TXXT") return { ten: "Cầu 1-2-1", du_doan: "X", diem: 3.5 };
    if (tail4 === "XTTX") return { ten: "Cầu 1-2-1", du_doan: "T", diem: 3.5 };

    // 5. Cầu Tiến Lên 1-2-3 / Lùi 3-2-1
    if (tail6 === "TXXTTT" || tail5 === "XXTTT") return { ten: "Cầu tiến lên", du_doan: "X", diem: 4 };
    if (tail6 === "XTTXXX" || tail5 === "TTXXX") return { ten: "Cầu tiến lên", du_doan: "T", diem: 4 };
    if (tail6 === "TTTXXT") return { ten: "Cầu lùi 3-2-1", du_doan: "X", diem: 4 };
    if (tail6 === "XXXTTX") return { ten: "Cầu lùi 3-2-1", du_doan: "T", diem: 4 };

    // 6. Cầu 1-3-1
    if (tail5 === "TXXXT") return { ten: "Cầu 1-3-1", du_doan: "X", diem: 3 };
    if (tail5 === "XTTTX") return { ten: "Cầu 1-3-1", du_doan: "T", diem: 3 };

    return null;
}

function phatHienCauBip(chuoi){
    const str = chuoi.join("");
    if(str.endsWith("TTTTTT") || str.endsWith("XXXXXX")) return "Cầu bệt dài bất thường";
    if(str.endsWith("TXTXX") || str.endsWith("XTXTT")) return "Cầu nhử đảo 1-1-2";
    if(str.endsWith("TTTTX") || str.endsWith("XXXXT")) return "Cầu vừa bẻ bệt";
    if(str.endsWith("TXXXXX") || str.endsWith("XTTTTT")) return "Bệt bám đuôi";
    return null;
}

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
    let count=0; for(let i=chuoi.length-1;i>=0;i--) { if(chuoi[i]===ky_tu) count++; else break; } return count;
}

function laCauDanXen(chuoi){
    if(chuoi.length<6) return false;
    for(let i=chuoi.length-6;i<chuoi.length-1;i++) if(chuoi[i]===chuoi[i+1]) return false;
    return true;
}

function phanTichChuKy(chuoi){
    for(const l of [5,4,3,2]){
        if(chuoi.length>=2*l && chuoi.slice(-l).join("")===chuoi.slice(-2*l,-l).join("")) return chuoi[chuoi.length-1];
    } return null;
}

function duDoanFull(chuoi){
    const {ptTai, ptXiu} = phanTichChuoiWeighted(chuoi);
    let diem_tai = 0, diem_xiu = 0;
    
    // 1. Phân tích chu kỳ lặp lại cơ bản
    const ck = phanTichChuKy(chuoi);
    if(ck === "T") diem_tai += 2.5; 
    if(ck === "X") diem_xiu += 2.5;

    // 2. Nhận diện mẫu cầu chuyên sâu (MỚI)
    const mauCau = nhanDienMauCau(chuoi);
    if (mauCau) {
        if (mauCau.du_doan === "T") diem_tai += mauCau.diem;
        if (mauCau.du_doan === "X") diem_xiu += mauCau.diem;
    } else {
        // Fallback về cầu đan xen cơ bản nếu không khớp pattern chuyên sâu
        if(laCauDanXen(chuoi)) { 
            if(chuoi[chuoi.length-1] === "T") diem_xiu += 3; else diem_tai += 3; 
        }
    }

    // 3. Xử lý bệt
    const lt_t = demChuoiLienTiep(chuoi, "T"), lt_x = demChuoiLienTiep(chuoi, "X");
    if (lt_t >= 3) { if (lt_t <= 5) diem_tai += 3.5; else if (lt_t >= 7) diem_xiu += 4.5; }
    if (lt_x >= 3) { if (lt_x <= 5) diem_xiu += 3.5; else if (lt_x >= 7) diem_tai += 4.5; }
    
    // 4. Áp dụng trọng số tổng thể
    diem_tai += ptTai / 20; 
    diem_xiu += ptXiu / 20;
    
    let ket_qua = "Không rõ";
    if (Math.abs(diem_tai - diem_xiu) > 0.5) ket_qua = diem_tai > diem_xiu ? "Tài" : "Xỉu";
    
    return { ket_qua, ptTai, ptXiu, cau_bip: phatHienCauBip(chuoi) };
}

app.post("/predict", antiSpam, async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.json({ success: false, message: "Từ chối truy cập!", kicked: true });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const currentIp = getClientIp(req);

        if (decoded.ip && decoded.ip !== currentIp) {
            return res.json({ success: false, message: "❌ Phát hiện dùng chung Token qua mạng khác! Vui lòng đăng nhập lại.", kicked: true });
        }

        if (keysCollection) {
            const dbKey = await keysCollection.findOne({ key: decoded.key });
            if (!dbKey) {
                return res.json({ success: false, message: "❌ Key của bạn đã bị Admin XÓA! Vui lòng thoát.", kicked: true });
            }
            if (dbKey.expire && dbKey.expire <= Date.now()) {
                return res.json({ success: false, message: "❌ Key của bạn đã HẾT HẠN!", kicked: true });
            }
        }

        const { source, seqLength, invertChain, game: clientGame } = req.body;
        
        let gameToFetch = decoded.game || 'lc79';
        if (gameToFetch === 'all') {
            gameToFetch = clientGame || 'lc79';
        }
        
        if (!API_URLS[gameToFetch]) {
            return res.json({ success: false, message: "Game không hợp lệ!" });
        }

        const apiUrl = API_URLS[gameToFetch][source || 'normal'];
        const timestamp = new Date().getTime();
        const fetchUrl = apiUrl + (apiUrl.includes('?') ? '&' : '?') + 'nocache=' + timestamp;
        
        const response = await fetch(fetchUrl);
        const data = await response.json();
        
        let chuoiN = [];
        let lastDice = [];

        if (gameToFetch === 'sunwin') {
            if (!data || !data.pattern) return res.json({success: false, message: "Không lấy được cầu từ Sunwin."});
            
            if (data.xuc_xac_1 && data.xuc_xac_2 && data.xuc_xac_3) {
                lastDice = [Number(data.xuc_xac_1), Number(data.xuc_xac_2), Number(data.xuc_xac_3)];
            }
            
            let p = data.pattern.toUpperCase();
            let selectedItems = p.slice(-(seqLength || 13)).split(''); 
            
            chuoiN = selectedItems.map(c => c === 'T' ? 'T' : 'X');

        } else {
            const list = extractListFromApiResponse(data);
            if (!list || list.length === 0) return res.json({success: false, message: "Không lấy được cầu từ Game."});

            let maxItems = Math.min(seqLength || 13, list.length);
            let ketQuaTuApi = [];
            
            for (let i = 0; i < maxItems; i++) {
                let r = extractResultFromItem(list[i]);
                if (!r) {
                    const dices = extractDicesFromItem(list[i]);
                    if (dices && dices.length===3) {
                        const s = dices[0]+dices[1]+dices[2];
                        r = s >= 11 ? 'T' : 'X';
                    } else r = 'X';
                }
                ketQuaTuApi.push(r);
            }

            chuoiN = ketQuaTuApi.reverse(); 
            const firstItem = list[0];
            lastDice = extractDicesFromItem(firstItem) || [];
        }

        let chainForAnalysis = chuoiN.slice();
        
        if(invertChain) {
            chainForAnalysis = chainForAnalysis.map(c => c === 'T' ? 'X' : (c === 'X' ? 'T' : c));
        }

        const result = duDoanFull(chainForAnalysis);
        
        res.json({ success: true, chuoiN, lastDice, ...result });

    } catch (err) {
        return res.json({ success: false, message: "Phiên đăng nhập lỗi hoặc Server Game đang chặn kết nối.", kicked: true });
    }
});

// ================= ADMIN HTML =================
app.get(ADMIN_ROUTE, (req, res) => {
res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"><title>VIP ADMIN</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js"></script>
<style>body{margin:0;font-family:Segoe UI;background:linear-gradient(135deg,#0f172a,#1e293b);color:white;} .container{max-width:1100px;margin:auto;padding:30px;} .card{backdrop-filter:blur(20px);background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:18px;border-radius:12px;margin-bottom:18px;} .row{display:flex;gap:12px;align-items:center;} input,select{padding:8px;border-radius:8px;border:none;width:100%;margin:5px 0;background:rgba(0,0,0,0.35);color:#fff;} button{padding:8px 14px;border:none;border-radius:8px;cursor:pointer;font-weight:700;} .green{background:#16a34a;} .red{background:#ef4444;color:white;} .blue{background:#2563eb;color:white;} table{width:100%;border-collapse:collapse;margin-top:10px;} th,td{padding:10px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;} .small{font-size:12px;color:#cbd5e1;} .hw-list{font-size:12px;text-align:left;color:#e2e8f0;} .limit-badge{background:rgba(255,255,255,0.04);padding:6px;border-radius:6px;} .game-badge{background:#8b5cf6;padding:4px 8px;border-radius:4px;font-weight:bold;font-size:11px;color:#fff;} .game-xd88{background:#d97706;} .game-betvip{background:#e11d48;} .game-sunwin{background:#c2410c;} .game-all{background:#10b981;}</style>
</head><body>
<div class="container"><h1>🔐 VIP ADMIN PANEL</h1><div class="card"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;"><input type="password" id="password" placeholder="Mật khẩu admin" style="max-width:200px;"><select id="gameSelect" style="max-width:140px;"><option value="lc79">Game: LC79</option><option value="xd88">Game: XOCDIA88</option><option value="betvip">Game: BETVIP</option><option value="sunwin">Game: SUNWIN</option><option value="all">ALL GAMES</option></select><select id="days" style="max-width:140px;"><option value="1">1 Ngày</option><option value="7" selected>7 Ngày</option><option value="30">30 Ngày</option><option value="365">365 Ngày</option></select><div style="display:flex;align-items:center;gap:6px;font-size:14px;">Thiết bị: <input id="maxDevices" type="number" min="1" max="100" value="1" style="width:60px;margin:0;" /></div><button class="green" onclick="createKey()">TẠO KEY</button><div style="flex:1"></div><button class="blue" onclick="loadKeys()">Tải danh sách</button></div><div class="small" style="margin-top:8px;">Nhập mật khẩu Admin an toàn (Chống soi packet).</div></div>
<div class="card"><table><thead><tr><th>Key</th><th>Game</th><th>Hết hạn</th><th>Thiết bị (số / giới hạn)</th><th>Danh sách HWID</th><th>Hành động</th></tr></thead><tbody id="tableBody"><tr><td colspan='6'>Vui lòng nhập mật khẩu Admin và bấm tải danh sách.</td></tr></tbody></table></div></div>
<script>
function getAuthPayload() {
    const password = document.getElementById("password").value;
    if (!password) { alert("Cần nhập mật khẩu Admin!"); return null; }
    const timestamp = Date.now();
    const authHash = CryptoJS.SHA256(password + timestamp).toString();
    return { timestamp, authHash };
}

async function loadKeys(){ 
    const auth = getAuthPayload(); if(!auth) return;
    const res = await fetch("/admin-keys", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(auth)}); 
    const data = await res.json(); 
    if(data.success === false) { alert(data.message); return; } 
    let html=""; data.forEach(k=>{ const expireStr = k.expire ? new Date(k.expire).toLocaleString() : "Không có"; const hwids = Array.isArray(k.hwids) ? k.hwids : (k.hwid ? [k.hwid] : []); const hwCount = hwids.length; let gameClass = ""; let gameName = "LC79"; if(k.game === 'xd88') { gameClass = "game-xd88"; gameName = "XÓC ĐĨA 88"; } else if(k.game === 'betvip') { gameClass = "game-betvip"; gameName = "BETVIP"; } else if(k.game === 'sunwin') { gameClass = "game-sunwin"; gameName = "SUNWIN"; } else if(k.game === 'all') { gameClass = "game-all"; gameName = "ALL GAMES"; } html+=\`<tr><td>\${k.key}</td><td><span class="game-badge \${gameClass}">\${gameName}</span></td><td>\${expireStr}</td><td><span class="limit-badge">\${hwCount} / \${k.maxDevices||1}</span></td><td class="hw-list">\${hwids.length? hwids.join("<br/>") : "<i>Chưa gán</i>"}</td><td><button class="green" onclick="resetKey('\${k.key}')">Reset thiết bị</button> <button class="red" onclick="deleteKey('\${k.key}')">Xóa</button></td></tr>\`; }); document.getElementById("tableBody").innerHTML=html; 
}

async function createKey(){ 
    const days = document.getElementById("days").value; 
    const maxDevices = document.getElementById("maxDevices").value || 1; 
    const game = document.getElementById("gameSelect").value; 
    const auth = getAuthPayload(); if(!auth) return;
    const res = await fetch("/create-key",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...auth, days, maxDevices, game }) }); 
    const data = await res.json(); 
    if(data.success) alert("Tạo thành công: " + data.key + "\\nGame: " + data.game.toUpperCase() + "\\nMax devices: " + data.maxDevices); else alert("Lỗi tạo key: " + (data.message||"Unknown")); loadKeys(); 
}

async function deleteKey(key){ 
    if(!confirm("Xác nhận xóa key " + key + "?")) return; 
    const auth = getAuthPayload(); if(!auth) return;
    await fetch("/delete-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ key, ...auth })}); 
    loadKeys(); 
}

async function resetKey(key){ 
    if(!confirm("Xác nhận reset thiết bị key " + key + "?")) return; 
    const auth = getAuthPayload(); if(!auth) return;
    await fetch("/reset-hwid",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ key, ...auth })}); 
    loadKeys(); 
}
</script></body></html>`);
});

app.listen(PORT, () => {
    console.log("Server chạy tại cổng: " + PORT);
});
