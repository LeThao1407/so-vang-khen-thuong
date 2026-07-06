import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from "./src/firebase/admin.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Memory-based session storage
const sessions = new Map<string, any>();

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substring(2, 11);

// Helper to remove diacritics/accents from Vietnamese text
function removeDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

// Firestore does not allow undefined fields, so we use this helper
function cleanFirestoreData(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanFirestoreData);
  }
  const cleaned: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      if (val !== undefined) {
        cleaned[key] = cleanFirestoreData(val);
      }
    }
  }
  return cleaned;
}

// Middleware: Verify Token Session
const requireAuth = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }
  req.user = session.user;
  next();
};

const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  next();
};

// API: Auth Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Vui lòng cung cấp tên đăng nhập và mật khẩu' });
    }

    const inputStr = username.trim();
    const normalizedInput = removeDiacritics(inputStr).replace(/\s+/g, '');

    // Read users from Firestore
    const snapshot = await db.collection("users").get();
    const users = snapshot.docs.map(doc => doc.data());

    const matchedUser = users.find(u => {
      const unaccentedName = removeDiacritics(u.name || '').replace(/\s+/g, '');
      const unaccentedNickname = removeDiacritics(u.nickname || '').replace(/\s+/g, '');
      const lowercaseUsername = (u.username || '').toLowerCase();
      
      if (u.role === 'admin') {
        if (
          normalizedInput.includes('admin') || 
          normalizedInput.includes('ongba') || 
          normalizedInput.includes('quantri')
        ) {
          return true;
        }
      }

      return (
        unaccentedName === normalizedInput ||
        unaccentedNickname === normalizedInput ||
        lowercaseUsername === normalizedInput ||
        (u.name || '').toLowerCase() === inputStr.toLowerCase() ||
        (u.nickname || '').toLowerCase() === inputStr.toLowerCase() ||
        normalizedInput.includes(unaccentedName) ||
        unaccentedName.includes(normalizedInput)
      );
    });

    if (!matchedUser) {
      return res.status(400).json({ error: 'Không tìm thấy thành viên gia đình này. Vui lòng nhập đúng họ tên thật hoặc biệt danh!' });
    }

    let allowedPasswords: string[];
    if (matchedUser.password) {
      allowedPasswords = [matchedUser.password];
    } else {
      allowedPasswords = [
        '123',
        'giadinh123',
        `${(matchedUser.username || '').toLowerCase()}123`,
        `${removeDiacritics(matchedUser.nickname || '').replace(/\s+/g, '')}123`,
        `${removeDiacritics(matchedUser.name || '').replace(/\s+/g, '')}123`
      ];
    }

    if (!allowedPasswords.includes(password.trim())) {
      const errorMsg = matchedUser.password
        ? 'Mật khẩu chưa chính xác. Hãy nhập đúng mật khẩu mới bạn đã đặt!'
        : 'Mật khẩu chưa chính xác. Gợi ý: Bạn có thể nhập mật khẩu mặc định 123!';
      return res.status(400).json({ error: errorMsg });
    }

    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    sessions.set(token, { user: matchedUser, createdAt: Date.now() });

    res.json({ token, user: matchedUser });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

app.post('/api/auth/change-password', requireAuth, async (req: any, res: any) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.trim().length === 0) {
      return res.status(400).json({ error: 'Mật khẩu mới không được để trống' });
    }

    const userRef = db.collection("users").doc(req.user.id);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng trong hệ thống' });
    }

    await userRef.update({ password: newPassword.trim() });
    req.user.password = newPassword.trim();

    res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    sessions.delete(token);
  }
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req: any, res: any) => {
  res.json({ user: req.user });
});

// API: Leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const [usersSnapshot, achievementsSnapshot, payoutsSnapshot] = await Promise.all([
      db.collection("users").get(),
      db.collection("achievements").get(),
      db.collection("payouts").get()
    ]);

    const users = usersSnapshot.docs.map(doc => doc.data());
    const achievements = achievementsSnapshot.docs.map(doc => doc.data());
    const payouts = payoutsSnapshot.docs.map(doc => doc.data());

    const children = users.filter(u => u.role === 'user');
    const leaderboard = children.map(child => {
      const childAchievements = achievements.filter(a => a.userId === child.id);
      const childPayouts = payouts.filter(p => p.userId === child.id);

      const totalReward = childAchievements.reduce((sum, a) => sum + (a.reward || 0), 0);
      const totalReceived = childPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);
      const remainingBalance = totalReward - totalReceived;

      const achievementsCount = childAchievements.length;

      const rewards2025 = childAchievements
        .filter(a => a.date && a.date.startsWith('2025'))
        .reduce((sum, a) => sum + (a.reward || 0), 0);

      const rewards2026 = childAchievements
        .filter(a => a.date && a.date.startsWith('2026'))
        .reduce((sum, a) => sum + (a.reward || 0), 0);

      return {
        id: child.id,
        name: child.name,
        nickname: child.nickname,
        gradeLevel: child.gradeLevel,
        totalReward,
        totalReceived,
        remainingBalance,
        achievementsCount,
        rewards2025,
        rewards2026,
      };
    });

    res.json({ leaderboard });
  } catch (error: any) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

