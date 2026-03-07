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

function generateKey() { return "KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase(); }

function verifyAdmin(req, res, next) {
    const { timestamp, authHash } = req.body;
    if (!timestamp || !authHash) return res.json({ success: false, message: "Yêu cầu không hợp lệ!" });
    if (Math.abs(Date.now() - timestamp) > 2 * 60 * 1000) return res.json({ success: false, message: "Yêu cầu đã hết hạn!" });
    const expectedHash = crypto.createHash("sha256").update(ADMIN_PASSWORD + timestamp).digest("hex");
    if (authHash !== expectedHash) return res.json({ success: false, message: "Sai mật khẩu Admin!" });
    next();
}

app.post("/check-key", antiSpam, async (req, res) => {
    const { key, hwid, game, timestamp, signature } = req.body;
    const clientIp = getClientIp(req);
    if (!key || !hwid || !timestamp || !signature) return res.json({ success: false, message: "Yêu cầu không hợp lệ" });
    const now = Date.now();
    if (Math.abs(now - timestamp) > 5 * 60 * 1000) return res.json({ success: false, message: "Yêu cầu đã hết hạn" });
    const expectedSignature = crypto.createHmac("sha256", HWID_SECRET).update(hwid + timestamp).digest("hex");
    if (signature !== expectedSignature) return res.json({ success: false, message: "Phát hiện gian lận HWID!" });
    if (!keysCollection) return res.json({ success: false, message: "Chưa kết nối DB" });
    const found = await keysCollection.findOne({ key: key });
    if (!found || (found.expire && found.expire <= now)) return res.json({ success: false, message: "Key không tồn tại hoặc hết hạn" });
    if (found.game && game && found.game !== game && found.game !== 'all') return res.json({ success: false, message: `Key sai game` });
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
        return res.json({ success: false, message: `Key đã đạt tối đa thiết bị` });
    }
});

app.post("/create-key", verifyAdmin, async (req, res) => {
    const { days, maxDevices, game } = req.body;
    const daysNum = parseInt(days) || 1;
    let maxDevNum = parseInt(maxDevices) || 1;
    const newKey = generateKey();
    const keyDoc = { key: newKey, expire: Date.now() + (daysNum * 86400000), hwids: [], maxDevices: maxDevNum, game: game || "lc79" };
    await keysCollection.insertOne(keyDoc);
    res.json({ success: true, ...keyDoc });
});

app.post("/delete-key", verifyAdmin, async (req, res) => { await keysCollection.deleteOne({ key: req.body.key }); res.json({ success: true }); });
app.post("/reset-hwid", verifyAdmin, async (req, res) => { await keysCollection.updateOne({ key: req.body.key }, { $set: { hwids: [] } }); res.json({ success: true }); });
app.post("/admin-keys", verifyAdmin, async (req, res) => { res.json(await loadValidKeys()); });