// API: Achievements
app.get('/api/achievements', requireAuth, async (req: any, res: any) => {
  try {
    let achievements;
    if (req.user.role === 'admin') {
      const snapshot = await db.collection("achievements").get();
      achievements = snapshot.docs.map(doc => doc.data());
    } else {
      const snapshot = await db.collection("achievements").where("userId", "==", req.user.id).get();
      achievements = snapshot.docs.map(doc => doc.data());
    }

    achievements.sort((a: any, b: any) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    res.json({ achievements });
  } catch (error: any) {
    console.error('Get achievements error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

app.post('/api/achievements', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId, date, description, category, reward, proofImage } = req.body;
    if (!userId || !date || !description || !category || reward === undefined) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    }

    const newId = `ach_${generateId()}`;
    const newAchievement: any = {
      id: newId,
      userId,
      date,
      description,
      category,
      reward: Number(reward),
      approvedBy: 'admin',
      createdAt: new Date().toISOString()
    };

    if (proofImage !== undefined) {
      newAchievement.proofImage = proofImage;
    }

    await db.collection("achievements").doc(newId).set(cleanFirestoreData(newAchievement));

    res.json({ success: true, achievement: newAchievement });
  } catch (error: any) {
    console.error('Create achievement error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

app.put('/api/achievements/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, description, category, reward, userId, proofImage } = req.body;

    const achRef = db.collection("achievements").doc(id);
    const achDoc = await achRef.get();
    if (!achDoc.exists) {
      return res.status(404).json({ error: 'Không tìm thấy thành tích' });
    }

    const currentAch = achDoc.data() || {};
    const updatedAch: any = {
      ...currentAch,
      userId: userId || currentAch.userId,
      date: date || currentAch.date,
      description: description || currentAch.description,
      category: category || currentAch.category,
      reward: reward !== undefined ? Number(reward) : currentAch.reward,
    };

    if (proofImage !== undefined) {
      updatedAch.proofImage = proofImage;
    }

    await achRef.set(cleanFirestoreData(updatedAch));

    res.json({ success: true, achievement: updatedAch });
  } catch (error: any) {
    console.error('Update achievement error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

app.delete('/api/achievements/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const achRef = db.collection("achievements").doc(id);
    const achDoc = await achRef.get();
    if (!achDoc.exists) {
      return res.status(404).json({ error: 'Không tìm thấy thành tích' });
    }

    await achRef.delete();
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete achievement error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

// API: Requests
app.get('/api/requests', requireAuth, async (req: any, res: any) => {
  try {
    const snapshot = await db.collection("requests").get();
    let requests = snapshot.docs.map(doc => doc.data());

    if (req.user.role !== 'admin') {
      requests = requests.filter((r: any) => r.userId === req.user.id);
    }

    requests.sort((a: any, b: any) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    res.json({ requests });
  } catch (error: any) {
    console.error('Get requests error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

app.post('/api/requests', requireAuth, async (req: any, res: any) => {
  try {
    const { type, achievementId, data } = req.body;
    if (!type || !data) {
      return res.status(400).json({ error: 'Thiếu thông tin yêu cầu' });
    }

    const newRequest: any = {
      id: `req_${generateId()}`,
      userId: req.user.id,
      type,
      data: cleanFirestoreData({
        date: data.date,
        description: data.description,
        category: data.category,
        reward: Number(data.reward),
        proofImage: data.proofImage
      }),
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    if (achievementId !== undefined) {
      newRequest.achievementId = achievementId;
    }
    if (data.proofImage !== undefined) {
      newRequest.proofImage = data.proofImage;
    }

    await db.collection("requests").doc(newRequest.id).set(cleanFirestoreData(newRequest));

    res.json({ success: true, request: newRequest });
  } catch (error: any) {
    console.error('Create request error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

app.put('/api/requests/:id', requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ error: 'Thiếu thông tin cập nhật' });
    }

    const reqRef = db.collection("requests").doc(id);
    const reqDoc = await reqRef.get();
    if (!reqDoc.exists) {
      return res.status(404).json({ error: 'Không tìm thấy yêu cầu' });
    }

    const request = reqDoc.data() || {};

    if (request.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa yêu cầu này' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Chỉ có thể chỉnh sửa yêu cầu đang chờ duyệt' });
    }

    const requestData = request.data || {};
    const updatedData = cleanFirestoreData({
      date: data.date || requestData.date,
      description: data.description || requestData.description,
      category: data.category || requestData.category,
      reward: (data.reward !== undefined && !isNaN(Number(data.reward))) ? Number(data.reward) : requestData.reward,
      proofImage: data.proofImage !== undefined ? data.proofImage : requestData.proofImage
    });

    const updatedRequest = {
      ...request,
      data: updatedData,
      proofImage: data.proofImage !== undefined ? data.proofImage : request.proofImage
    };

    await reqRef.set(cleanFirestoreData(updatedRequest));

    res.json({ success: true, request: updatedRequest });
  } catch (error: any) {
    console.error('Update request error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

app.delete('/api/requests/:id', requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;

    const reqRef = db.collection("requests").doc(id);
    const reqDoc = await reqRef.get();
    if (!reqDoc.exists) {
      return res.status(404).json({ error: 'Không tìm thấy yêu cầu' });
    }

    const request = reqDoc.data() || {};

    if (req.user.role !== 'admin') {
      if (request.userId !== req.user.id) {
        return res.status(403).json({ error: 'Bạn không có quyền xóa yêu cầu này' });
      }
    }

    await reqRef.delete();

    res.json({ success: true, message: 'Đã xóa yêu cầu thành công' });
  } catch (error: any) {
    console.error('Delete request error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

app.post('/api/requests/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    const reqRef = db.collection("requests").doc(id);
    const reqDoc = await reqRef.get();
    if (!reqDoc.exists) {
      return res.status(404).json({ error: 'Không tìm thấy yêu cầu' });
    }

    const request = reqDoc.data() || {};

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Yêu cầu đã được xử lý từ trước' });
    }

    if (request.type === 'add') {
      const newAchId = `ach_${generateId()}`;
      const newAchievement: any = {
        id: newAchId,
        userId: request.userId,
        date: request.data?.date,
        description: request.data?.description,
        category: request.data?.category,
        reward: request.data?.reward,
        approvedBy: 'admin',
        createdAt: new Date().toISOString()
      };

      const proofImage = request.data?.proofImage || request.proofImage;
      if (proofImage !== undefined) {
        newAchievement.proofImage = proofImage;
      }

      await db.collection("achievements").doc(newAchId).set(cleanFirestoreData(newAchievement));
    } else if (request.type === 'update' && request.achievementId) {
      const achRef = db.collection("achievements").doc(request.achievementId);
      const achDoc = await achRef.get();
      if (achDoc.exists) {
        const currentAch = achDoc.data() || {};
        const updatedAchievement = {
          ...currentAch,
          date: request.data?.date,
          description: request.data?.description,
          category: request.data?.category,
          reward: request.data?.reward,
          proofImage: request.data?.proofImage || request.proofImage || currentAch.proofImage
        };
        await achRef.set(cleanFirestoreData(updatedAchievement));
      }
    } else if (request.type === 'delete' && request.achievementId) {
      await db.collection("achievements").doc(request.achievementId).delete();
    }

    request.status = 'approved';
    request.adminNote = adminNote || 'Đã phê duyệt';

    await reqRef.set(cleanFirestoreData(request));

    res.json({ success: true, request });
  } catch (error: any) {
    console.error('Approve request error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

app.post('/api/requests/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    const reqRef = db.collection("requests").doc(id);
    const reqDoc = await reqRef.get();
    if (!reqDoc.exists) {
      return res.status(404).json({ error: 'Không tìm thấy yêu cầu' });
    }

    const request = reqDoc.data() || {};

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Yêu cầu đã được xử lý từ trước' });
    }

    request.status = 'rejected';
    request.adminNote = adminNote || 'Từ chối bởi quản trị viên';

    await reqRef.set(cleanFirestoreData(request));

    res.json({ success: true, request });
  } catch (error: any) {
    console.error('Reject request error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

// API: Payouts
app.get('/api/payouts', requireAuth, async (req: any, res: any) => {
  try {
    let payouts;
    if (req.user.role === 'admin') {
      const snapshot = await db.collection("payouts").get();
      payouts = snapshot.docs.map(doc => doc.data());
    } else {
      const snapshot = await db.collection("payouts").where("userId", "==", req.user.id).get();
      payouts = snapshot.docs.map(doc => doc.data());
    }

    payouts.sort((a: any, b: any) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    res.json({ payouts });
  } catch (error: any) {
    console.error('Get payouts error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

app.post('/api/payouts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId, date, description, amount } = req.body;
    if (!userId || !date || !description || !amount) {
      return res.status(400).json({ error: 'Thiếu thông tin thanh toán' });
    }

    const newId = `pay_${generateId()}`;
    const newPayout = {
      id: newId,
      userId,
      date,
      description,
      amount: Number(amount),
      createdAt: new Date().toISOString()
    };

    await db.collection("payouts").doc(newId).set(cleanFirestoreData(newPayout));

    res.json({ success: true, payout: newPayout });
  } catch (error: any) {
    console.error('Create payout error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

app.delete('/api/payouts/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const payRef = db.collection("payouts").doc(id);
    const payDoc = await payRef.get();
    if (!payDoc.exists) {
      return res.status(404).json({ error: 'Không tìm thấy thông tin chi trả' });
    }

    await payRef.delete();
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete payout error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

// API: Rules Configurator
app.get('/api/rules', async (req, res) => {
  try {
    const snapshot = await db.collection("rules").get();
    const rules = snapshot.docs.map(doc => doc.data());

    rules.sort((a: any, b: any) => {
      const idA = parseInt(a.id) || 0;
      const idB = parseInt(b.id) || 0;
      return idA - idB;
    });

    res.json({ rules });
  } catch (error: any) {
    console.error('Get rules error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

app.put('/api/rules', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rules } = req.body;
    if (!Array.isArray(rules)) {
      return res.status(400).json({ error: 'Định dạng quy tắc không hợp lệ' });
    }

    const snapshot = await db.collection("rules").get();
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    const writeBatch = db.batch();
    rules.forEach((rule: any) => {
      const docRef = db.collection("rules").doc(rule.id);
      writeBatch.set(docRef, cleanFirestoreData(rule));
    });
    await writeBatch.commit();

    res.json({ success: true, rules });
  } catch (error: any) {
    console.error('Update rules error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

// Update user gradeLevel (Admin only)
app.put('/api/users/:id/gradeLevel', requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { gradeLevel } = req.body;

    if (!gradeLevel) {
      return res.status(400).json({ error: 'Thiếu thông tin cấp học' });
    }

    const userRef = db.collection("users").doc(id);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng này' });
    }

    const userData = userDoc.data() || {};
    const updatedUser = {
      ...userData,
      gradeLevel
    };

    await userRef.set(cleanFirestoreData(updatedUser));
    res.json({ success: true, user: updatedUser });
  } catch (error: any) {
    console.error('Update gradeLevel error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

// GET /api/admin/users - Get all users (Admin only)
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection("users").get();
    const users = snapshot.docs.map(doc => doc.data());
    res.json({ users });
  } catch (error: any) {
    console.error('Get admin users error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

// POST /api/admin/users - Create a new user account (Admin only)
app.post('/api/admin/users', requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const { username, name, nickname, role, gradeLevel } = req.body;
    if (!username || !name || !nickname || !role) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ các thông tin bắt buộc!' });
    }

    const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '');
    const querySnapshot = await db.collection("users").where("username", "==", cleanUsername).get();
    if (!querySnapshot.empty) {
      return res.status(400).json({ error: 'Tên đăng nhập này đã tồn tại!' });
    }

    const newId = 'user_' + Math.random().toString(36).substring(2, 9);
    const newUser = {
      id: newId,
      username: cleanUsername,
      name: name.trim(),
      nickname: nickname.trim(),
      role,
      gradeLevel: role === 'admin' ? 'N/A' : (gradeLevel || 'Cấp 2')
    };

    await db.collection("users").doc(newId).set(cleanFirestoreData(newUser));
    res.json({ success: true, user: newUser });
  } catch (error: any) {
    console.error('Create admin user error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

// PUT /api/admin/users/:id - Update user account details (Admin only)
app.put('/api/admin/users/:id', requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { username, name, nickname, role, gradeLevel } = req.body;

    const userRef = db.collection("users").doc(id);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản!' });
    }

    const userData = userDoc.data() || {};

    if (!username || !name || !nickname || !role) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ các thông tin bắt buộc!' });
    }

    const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '');
    const dupSnapshot = await db.collection("users").where("username", "==", cleanUsername).get();
    const duplicate = dupSnapshot.docs.find(doc => doc.id !== id);
    if (duplicate) {
      return res.status(400).json({ error: 'Tên đăng nhập này đã được sử dụng bởi tài khoản khác!' });
    }

    if (id === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'Bạn không thể tự hạ quyền Admin của chính mình!' });
    }

    const updatedUser = {
      ...userData,
      username: cleanUsername,
      name: name.trim(),
      nickname: nickname.trim(),
      role,
      gradeLevel: role === 'admin' ? 'N/A' : (gradeLevel || 'Cấp 2')
    };

    await userRef.set(cleanFirestoreData(updatedUser));
    res.json({ success: true, user: updatedUser });
  } catch (error: any) {
    console.error('Update admin user error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

// DELETE /api/admin/users/:id - Delete a user account (Admin only)
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Bạn không thể tự xóa tài khoản đang đăng nhập!' });
    }

    const userRef = db.collection("users").doc(id);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản!' });
    }

    await userRef.delete();
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete admin user error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

// Serve frontend in production
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('API running. Frontend dev server is active in Vite.');
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