const API_URLS = {
    lc79: { normal: "https://wtx.tele68.com/v1/tx/sessions?cp=R&cl=R&pf=web&at=4479e6332082ebf7f206ae3cfcd3ff5e", md5: "https://wtxmd52.tele68.com/v1/txmd5/sessions?cp=R&cl=R&pf=web&at=93b3e543d609af0351163f3ff9a2c495" },
    xd88: { normal: "https://taixiu.system32-cloudfare-356783752985678522.monster/api/luckydice/GetSoiCau", md5: "https://taixiumd5.system32-cloudfare-356783752985678522.monster/api/md5luckydice/GetSoiCau" },
    betvip: { normal: "https://wtx.macminim6.online/v1/tx/sessions?cp=R&cl=R&pf=web&at=f03c4feaa20161043de2006ec62b3439", md5: "https://wtxmd52.macminim6.online/v1/txmd5/sessions?cp=R&cl=R&pf=web&at=f03c4feaa20161043de2006ec62b3439" },
    sunwin: { normal: "https://apisuntcbm.onrender.com/sunlon", md5: "https://apisuntcbm.onrender.com/sunlon" }
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

// ================= THUẬT TOÁN LOGIC UPDATE TỪ FIKE (ĐÃ FIX LỖI NGƯỢC CẦU & THÊM MẪU SUNWIN) =================
const GOI_Y_NGUONG = [
    [90, "Rất tự tin đặt"],
    [70, "Nên đặt"],
    [60, "Cân nhắc"]
];

const NGUONG_TY_LE = 5;

function phanTichChuoiWeighted(chuoi) {
    let weights = [];
    for (let i = 0; i < chuoi.length; i++) {
        weights.push(Math.pow(1.38, i));
    }
    let tong_weight = weights.reduce((a, b) => a + b, 0);
    let tai = 0, xiu = 0;
    for (let i = 0; i < chuoi.length; i++) {
        if (chuoi[i] === "T") tai += weights[i];
        if (chuoi[i] === "X") xiu += weights[i];
    }
    return {
        ptTai: tong_weight === 0 ? 0 : parseFloat((tai / tong_weight * 100).toFixed(1)),
        ptXiu: tong_weight === 0 ? 0 : parseFloat((xiu / tong_weight * 100).toFixed(1))
    };
}

function goiYDat(du_doan, percent, chenh) {
    for (let i = 0; i < GOI_Y_NGUONG.length; i++) {
        let threshold = GOI_Y_NGUONG[i][0];
        let message = GOI_Y_NGUONG[i][1];
        if (percent >= threshold) {
            if (percent < 70) {
                return `${message} (vì tỷ lệ chưa cao hoặc chênh lệch nhỏ)`;
            }
            return message;
        }
    }
    return "Bỏ qua";
}

function demChuoiLienTiep(chuoi, ky_tu) {
    let count = 0;
    for (let i = chuoi.length - 1; i >= 0; i--) {
        if (chuoi[i] === ky_tu) count++;
        else break;
    }
    return count;
}

function phanTichChuKy(chuoi) {
    for (let l of [5, 4, 3, 2]) {
        if (chuoi.length >= 2 * l) {
            let p1 = chuoi.slice(-l).join("");
            let p2 = chuoi.slice(-2 * l, -l).join("");
            if (p1 === p2) return chuoi[chuoi.length - 1];
        }
    }
    return null;
}

function laCauDanXen(chuoi) {
    if (chuoi.length < 6) return false;
    for (let i = chuoi.length - 6; i < chuoi.length - 1; i++) {
        if (chuoi[i] === chuoi[i+1]) return false;
    }
    return true;
}

function phatHienCauBip(chuoi) {
    let seq = chuoi.join("");
    if (seq.length >= 6 && (seq.endsWith("TTTTTT") || seq.endsWith("XXXXXX"))) {
        return "Cầu bệt dài bất thường";
    }
    if (seq.length >= 5 && (seq.endsWith("TXTXX") || seq.endsWith("XTXTT"))) {
        return "Cầu nhử đảo 1-1-2";
    }
    if (seq.endsWith("TXXTXT")) {
        return "Cầu bẫy lặp đều";
    }
    return null;
}

function duDoanTuChuoi(chuoi) {
    let {ptTai, ptXiu} = phanTichChuoiWeighted(chuoi);
    let diem_tai = 0, diem_xiu = 0;

    for (let l = 7; l >= 3; l--) {
        if (chuoi.length >= l) {
            let tailStr = chuoi.slice(-l).join("");
            if (tailStr === "T".repeat(l)) diem_tai += (l - 2) * 2;
            else if (tailStr === "X".repeat(l)) diem_xiu += (l - 2) * 2;
        }
    }

    let ck = phanTichChuKy(chuoi);
    if (ck === "T") diem_tai += 5;
    else if (ck === "X") diem_xiu += 5;

    if (laCauDanXen(chuoi)) {
        if (chuoi[chuoi.length - 1] === "T") diem_xiu += 4;
        else diem_tai += 4;
    }

    let tail = chuoi.slice(-8).join(""); // Tăng lùi 8 tay để bắt trọn mẫu cầu dài
    let mau_cau = {
        // Mẫu cơ bản 1-1, 2-2
        "TXT": "X", "XTX": "T",
        "TXTXT": "X", "XTXTX": "T",
        "TTXX": "T", "XXTT": "X",
        "TTXXT": "T", "XXTTX": "X",
        "TTXXTT": "X", "XXTTXX": "T",
        // Mẫu 1-2-1, 2-1-2
        "TXXT": "X", "XTTX": "T",
        "TTXTT": "X", "XXTXX": "T",
        "TXXTX": "T", "XTTXT": "X",
        // Mẫu 1-3-1
        "TXXXT": "X", "XTTTX": "T",
        // Mẫu 3-3
        "TTTXXX": "T", "XXXTTT": "X",
        // Mẫu tiến 1-2-3 / Lùi 3-2-1
        "TXXTTT": "X", "XTTXXX": "T",
        "TTTXXT": "X", "XXXTTX": "T",
        // Điểm gãy lừa (vừa gãy bệt xong dễ hồi lại hoặc nhảy 1-1)
        "TTX": "X", "XXT": "T"
    };
    
    for (let k in mau_cau) {
        if (tail.endsWith(k)) {
            // FIX: Giữ nguyên trọng số thấp (1.5) để an toàn trước bẫy nhà cái
            if (mau_cau[k] === "T") diem_tai += 1.5;
            else diem_xiu += 1.5;
        }
    }

    if (ptTai > ptXiu + NGUONG_TY_LE) diem_tai += 4;
    else if (ptXiu > ptTai + NGUONG_TY_LE) diem_xiu += 4;

    let countT = chuoi.filter(x => x === "T").length;
    let countX = chuoi.filter(x => x === "X").length;
    if (countT >= 0.6 * chuoi.length) diem_tai += 2;
    else if (countX >= 0.6 * chuoi.length) diem_xiu += 2;

    let lt_t = demChuoiLienTiep(chuoi, "T");
    let lt_x = demChuoiLienTiep(chuoi, "X");
    if (lt_t >= 3) diem_tai += Math.pow(2, lt_t - 2);
    if (lt_x >= 3) diem_xiu += Math.pow(2, lt_x - 2);

    diem_tai += ptTai / 10;
    diem_xiu += ptXiu / 10;

    if (chuoi.length >= 6) {
        let recent_patterns = [];
        for (let i = 0; i <= chuoi.length - 3; i++) {
            recent_patterns.push(chuoi.slice(i, i+3));
        }
        let count_t_pat = 0, count_x_pat = 0;
        for(let p of recent_patterns) {
            if(p.filter(x=>x==="T").length >= 2) count_t_pat++;
            if(p.filter(x=>x==="X").length >= 2) count_x_pat++;
        }
        if (count_t_pat > count_x_pat + 2) diem_tai += 3;
        else if (count_x_pat > count_t_pat + 2) diem_xiu += 3;
    }

    if (chuoi.length >= 8) {
        let last4 = chuoi.slice(-4);
        if (last4.slice(0, 2).join("") === last4.slice(2).join("")) {
            if (last4[3] === "T") diem_tai += 2.5;
            else diem_xiu += 2.5;
        }
    }

    if (diem_tai > diem_xiu + 1) return { kq_chuoi: "Tài", pt: ptTai, px: ptXiu };
    else if (diem_xiu > diem_tai + 1) return { kq_chuoi: "Xỉu", pt: ptTai, px: ptXiu };
    return { kq_chuoi: "Không rõ", pt: ptTai, px: ptXiu };
}

function duDoanTuXucXac(x1, x2, x3) {
    const bang_nha = {1: 5, 2: 4, 3: 6, 4: 2, 5: 1, 6: 3};
    const xuc_xac_goc = [x1, x2, x3];
    let xuc_xac_moi = [];
    let dem_trung = {};

    const reversed_goc = [...xuc_xac_goc].reverse();
    for (let xx of reversed_goc) {
        let so_nha = bang_nha[xx] !== undefined ? bang_nha[xx] : xx;
        let tru_di = dem_trung[xx] || 0;
        
        let kq_nha = so_nha - tru_di;
        xuc_xac_moi.push(kq_nha);
        
        dem_trung[xx] = tru_di + 1;
    }

    if (xuc_xac_moi.some(v => v < 1)) {
        return { kq_xx: "Tài", tong_xx: "Hết số nhả -> 85% Tài" };
    }

    let tong = xuc_xac_moi.reduce((a, b) => a + b, 0);
    let chuoi_nha = xuc_xac_moi.join("");
    let thong_tin_tong = `${tong} (Nhả ra: ${chuoi_nha})`;
    
    if (tong >= 11 && tong <= 17) return { kq_xx: "Tài", tong_xx: thong_tin_tong };
    if (tong >= 4 && tong <= 10) return { kq_xx: "Xỉu", tong_xx: thong_tin_tong };
    return { kq_xx: "Không rõ", tong_xx: thong_tin_tong };
}

function duDoanTongHop(chuoi, xuc_xac) {
    let { kq_chuoi, pt, px } = duDoanTuChuoi(chuoi);
    let kq_xx = "Không rõ", tong_xx = null;
    
    if (xuc_xac && xuc_xac.length === 3) {
        let res_xx = duDoanTuXucXac(xuc_xac[0], xuc_xac[1], xuc_xac[2]);
        kq_xx = res_xx.kq_xx;
        tong_xx = res_xx.tong_xx;
    }

    let ket_qua;
    if (kq_chuoi === kq_xx && kq_chuoi !== "Không rõ") ket_qua = kq_chuoi;
    else if (kq_chuoi !== "Không rõ" && kq_xx === "Không rõ") ket_qua = kq_chuoi;
    else if (kq_chuoi === "Không rõ" && kq_xx !== "Không rõ") ket_qua = kq_xx;
    else ket_qua = "Không rõ";

    return {
        ket_qua: ket_qua,
        phan_tich_chuoi: { kq_chuoi, pt, px },
        phan_tich_xuc_xac: { kq_xx, tong_xx }
    };
}


// ================= ENDPOINT CHÍNH =================
app.post("/predict", antiSpam, async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.json({ success: false, message: "Từ chối truy cập!", kicked: true });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const currentIp = getClientIp(req);

        if (decoded.ip && decoded.ip !== currentIp) {
            return res.json({ success: false, message: "❌ Phát hiện dùng chung Token qua mạng khác!", kicked: true });
        }

        if (keysCollection) {
            const dbKey = await keysCollection.findOne({ key: decoded.key });
            if (!dbKey) return res.json({ success: false, message: "❌ Key của bạn đã bị Admin XÓA!", kicked: true });
            if (dbKey.expire && dbKey.expire <= Date.now()) return res.json({ success: false, message: "❌ Key của bạn đã HẾT HẠN!", kicked: true });
        }

        const { source, seqLength, invertChain, game: clientGame } = req.body;
        let gameToFetch = decoded.game || 'lc79';
        if (gameToFetch === 'all') gameToFetch = clientGame || 'lc79';
        if (!API_URLS[gameToFetch]) return res.json({ success: false, message: "Game không hợp lệ!" });

        const apiUrl = API_URLS[gameToFetch][source || 'normal'];
        const response = await fetch(apiUrl + (apiUrl.includes('?') ? '&' : '?') + 'nocache=' + new Date().getTime());
        const data = await response.json();
        
        let chuoiN = [], lastDice = [];

        if (gameToFetch === 'sunwin') {
            if (!data || !data.pattern) return res.json({success: false, message: "Lỗi kết nối API Sunwin."});
            if (data.xuc_xac_1 && data.xuc_xac_2 && data.xuc_xac_3) lastDice = [Number(data.xuc_xac_1), Number(data.xuc_xac_2), Number(data.xuc_xac_3)];
            let p = data.pattern.toUpperCase();
            let selectedItems = p.slice(-(seqLength || 13)).split(''); 
            chuoiN = selectedItems.map(c => c === 'T' ? 'T' : 'X');
        } else {
            const list = extractListFromApiResponse(data);
            if (!list || list.length === 0) return res.json({success: false, message: "Lỗi kết nối API Game."});
            let maxItems = Math.min(seqLength || 13, list.length);
            let ketQuaTuApi = [];
            for (let i = 0; i < maxItems; i++) {
                let r = extractResultFromItem(list[i]);
                if (!r) {
                    const dices = extractDicesFromItem(list[i]);
                    if (dices && dices.length===3) { r = (dices[0]+dices[1]+dices[2]) >= 11 ? 'T' : 'X'; } else r = 'X';
                }
                ketQuaTuApi.push(r);
            }
            chuoiN = ketQuaTuApi.reverse(); 
            lastDice = extractDicesFromItem(list[0]) || [];
        }

        let chainForAnalysis = chuoiN.slice();
        if(invertChain) chainForAnalysis = chainForAnalysis.map(c => c === 'T' ? 'X' : (c === 'X' ? 'T' : c));

        // CHẠY LOGIC TỔNG HỢP SAU KHI FIX
        const ket_qua_tong_hop = duDoanTongHop(chainForAnalysis, lastDice);
        const { kq_chuoi, pt, px } = ket_qua_tong_hop.phan_tich_chuoi;
        const { kq_xx, tong_xx } = ket_qua_tong_hop.phan_tich_xuc_xac;

        const cau_bip = phatHienCauBip(chainForAnalysis);
        const chenh = Math.abs(pt - px);
        const max_percent = Math.max(pt, px);
        const goi_y = goiYDat(kq_chuoi, max_percent, chenh);

        res.json({ 
            success: true, 
            chuoiN, 
            lastDice, 
            ket_qua_du_doan: ket_qua_tong_hop.ket_qua,
            logic_chuoi: {
                ket_qua: kq_chuoi,
                ty_le_tai: pt,
                ty_le_xiu: px,
                cau_bip: cau_bip,
                goi_y: goi_y
            },
            logic_xuc_xac: {
                ket_qua: kq_xx,
                chi_tiet: tong_xx
            }
        });

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
