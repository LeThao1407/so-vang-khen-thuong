import React, { useState, useEffect } from 'react';
import { 
  Trophy, 
  User as UserIcon, 
  Lock, 
  LogOut, 
  Plus, 
  Check, 
  X, 
  Edit, 
  Trash2, 
  DollarSign, 
  Clock, 
  Award, 
  BookOpen, 
  FileText, 
  Info, 
  Settings, 
  ChevronRight, 
  Calendar, 
  TrendingUp, 
  Shield, 
  Users,
  Eye,
  Activity,
  GraduationCap,
  Heart,
  Camera,
  Upload,
  Image as ImageIcon,
  Key,
  Sun,
  Moon,
  Bell
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import type { 
  User, 
  Achievement, 
  Payout, 
  AchievementRequest, 
  RewardRule 
} from './types';
import { 
  collection, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where
} from "firebase/firestore";
import { db } from "./firebase/firebase";

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

// Canvas-based image compression helper (downscales image and converts to JPEG at 0.7 quality)
function compressImage(base64Str: string, maxWidth = 1024, maxQuality = 0.7): Promise<string> {
  return new Promise((resolve) => {
    // If it's not a base64 image string, resolve with original
    if (!base64Str || !base64Str.startsWith('data:image/')) {
      resolve(base64Str);
      return;
    }
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxWidth) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', maxQuality);
      resolve(compressedDataUrl);
    };
    img.onerror = () => {
      resolve(base64Str); // Fallback to original
    };
  });
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

export default function App() {
  // Authentication & session state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Language state & helper function
  const [lang, setLang] = useState<'vi' | 'en'>(() => {
    const saved = localStorage.getItem('family_lang');
    return (saved === 'en' || saved === 'vi') ? saved : 'vi';
  });

  const toggleLanguage = () => {
    const nextLang = lang === 'vi' ? 'en' : 'vi';
    setLang(nextLang);
    localStorage.setItem('family_lang', nextLang);
  };

  const t = (viText: string, enText: string) => {
    return lang === 'vi' ? viText : enText;
  };

  // Theme state & helper function
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('family_theme');
    return (saved === 'dark' || saved === 'light') ? saved : 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('family_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Core database state
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [requests, setRequests] = useState<AchievementRequest[]>([]);
  const [rules, setRules] = useState<RewardRule[]>([]);
  
  // App views
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'personal' | 'admin' | 'rules'>('leaderboard');
  const [selectedChildDetail, setSelectedChildDetail] = useState<any | null>(null);

  // Submit Achievement Form State
  const [achDate, setAchDate] = useState(new Date().toISOString().split('T')[0]);
  const [achDescription, setAchDescription] = useState('');
  const [achCategory, setAchCategory] = useState('Toán');
  const [achGradeLevel, setAchGradeLevel] = useState<'Cấp 1' | 'Cấp 2' | 'Cấp 3' | 'Đại học'>('Cấp 1');
  const [achType, setAchType] = useState<'grade' | 'contest' | 'custom'>('grade');
  
  // Sub-selections for calculations
  const [scoreGrade, setScoreGrade] = useState('10');
  const [scoreQuantity, setScoreQuantity] = useState<number>(1);
  const [contestLevel, setContestLevel] = useState('Giải cấp trường');
  const [contestAward, setContestAward] = useState('Giải nhất');
  const [customReward, setCustomReward] = useState('20000');
  const [achFormError, setAchFormError] = useState('');
  const [achFormSuccess, setAchFormSuccess] = useState('');

  // Camera & Image Proof States
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [activeProofModal, setActiveProofModal] = useState<string | null>(null);

  // Edit Pending Request States
  const [editingRequest, setEditingRequest] = useState<any | null>(null);
  const [editReqDescription, setEditReqDescription] = useState('');
  const [editReqCategory, setEditReqCategory] = useState('Toán');
  const [editReqDate, setEditReqDate] = useState('');
  const [editReqReward, setEditReqReward] = useState(0);
  const [editReqProofImage, setEditReqProofImage] = useState<string | null>(null);
  const [isEditCameraActive, setIsEditCameraActive] = useState(false);
  const [editCameraError, setEditCameraError] = useState('');

  // Admin Directly Create Achievement Form
  const [adminAchUser, setAdminAchUser] = useState('');
  const [adminAchDate, setAdminAchDate] = useState(new Date().toISOString().split('T')[0]);
  const [adminAchDesc, setAdminAchDesc] = useState('');
  const [adminAchCat, setAdminAchCat] = useState('Toán');
  const [adminAchReward, setAdminAchReward] = useState('20000');
  
  // Admin Payout Form
  const [payoutUser, setPayoutUser] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutDesc, setPayoutDesc] = useState('');
  const [payoutDate, setPayoutDate] = useState(new Date().toISOString().split('T')[0]);
  const [payoutError, setPayoutError] = useState('');
  const [payoutSuccess, setPayoutSuccess] = useState('');

  // Admin Change Grade Level state
  const [editGradeUser, setEditGradeUser] = useState('');
  const [editGradeLevel, setEditGradeLevel] = useState('Cấp 2');

  // Admin Request Notes state
  const [adminNotes, setAdminNotes] = useState<{[key: string]: string}>({});

  // Change Password States
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [changePasswordNew, setChangePasswordNew] = useState('');
  const [changePasswordConfirm, setChangePasswordConfirm] = useState('');
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);

  // Admin User CRUD state
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null); // null means adding/creating a new user
  const [userFormUsername, setUserFormUsername] = useState('');
  const [userFormName, setUserFormName] = useState('');
  const [userFormNickname, setUserFormNickname] = useState('');
  const [userFormRole, setUserFormRole] = useState<'user' | 'admin'>('user');
  const [userFormGrade, setUserFormGrade] = useState('Cấp 2');

  // Admin Edit Rule States
  const [editingRule, setEditingRule] = useState<RewardRule | null>(null);
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [ruleCategory, setRuleCategory] = useState('Cấp 1');
  const [ruleSubCategory, setRuleSubCategory] = useState('Điểm số');
  const [ruleValue, setRuleValue] = useState('');
  const [ruleRewardAmount, setRuleRewardAmount] = useState<number>(0);

  // Toast & Custom Confirm Dialog States
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText?: string;
    onConfirm: () => void;
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    // Clear toast automatically
    setTimeout(() => {
      setToast(prev => prev && prev.message === message ? null : prev);
    }, 4500);
  };

  const handleOperationError = (err: any, actionName: string) => {
    console.error(`Error during ${actionName}:`, err);
    if (!navigator.onLine) {
      showToast(t('Mất kết nối mạng. Vui lòng kiểm tra kết nối internet và thử lại.', 'Network connection lost. Please check your internet connection and try again.'), 'error');
      return;
    }
    
    let msg = '';
    const errCode = err?.code;
    const errMsg = err?.message || '';

    if (errCode === 'permission-denied' || errMsg.includes('permission') || errMsg.includes('Permission')) {
      msg = t('Bạn không có quyền thực hiện thao tác này. Vui lòng kiểm tra lại tài khoản hoặc đăng nhập lại.', 
              'You do not have permission to perform this operation. Please check your account or log in again.');
    } else if (errCode === 'unavailable' || errMsg.includes('unavailable') || errMsg.includes('network')) {
      msg = t('Máy chủ cơ sở dữ liệu không phản hồi hoặc mất kết nối. Vui lòng thử lại sau.', 
              'The database server is not responding or connection lost. Please try again later.');
    } else if (errCode === 'resource-exhausted' || errMsg.includes('exceeds the maximum allowed size') || errMsg.includes('too large') || errMsg.includes('limit')) {
      msg = t('Ảnh minh chứng vượt quá giới hạn 1MB. Vui lòng chọn ảnh nhỏ hơn.', 
              'Proof image exceeds the 1MB limit. Please select a smaller image.');
    } else if (errCode === 'unauthenticated') {
      msg = t('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'Your session has expired. Please log in again.');
    } else if (errCode) {
      msg = t(`Lỗi Firebase (${errCode}): ${errMsg}`, `Firebase Error (${errCode}): ${errMsg}`);
    } else {
      msg = t(`Lỗi khi ${actionName}: ${errMsg || 'Không rõ nguyên nhân'}`, `Error during ${actionName}: ${errMsg || 'Unknown error'}`);
    }

    showToast(msg, 'error');
  };

  const triggerConfirm = (title: string, message: string, confirmText: string, onConfirm: () => void) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      confirmText,
      onConfirm: () => {
        onConfirm();
        setConfirmDialog(null);
      }
    });
  };

  // Loading/Operation triggers
  const [loading, setLoading] = useState(true);

  // Load public and initial data
  const fetchPublicData = async () => {
    try {
      // 1. Leaderboard: users + achievements + payouts
      const [usersSnap, achievementsSnap, payoutsSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "achievements")),
        getDocs(collection(db, "payouts"))
      ]);
      const users = usersSnap.docs.map(doc => doc.data() as User);
      const achievements = achievementsSnap.docs.map(doc => doc.data() as Achievement);
      const payouts = payoutsSnap.docs.map(doc => doc.data() as Payout);

      const children = users.filter(u => u.role === 'user');
      const leaderboardData = children.map(child => {
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
      setLeaderboard(leaderboardData);

      // 2. Rules
      const rulesSnap = await getDocs(collection(db, "rules"));
      const rulesData = rulesSnap.docs.map(doc => doc.data() as RewardRule);
      rulesData.sort((a, b) => {
        const idA = parseInt(a.id) || 0;
        const idB = parseInt(b.id) || 0;
        return idA - idB;
      });
      setRules(rulesData);
    } catch (err) {
      console.error('Error fetching public data:', err);
    }
  };

  // Fetch private/authenticated data
  const fetchPrivateData = async (authToken: string, customUser?: User) => {
    try {
      const activeUser = customUser || currentUser;
      if (!activeUser) return;

      const isUserAdmin = activeUser.role === 'admin';
      
      // 1. Achievements
      let achievementsData: Achievement[] = [];
      if (isUserAdmin) {
        const snap = await getDocs(collection(db, "achievements"));
        achievementsData = snap.docs.map(d => d.data() as Achievement);
      } else {
        const q = query(collection(db, "achievements"), where("userId", "==", activeUser.id));
        const snap = await getDocs(q);
        achievementsData = snap.docs.map(d => d.data() as Achievement);
      }
      achievementsData.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setAchievements(achievementsData);

      // 2. Payouts
      let payoutsData: Payout[] = [];
      if (isUserAdmin) {
        const snap = await getDocs(collection(db, "payouts"));
        payoutsData = snap.docs.map(d => d.data() as Payout);
      } else {
        const q = query(collection(db, "payouts"), where("userId", "==", activeUser.id));
        const snap = await getDocs(q);
        payoutsData = snap.docs.map(d => d.data() as Payout);
      }
      payoutsData.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setPayouts(payoutsData);

      // 3. Requests
      let requestsData: AchievementRequest[] = [];
      if (isUserAdmin) {
        const snap = await getDocs(collection(db, "requests"));
        requestsData = snap.docs.map(d => d.data() as AchievementRequest);
      } else {
        const q = query(collection(db, "requests"), where("userId", "==", activeUser.id));
        const snap = await getDocs(q);
        requestsData = snap.docs.map(d => d.data() as AchievementRequest);
      }
      requestsData.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setRequests(requestsData);

      // 4. All Users if admin
      if (isUserAdmin) {
        const snap = await getDocs(collection(db, "users"));
        const usersData = snap.docs.map(d => d.data() as User);
        setAllUsers(usersData);
      }
    } catch (err) {
      console.error('Error fetching private data:', err);
    }
  };

  // Check session status on boot
  useEffect(() => {
    const initSession = async () => {
      setLoading(true);
      await fetchPublicData();

      if (token) {
        try {
          const userDocSnap = await getDoc(doc(db, "users", token));
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data() as User;
            setCurrentUser(userData);
            await fetchPrivateData(token, userData);
            if (userData.role === 'admin') {
              setActiveTab('admin');
            } else {
              setActiveTab('personal');
            }
          } else {
            // Bad session
            localStorage.removeItem('token');
            setToken(null);
            setCurrentUser(null);
          }
        } catch (e) {
          console.error(e);
          localStorage.removeItem('token');
          setToken(null);
          setCurrentUser(null);
        }
      }
      setLoading(false);
    };

    initSession();
  }, [token]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [videoStream]);

  // Sync achGradeLevel with currentUser's gradeLevel automatically
  useEffect(() => {
    if (currentUser && currentUser.role === 'user' && currentUser.gradeLevel) {
      if (['Cấp 1', 'Cấp 2', 'Cấp 3', 'Đại học'].includes(currentUser.gradeLevel)) {
        setAchGradeLevel(currentUser.gradeLevel as any);
      }
    }
  }, [currentUser]);

  // Sync scoreGrade with available options for achGradeLevel automatically
  useEffect(() => {
    const availableRules = rules.filter(r => r.subCategory === 'Điểm số' && r.category === achGradeLevel);
    if (availableRules.length > 0) {
      const exists = availableRules.some(r => r.value === scoreGrade);
      if (!exists) {
        setScoreGrade(availableRules[0].value);
      }
    }
  }, [achGradeLevel, rules, scoreGrade]);

  // Handle Log In
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      if (!loginUsername || !loginPassword) {
        setLoginError('Vui lòng cung cấp tên đăng nhập và mật khẩu');
        return;
      }

      const inputStr = loginUsername.trim();
      const normalizedInput = removeDiacritics(inputStr).replace(/\s+/g, '');

      // Read users from Firestore directly
      const snapshot = await getDocs(collection(db, "users"));
      const users = snapshot.docs.map(doc => doc.data() as User & { password?: string });

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
        setLoginError('Không tìm thấy thành viên gia đình này. Vui lòng nhập đúng họ tên thật hoặc biệt danh!');
        return;
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

      if (!allowedPasswords.includes(loginPassword.trim())) {
        const errorMsg = matchedUser.password
          ? 'Mật khẩu chưa chính xác. Hãy nhập đúng mật khẩu mới bạn đã đặt!'
          : 'Mật khẩu chưa chính xác. Gợi ý: Bạn có thể nhập mật khẩu mặc định 123!';
        setLoginError(errorMsg);
        return;
      }

      const userToken = matchedUser.id; // Using userId as a simple token
      localStorage.setItem('token', userToken);
      setToken(userToken);
      setCurrentUser(matchedUser);
      setShowLoginModal(false);
      setLoginUsername('');
      setLoginPassword('');
      
      if (matchedUser.role === 'admin') {
        setActiveTab('admin');
      } else {
        setActiveTab('personal');
      }
    } catch (err) {
      console.error(err);
      setLoginError('Không thể kết nối đến máy chủ.');
    }
  };

  // Handle Log Out
  const handleLogout = async () => {
    localStorage.removeItem('token');
    setToken(null);
    setCurrentUser(null);
    setActiveTab('leaderboard');
    setAchievements([]);
    setPayouts([]);
    setRequests([]);
    fetchPublicData();
  };

  // Handle Change Password
  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!changePasswordNew.trim()) {
      showToast(t('Vui lòng nhập mật khẩu mới.', 'Please enter new password.'), 'error');
      return;
    }
    if (changePasswordNew !== changePasswordConfirm) {
      showToast(t('Mật khẩu xác nhận không khớp.', 'Passwords do not match.'), 'error');
      return;
    }

    setChangePasswordLoading(true);
    try {
      const userRef = doc(db, "users", currentUser.id);
      await updateDoc(userRef, { password: changePasswordNew.trim() });
      setChangePasswordLoading(false);
      showToast(t('Đổi mật khẩu thành công!', 'Changed password successfully!'), 'success');
      setChangePasswordNew('');
      setChangePasswordConfirm('');
      setShowChangePasswordModal(false);
    } catch (err) {
      setChangePasswordLoading(false);
      showToast(t('Có lỗi xảy ra khi đổi mật khẩu.', 'Error changing password.'), 'error');
    }
  };

  // Auto calculate reward amount based on rules
  const getCalculatedReward = (): number => {
    if (achType === 'custom') {
      return Number(customReward) || 0;
    }

    if (achType === 'grade') {
      const match = rules.find(
        r => r.subCategory === 'Điểm số' && 
        r.category === achGradeLevel && 
        r.value === scoreGrade
      );
      const baseReward = match ? match.rewardAmount : 0;
      return baseReward * scoreQuantity;
    }

    if (achType === 'contest') {
      const match = rules.find(r => r.category === contestLevel && r.subCategory === contestAward);
      return match ? match.rewardAmount : 0;
    }

    return 0;
  };

  const calculatedReward = getCalculatedReward();

  // Webcam stream handlers
  const startCamera = async () => {
    setCameraError('');
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // Back camera on mobile
        audio: false
      });
      setVideoStream(stream);
      setTimeout(() => {
        const videoEl = document.getElementById('camera-stream') as HTMLVideoElement;
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.play().catch(err => {
            console.error("Video play error:", err);
          });
        }
      }, 300);
    } catch (err: any) {
      console.error('Lỗi mở camera:', err);
      setCameraError(lang === 'vi' 
        ? 'Không thể mở camera. Bạn hãy cấp quyền camera hoặc tải ảnh trực tiếp từ máy!' 
        : 'Cannot open camera. Please grant camera permission or upload directly!');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    const videoEl = document.getElementById('camera-stream') as HTMLVideoElement;
    if (!videoEl) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth || 640;
    canvas.height = videoEl.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setProofImage(dataUrl);
      stopCamera();
    }
  };

  const handleProofImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast(lang === 'vi' 
        ? 'Sai định dạng ảnh. Vui lòng chọn tệp tin hình ảnh (jpg, png, webp...)' 
        : 'Invalid image format. Please select an image file (jpg, png, webp...)', 'error');
      return;
    }

    if (file.size > 1 * 1024 * 1024) {
      showToast(lang === 'vi' 
        ? 'Ảnh minh chứng vượt quá giới hạn 1MB. Vui lòng chọn ảnh nhỏ hơn.' 
        : 'Proof image exceeds the 1MB limit. Please select a smaller image.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target?.result) {
        try {
          const compressed = await compressImage(event.target.result as string);
          setProofImage(compressed);
        } catch (err) {
          handleOperationError(err, 'xử lý ảnh minh chứng');
        }
      }
    };
    reader.onerror = () => {
      showToast(lang === 'vi' 
        ? 'Không thể tải ảnh lên, vui lòng thử lại.' 
        : 'Cannot upload image, please try again.', 'error');
    };
    reader.readAsDataURL(file);
  };

  const clearProofImage = () => {
    setProofImage(null);
  };

  const handleAddRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      showToast(t('Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.', 'You are not logged in or your session has expired. Please log in again.'), 'error');
      return;
    }
    setAchFormError('');
    setAchFormSuccess('');

    if (!achDescription.trim()) {
      setAchFormError('Vui lòng nhập mô tả thành tích.');
      return;
    }

    try {
      if (!navigator.onLine) {
        throw new Error('network-error');
      }

      const newId = `req_${generateId()}`;
      const newRequest: AchievementRequest = {
        id: newId,
        userId: currentUser.id,
        type: 'add',
        data: cleanFirestoreData({
          date: achDate,
          description: achDescription,
          category: achCategory,
          reward: calculatedReward,
          proofImage: proofImage || undefined
        }),
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      if (proofImage) {
        newRequest.proofImage = proofImage;
      }

      await setDoc(doc(db, "requests", newId), cleanFirestoreData(newRequest));

      setAchFormSuccess('Yêu cầu thêm thành tích đã được gửi đi kèm minh chứng! Vui lòng chờ Ông Bà duyệt.');
      showToast(t('Yêu cầu của bạn đã được gửi thành công!', 'Your request has been submitted successfully!'), 'success');
      setAchDescription('');
      setProofImage(null);
      setScoreQuantity(1);
      if (token) {
        await fetchPrivateData(token);
      }
    } catch (err) {
      handleOperationError(err, 'gửi yêu cầu duyệt');
      setAchFormError(t('Có lỗi xảy ra khi gửi yêu cầu.', 'An error occurred while submitting the request.'));
    }
  };

  // Submit Delete/Update Request for Users
  const handleRequestActionOnAchievement = async (type: 'update' | 'delete', ach: Achievement) => {
    if (!currentUser) {
      showToast(t('Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.', 'You are not logged in or your session has expired. Please log in again.'), 'error');
      return;
    }
    triggerConfirm(
      type === 'delete' ? 'Yêu cầu xoá thành tích' : 'Yêu cầu sửa thành tích',
      `Bạn có chắc chắn muốn gửi yêu cầu ${type === 'delete' ? 'XOÁ' : 'SỬA'} thành tích "${ach.description}" của bạn không?`,
      'Gửi Yêu Cầu',
      async () => {
        try {
          if (!navigator.onLine) {
            throw new Error('network-error');
          }
          const newId = `req_${generateId()}`;
          const newRequest: AchievementRequest = {
            id: newId,
            userId: currentUser.id,
            type,
            achievementId: ach.id,
            data: cleanFirestoreData({
              date: ach.date,
              description: ach.description,
              category: ach.category,
              reward: ach.reward
            }),
            status: 'pending',
            createdAt: new Date().toISOString()
          };

          await setDoc(doc(db, "requests", newId), cleanFirestoreData(newRequest));

          showToast('Yêu cầu đã được gửi thành công đến Ông Bà để xem xét!', 'success');
          if (token) {
            await fetchPrivateData(token);
          }
        } catch (err) {
          handleOperationError(err, type === 'delete' ? 'gửi yêu cầu xoá thành tích' : 'gửi yêu cầu sửa thành tích');
        }
      }
    );
  };

  // User/Admin Delete or Cancel Request
  const handleDeleteOrCancelRequest = async (id: string, description: string, status: 'pending' | 'approved' | 'rejected') => {
    let title = t('Xóa tin yêu cầu', 'Dismiss Request Log');
    let msg = t(`Bạn có chắc chắn muốn XÓA tin yêu cầu này khỏi danh sách không?`, `Are you sure you want to DISMISS this request log?`);
    let btnText = t('Xóa', 'Dismiss');

    if (status === 'pending') {
      title = t('Hủy yêu cầu chờ duyệt', 'Cancel Pending Request');
      msg = t(`Bạn có chắc chắn muốn HỦY yêu cầu chờ duyệt "${description}" không?`, `Are you sure you want to CANCEL your pending request "${description}"?`);
      btnText = t('Hủy Yêu Cầu', 'Cancel Request');
    } else if (status === 'approved') {
      title = t('Xóa lịch sử yêu cầu đã duyệt', 'Dismiss Approved Request Log');
      msg = t(`Bạn có chắc chắn muốn XÓA tin yêu cầu đã duyệt "${description}" khỏi danh sách chờ duyệt gần đây không?`, `Are you sure you want to DISMISS this approved request from recent list?`);
      btnText = t('Xóa tin này', 'Dismiss');
    } else if (status === 'rejected') {
      title = t('Xóa yêu cầu từ chối', 'Dismiss Rejected Request');
      msg = t(`Bạn có chắc chắn muốn XÓA yêu cầu bị từ chối "${description}" khỏi danh sách không?`, `Are you sure you want to DISMISS your rejected request "${description}"?`);
      btnText = t('Xóa', 'Delete');
    }
    
    triggerConfirm(
      title,
      msg,
      btnText,
      async () => {
        try {
          if (!navigator.onLine) {
            throw new Error('network-error');
          }
          await deleteDoc(doc(db, "requests", id));

          let successToast = t('Đã xóa yêu cầu khỏi danh sách!', 'Request dismissed!');
          if (status === 'pending') {
            successToast = t('Đã hủy yêu cầu thành công!', 'Request cancelled successfully!');
          } else if (status === 'approved') {
            successToast = t('Đã xóa tin yêu cầu đã duyệt thành công!', 'Approved request log dismissed successfully!');
          }
          showToast(successToast, 'success');
          if (token) {
            await fetchPrivateData(token);
          }
        } catch (err) {
          handleOperationError(err, 'xóa hoặc hủy yêu cầu');
        }
      }
    );
  };

  // Open Edit Pending Request Modal
  const handleOpenEditRequest = (req: any) => {
    setEditingRequest(req);
    setEditReqDescription(req.data.description);
    setEditReqCategory(req.data.category);
    setEditReqDate(req.data.date);
    setEditReqReward(req.data.reward);
    setEditReqProofImage(req.data.proofImage || req.proofImage || null);
    setIsEditCameraActive(false);
    setEditCameraError('');
  };

  const startEditCamera = async () => {
    setEditCameraError('');
    setIsEditCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      setVideoStream(stream);
      setTimeout(() => {
        const videoEl = document.getElementById('edit-camera-stream') as HTMLVideoElement;
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.play().catch(err => {
            console.error("Edit video play error:", err);
          });
        }
      }, 300);
    } catch (err: any) {
      console.error('Lỗi mở camera sửa:', err);
      setEditCameraError(lang === 'vi' 
        ? 'Không thể mở camera. Bạn hãy cấp quyền camera hoặc tải ảnh trực tiếp từ máy!' 
        : 'Cannot open camera. Please grant camera permission or upload directly!');
      setIsEditCameraActive(false);
    }
  };

  const stopEditCamera = () => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
    setIsEditCameraActive(false);
  };

  const captureEditPhoto = () => {
    const videoEl = document.getElementById('edit-camera-stream') as HTMLVideoElement;
    if (!videoEl) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth || 640;
    canvas.height = videoEl.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setEditReqProofImage(dataUrl);
      stopEditCamera();
    }
  };

  const handleEditProofImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast(lang === 'vi' 
        ? 'Sai định dạng ảnh. Vui lòng chọn tệp tin hình ảnh (jpg, png, webp...)' 
        : 'Invalid image format. Please select an image file (jpg, png, webp...)', 'error');
      return;
    }

    if (file.size > 1 * 1024 * 1024) {
      showToast(lang === 'vi' 
        ? 'Ảnh minh chứng vượt quá giới hạn 1MB. Vui lòng chọn ảnh nhỏ hơn.' 
        : 'Proof image exceeds the 1MB limit. Please select a smaller image.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target?.result) {
        try {
          const compressed = await compressImage(event.target.result as string);
          setEditReqProofImage(compressed);
        } catch (err) {
          handleOperationError(err, 'xử lý ảnh minh chứng');
        }
      }
    };
    reader.onerror = () => {
      showToast(lang === 'vi' 
        ? 'Không thể tải ảnh lên, vui lòng thử lại.' 
        : 'Cannot upload image, please try again.', 'error');
    };
    reader.readAsDataURL(file);
  };

  const clearEditProofImage = () => {
    setEditReqProofImage(null);
  };

  const handleUpdatePendingRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRequest) return;
    if (!currentUser) {
      showToast(t('Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.', 'You are not logged in or your session has expired. Please log in again.'), 'error');
      return;
    }

    if (!editReqDescription.trim()) {
      showToast(t('Vui lòng nhập mô tả thành tích', 'Please enter achievement description'), 'error');
      return;
    }

    try {
      if (!navigator.onLine) {
        throw new Error('network-error');
      }

      const reqRef = doc(db, "requests", editingRequest.id);
      const reqSnap = await getDoc(reqRef);
      if (!reqSnap.exists()) {
        showToast(t('Không tìm thấy yêu cầu', 'Request not found'), 'error');
        return;
      }

      const request = reqSnap.data() as AchievementRequest;
      
      // Verify session user still exists in Firestore
      const userRef = doc(db, "users", currentUser.id);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        showToast(t('Phiên đăng nhập đã hết hạn hoặc tài khoản không tồn tại. Vui lòng đăng nhập lại.', 'Session has expired or account does not exist. Please log in again.'), 'error');
        handleLogout();
        return;
      }

      const requestData = request.data || {};
      const updatedData = cleanFirestoreData({
        date: editReqDate || requestData.date,
        description: editReqDescription || requestData.description,
        category: editReqCategory || requestData.category,
        reward: (editReqReward !== undefined && !isNaN(Number(editReqReward))) ? Number(editReqReward) : requestData.reward,
        proofImage: editReqProofImage !== undefined ? editReqProofImage : requestData.proofImage
      });

      const updatedRequest = {
        ...request,
        data: updatedData,
        proofImage: editReqProofImage !== undefined ? editReqProofImage : request.proofImage
      };

      await setDoc(reqRef, cleanFirestoreData(updatedRequest));

      showToast(t('Đã cập nhật yêu cầu thành công!', 'Request updated successfully!'), 'success');
      setEditingRequest(null);
      if (token) {
        await fetchPrivateData(token);
      }
    } catch (err) {
      handleOperationError(err, 'cập nhật yêu cầu');
    }
  };

  // Admin Actions on Requests
  const handleProcessRequest = async (id: string, status: 'approve' | 'reject') => {
    const note = adminNotes[id] || (status === 'approve' ? 'Đã phê duyệt' : 'Không phê duyệt');
    const reqObj = requests.find(r => r.id === id);
    if (!reqObj) {
      showToast('Không tìm thấy yêu cầu này.', 'error');
      return;
    }
    const reqType = reqObj.type || 'add';
    try {
      const reqRef = doc(db, "requests", id);
      const reqSnap = await getDoc(reqRef);
      if (!reqSnap.exists()) {
        showToast('Không tìm thấy yêu cầu trong Firestore.', 'error');
        return;
      }
      const request = reqSnap.data() as AchievementRequest;

      if (request.status !== 'pending') {
        showToast('Yêu cầu đã được xử lý từ trước.', 'error');
        return;
      }

      if (status === 'approve') {
        if (reqType === 'add') {
          const newAchId = `ach_${generateId()}`;
          const newAchievement: Achievement = {
            id: newAchId,
            userId: request.userId,
            date: request.data?.date,
            description: request.data?.description,
            category: request.data?.category as any,
            reward: Number(request.data?.reward || 0),
            approvedBy: 'admin',
            createdAt: new Date().toISOString()
          };

          const proofImageVal = request.data?.proofImage || request.proofImage;
          if (proofImageVal !== undefined) {
            newAchievement.proofImage = proofImageVal;
          }

          await setDoc(doc(db, "achievements", newAchId), cleanFirestoreData(newAchievement));
        } else if (reqType === 'update' && request.achievementId) {
          const achRef = doc(db, "achievements", request.achievementId);
          const achSnap = await getDoc(achRef);
          if (achSnap.exists()) {
            const currentAch = achSnap.data() as Achievement;
            const updatedAchievement = {
              ...currentAch,
              date: request.data?.date || currentAch.date,
              description: request.data?.description || currentAch.description,
              category: (request.data?.category || currentAch.category) as any,
              reward: request.data?.reward !== undefined ? Number(request.data.reward) : currentAch.reward,
              proofImage: request.data?.proofImage || request.proofImage || currentAch.proofImage
            };
            await setDoc(achRef, cleanFirestoreData(updatedAchievement));
          }
        } else if (reqType === 'delete' && request.achievementId) {
          await deleteDoc(doc(db, "achievements", request.achievementId));
        }
        
        request.status = 'approved';
        request.adminNote = note || 'Đã phê duyệt';
      } else {
        request.status = 'rejected';
        request.adminNote = note || 'Từ chối bởi quản trị viên';
      }

      await setDoc(reqRef, cleanFirestoreData(request));

      let successMsg = 'Đã từ chối yêu cầu.';
      if (status === 'approve') {
        if (reqType === 'delete') {
          successMsg = 'Đã phê duyệt và xóa thành tích (trừ thưởng) thành công!';
        } else if (reqType === 'update') {
          successMsg = 'Đã phê duyệt và cập nhật thành tích thành công!';
        } else {
          successMsg = 'Đã phê duyệt và cộng thưởng cho cháu thành công!';
        }
      }
      showToast(successMsg, 'success');

      // Clear note state
      setAdminNotes(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });

      // Refresh data
      if (token) {
        await fetchPrivateData(token);
      }
      await fetchPublicData();
    } catch (err) {
      handleOperationError(err, 'xử lý yêu cầu');
    }
  };

  const handleAddPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      showToast(t('Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.', 'You are not logged in or your session has expired. Please log in again.'), 'error');
      return;
    }
    setPayoutError('');
    setPayoutSuccess('');

    if (!payoutUser) {
      setPayoutError('Vui lòng chọn cháu nhận thưởng.');
      return;
    }
    const amt = Number(payoutAmount);
    if (isNaN(amt) || amt <= 0) {
      setPayoutError('Vui lòng nhập số tiền hợp lệ.');
      return;
    }
    if (!payoutDesc.trim()) {
      setPayoutError('Vui lòng nhập mô tả dịp phát thưởng.');
      return;
    }

    try {
      if (!navigator.onLine) {
        throw new Error('network-error');
      }

      const newId = `pay_${generateId()}`;
      const newPayout: Payout = {
        id: newId,
        userId: payoutUser,
        date: payoutDate,
        description: payoutDesc,
        amount: amt,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "payouts", newId), cleanFirestoreData(newPayout));

      setPayoutSuccess('Ghi nhận phát tiền thưởng thành công!');
      showToast(t('Ghi nhận phát tiền thưởng thành công!', 'Payout recorded successfully!'), 'success');
      setPayoutAmount('');
      setPayoutDesc('');
      setPayoutUser('');
      
      if (token) {
        await fetchPrivateData(token);
      }
      await fetchPublicData();
    } catch (err) {
      handleOperationError(err, 'ghi nhận phát thưởng');
      setPayoutError(t('Có lỗi xảy ra khi ghi nhận phát thưởng.', 'An error occurred while recording the payout.'));
    }
  };

  // Admin direct create achievement
  const handleAdminDirectAchievement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminAchUser || !adminAchDesc || !adminAchReward) {
      showToast('Vui lòng điền đầy đủ thông tin.', 'error');
      return;
    }

    try {
      const newId = `ach_${generateId()}`;
      const newAchievement: Achievement = {
        id: newId,
        userId: adminAchUser,
        date: adminAchDate,
        description: adminAchDesc,
        category: adminAchCat as any,
        reward: Number(adminAchReward),
        approvedBy: 'admin',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "achievements", newId), cleanFirestoreData(newAchievement));

      showToast('Đã thêm trực tiếp thành tích mới cho cháu!', 'success');
      setAdminAchDesc('');
      if (token) {
        await fetchPrivateData(token);
      }
      await fetchPublicData();
    } catch (err) {
      console.error(err);
      showToast('Có lỗi xảy ra khi tạo thành tích.', 'error');
    }
  };

  // Admin delete achievement directly
  const handleDeleteAchievementDirect = async (id: string) => {
    triggerConfirm(
      'Xác nhận xoá trực tiếp',
      'Bạn có chắc chắn muốn xoá trực tiếp thành tích này? Thao tác này sẽ cập nhật ngay lập tức quỹ điểm của cháu mà không cần gửi yêu cầu chờ duyệt.',
      'Đồng ý Xoá',
      async () => {
        try {
          await deleteDoc(doc(db, "achievements", id));

          showToast('Đã xoá trực tiếp thành tích thành công.', 'success');
          if (token) {
            await fetchPrivateData(token);
          }
          await fetchPublicData();
        } catch (err) {
          console.error(err);
          showToast('Lỗi khi xoá thành tích.', 'error');
        }
      }
    );
  };

  // Admin delete payout directly
  const handleDeletePayoutDirect = async (id: string) => {
    triggerConfirm(
      'Xoá lịch sử chi tiền',
      'Bạn có chắc chắn muốn xoá lịch sử phát tiền mặt này không? Thao tác này sẽ hoàn lại số tiền tương ứng vào quỹ tích lũy chưa nhận của cháu.',
      'Đồng ý Xoá',
      async () => {
        try {
          await deleteDoc(doc(db, "payouts", id));

          showToast('Đã xoá lịch sử phát tiền thành công.', 'success');
          if (token) {
            await fetchPrivateData(token);
          }
          await fetchPublicData();
        } catch (err) {
          console.error(err);
          showToast('Lỗi khi xoá lịch sử chi tiền.', 'error');
        }
      }
    );
  };

  // Admin Change User Grade Level
  const handleUpdateUserGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editGradeUser || !editGradeLevel) {
      showToast('Vui lòng chọn cháu và cấp học học.', 'error');
      return;
    }

    const selectedChild = leaderboard.find(c => c.id === editGradeUser);
    const name = selectedChild ? selectedChild.nickname : 'Cháu';

    triggerConfirm(
      'Xác nhận đổi cấp học',
      `Bạn có chắc chắn muốn thay đổi cấp học của ${name} thành "${editGradeLevel}" không? Bảng quy đổi điểm thưởng sẽ được áp dụng theo cấp học mới này từ bây giờ.`,
      'Đồng ý Đổi',
      async () => {
        try {
          const userRef = doc(db, "users", editGradeUser);
          await updateDoc(userRef, { gradeLevel: editGradeLevel });

          showToast(`Đã thay đổi cấp học của ${name} thành "${editGradeLevel}" thành công!`, 'success');
          setEditGradeUser('');
          if (token) {
            await fetchPrivateData(token);
          }
          await fetchPublicData();
        } catch (err) {
          console.error(err);
          showToast('Lỗi khi cập nhật cấp học.', 'error');
        }
      }
    );
  };

  // Admin CRUD Family Accounts
  const handleCreateOrUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormUsername || !userFormName || !userFormNickname) {
      showToast('Vui lòng điền đầy đủ các thông tin bắt buộc!', 'error');
      return;
    }

    try {
      const cleanUsername = userFormUsername.trim().toLowerCase().replace(/\s+/g, '');
      
      // If editing, check other users for duplicate username
      // If creating, check all users for duplicate username
      const q = query(collection(db, "users"), where("username", "==", cleanUsername));
      const qSnap = await getDocs(q);
      
      if (editingUserId) {
        const duplicate = qSnap.docs.find(doc => doc.id !== editingUserId);
        if (duplicate) {
          showToast('Tên đăng nhập này đã được sử dụng bởi tài khoản khác!', 'error');
          return;
        }

        const userRef = doc(db, "users", editingUserId);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          showToast('Không tìm thấy tài khoản!', 'error');
          return;
        }

        const userData = userSnap.data() as User;
        const updatedUser = {
          ...userData,
          username: cleanUsername,
          name: userFormName.trim(),
          nickname: userFormNickname.trim(),
          role: userFormRole,
          gradeLevel: userFormRole === 'admin' ? 'N/A' : (userFormGrade || 'Cấp 2')
        };

        await setDoc(userRef, cleanFirestoreData(updatedUser));
        showToast('Cập nhật tài khoản thành công!', 'success');
      } else {
        if (!qSnap.empty) {
          showToast('Tên đăng nhập này đã tồn tại!', 'error');
          return;
        }

        const newId = 'user_' + Math.random().toString(36).substring(2, 9);
        const newUser: User = {
          id: newId,
          username: cleanUsername,
          name: userFormName.trim(),
          nickname: userFormNickname.trim(),
          role: userFormRole,
          gradeLevel: userFormRole === 'admin' ? 'N/A' : (userFormGrade || 'Cấp 2')
        };

        await setDoc(doc(db, "users", newId), cleanFirestoreData(newUser));
        showToast('Tạo tài khoản mới thành công!', 'success');
      }

      // Reset form
      setEditingUserId(null);
      setUserFormUsername('');
      setUserFormName('');
      setUserFormNickname('');
      setUserFormRole('user');
      setUserFormGrade('Cấp 2');

      // Refresh data
      if (token) {
        await fetchPrivateData(token);
      }
      await fetchPublicData();
    } catch (err) {
      console.error(err);
      showToast('Có lỗi xảy ra khi lưu tài khoản.', 'error');
    }
  };

  const handleStartEditUser = (user: any) => {
    setEditingUserId(user.id);
    setUserFormUsername(user.username);
    setUserFormName(user.name);
    setUserFormNickname(user.nickname);
    setUserFormRole(user.role);
    setUserFormGrade(user.gradeLevel || 'Cấp 2');
  };

  const handleCancelEditUser = () => {
    setEditingUserId(null);
    setUserFormUsername('');
    setUserFormName('');
    setUserFormNickname('');
    setUserFormRole('user');
    setUserFormGrade('Cấp 2');
  };

  const handleDeleteUser = async (userId: string, userNickname: string) => {
    if (currentUser && userId === currentUser.id) {
      showToast('Bạn không thể tự xóa chính mình!', 'error');
      return;
    }

    triggerConfirm(
      'Xác nhận xóa tài khoản',
      `Bạn có chắc chắn muốn xóa tài khoản của ${userNickname}? Thao tác này không thể hoàn tác và cháu sẽ không thể đăng nhập được nữa.`,
      'Đồng ý Xóa',
      async () => {
        try {
          await deleteDoc(doc(db, "users", userId));

          showToast(`Đã xóa tài khoản của ${userNickname} thành công!`, 'success');
          if (token) {
            await fetchPrivateData(token);
          }
          await fetchPublicData();
        } catch (err) {
          console.error(err);
          showToast('Lỗi khi xóa tài khoản.', 'error');
        }
      }
    );
  };

  // Admin Save Rule (Add or Edit)
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || currentUser.role !== 'admin') {
      showToast(t('Bạn không có quyền thực hiện thao tác này.', 'You do not have permission to perform this operation.'), 'error');
      return;
    }

    if (!ruleCategory.trim() || !ruleSubCategory.trim() || !ruleValue.trim()) {
      showToast(t('Vui lòng điền đầy đủ các thông tin.', 'Please fill in all fields.'), 'error');
      return;
    }

    const amt = Number(ruleRewardAmount);
    if (isNaN(amt) || amt < 0) {
      showToast(t('Số tiền thưởng không hợp lệ.', 'Invalid reward amount.'), 'error');
      return;
    }

    try {
      if (!navigator.onLine) {
        throw new Error('network-error');
      }

      let ruleId = editingRule?.id;
      if (!ruleId) {
        const numericIds = rules.map(r => parseInt(r.id)).filter(id => !isNaN(id));
        const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
        ruleId = String(maxId + 1);
      }

      const updatedRule: RewardRule = {
        id: ruleId,
        category: ruleCategory.trim(),
        subCategory: ruleSubCategory.trim(),
        value: ruleValue.trim(),
        rewardAmount: amt
      };

      await setDoc(doc(db, "rules", ruleId), cleanFirestoreData(updatedRule));

      showToast(
        editingRule 
          ? t('Đã cập nhật mức thưởng thành công!', 'Updated reward level successfully!') 
          : t('Đã thêm mức thưởng mới thành công!', 'Added new reward level successfully!'), 
        'success'
      );
      setEditingRule(null);
      setIsAddingRule(false);
      await fetchPublicData();
    } catch (err) {
      handleOperationError(err, 'lưu mức thưởng');
    }
  };

  // Admin Delete Rule
  const handleDeleteRule = async (rule: RewardRule) => {
    if (!currentUser || currentUser.role !== 'admin') {
      showToast(t('Bạn không có quyền thực hiện thao tác này.', 'You do not have permission to perform this operation.'), 'error');
      return;
    }

    triggerConfirm(
      t('Xác nhận xóa mức thưởng', 'Confirm delete reward rule'),
      t(`Bạn có chắc chắn muốn xóa mức thưởng của "${rule.category} - ${rule.value || rule.subCategory}" không?`, `Are you sure you want to delete the reward rule for "${rule.category} - ${rule.value || rule.subCategory}"?`),
      t('Xóa', 'Delete'),
      async () => {
        try {
          if (!navigator.onLine) {
            throw new Error('network-error');
          }
          await deleteDoc(doc(db, "rules", rule.id));
          showToast(t('Đã xóa mức thưởng thành công!', 'Deleted reward rule successfully!'), 'success');
          await fetchPublicData();
        } catch (err) {
          handleOperationError(err, 'xóa mức thưởng');
        }
      }
    );
  };

  // Format currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  // Colors for charts
  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

  // Prepare chart data for categories
  const getCategoryChartData = () => {
    const cats: {[key: string]: number} = {};
    achievements.forEach(a => {
      cats[a.category] = (cats[a.category] || 0) + a.reward;
    });
    // Fallback if no private data is loaded yet, use pre-seeded statistics
    if (Object.keys(cats).length === 0 && leaderboard.length > 0) {
      return [
        { name: 'Toán', value: 3450000 },
        { name: 'Anh', value: 2100000 },
        { name: 'Văn', value: 850000 },
        { name: 'KHTN', value: 760000 },
        { name: 'Giải thưởng', value: 1600000 }
      ];
    }
    return Object.keys(cats).map(k => ({ name: k, value: cats[k] }));
  };

  const categoryChartData = getCategoryChartData();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans" id="app_root">
      
      {/* HEADER BAR */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40 transition-all duration-300 shadow-sm" id="header_section">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="bg-amber-100/90 p-2.5 rounded-2xl border border-amber-200 shadow-md shadow-amber-100/50 flex items-center justify-center transform hover:scale-105 transition-all" id="logo_container">
              <Trophy className="h-7 w-7 text-amber-600 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                {t('SỔ VÀNG KHEN THƯỞNG', 'HONOR ROLL REGISTRY')}
                <span className="text-[10px] md:text-xs font-bold bg-amber-500 text-white border border-amber-600 px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                  {t('Gia Đình', 'Family')}
                </span>
              </h1>
              <p className="text-xs md:text-sm text-slate-500 font-medium">
                {t('Ghi nhận thành tích học tập và tự động quy đổi điểm thưởng cho các cháu', 'Record academic achievements and auto-calculate rewards for kids')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 justify-start md:justify-end">
            {/* Language Selection Toggle */}
            <button
              onClick={toggleLanguage}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300 hover:text-indigo-600 transition-all cursor-pointer shadow-sm hover:scale-102 duration-250 active:scale-98"
              title={lang === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
              id="language_toggle"
            >
              <span className="text-base select-none">{lang === 'vi' ? '🇬🇧' : '🇻🇳'}</span>
              <span>{lang === 'vi' ? 'English' : 'Tiếng Việt'}</span>
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300 hover:text-indigo-600 transition-all cursor-pointer shadow-sm hover:scale-102 duration-250 active:scale-98"
              title={theme === 'light' ? t('Chuyển sang giao diện tối', 'Switch to Dark Mode') : t('Chuyển sang giao diện sáng', 'Switch to Light Mode')}
              id="theme_toggle"
            >
              {theme === 'light' ? (
                <>
                  <Moon className="h-4 w-4 text-slate-600" />
                  <span>{t('Giao diện tối', 'Dark Mode')}</span>
                </>
              ) : (
                <>
                  <Sun className="h-4 w-4 text-amber-500" />
                  <span>{t('Giao diện sáng', 'Light Mode')}</span>
                </>
              )}
            </button>

            {currentUser ? (
              <div className="flex items-center gap-3 bg-slate-100/80 px-3.5 py-1.5 rounded-xl border border-slate-200/80 shadow-inner" id="user_profile_box">
                <div className="bg-indigo-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm">
                  {currentUser.name[0]}
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">{t('Đã đăng nhập', 'Logged In')}</p>
                  <p className="text-xs font-bold text-slate-800 leading-tight">
                    {currentUser.name} {currentUser.nickname ? `(${currentUser.nickname})` : ''}
                  </p>
                </div>
                <button 
                  onClick={() => setShowChangePasswordModal(true)}
                  className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-slate-500 rounded-lg transition-colors border border-transparent hover:border-indigo-100 cursor-pointer ml-1"
                  title={t('Đổi mật khẩu', 'Change Password')}
                  id="btn_change_password_trigger"
                >
                  <Key className="h-4 w-4" />
                </button>
                <button 
                  onClick={handleLogout}
                  className="p-1.5 hover:bg-red-50 hover:text-red-600 text-slate-500 rounded-lg transition-colors border border-transparent hover:border-red-100 cursor-pointer ml-1"
                  title={t('Đăng xuất', 'Log Out')}
                  id="btn_logout"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="inline-flex items-center gap-2 bg-slate-900 text-white font-bold px-4 py-2 rounded-xl hover:bg-slate-800 active:scale-95 transition-all text-xs shadow-md cursor-pointer hover:shadow-indigo-500/10"
                id="btn_login_trigger"
              >
                <Lock className="h-3.5 w-3.5" />
                {t('Đăng nhập hệ thống', 'System Sign In')}
              </button>
            )}
          </div>
        </div>

        {/* SUB-NAVIGATION TABS */}
        <div className="bg-slate-100/60 border-t border-slate-200/80 px-4 py-1">
          <div className="max-w-7xl mx-auto flex gap-1.5 py-1 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'leaderboard' 
                  ? 'bg-white text-indigo-600 shadow-sm font-extrabold border border-slate-200/50' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
              id="tab_leaderboard"
            >
              🏆 {t('Bảng Xếp Hạng & Báo Cáo', 'Leaderboard & Reports')}
            </button>

            {currentUser && currentUser.role === 'user' && (
              <button
                onClick={() => setActiveTab('personal')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'personal' 
                    ? 'bg-white text-indigo-600 shadow-sm font-extrabold border border-slate-200/50' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
                id="tab_personal"
              >
                👤 {t(`Trang Cá Nhân (${currentUser.nickname})`, `Personal Portal (${currentUser.nickname})`)}
              </button>
            )}

            {currentUser && currentUser.role === 'admin' && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 relative ${
                  activeTab === 'admin' 
                    ? 'bg-white text-indigo-600 shadow-sm font-extrabold border border-slate-200/50' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
                id="tab_admin"
              >
                🛠️ {t('Bàn Làm Việc Ông Bà (Admin)', 'Grandparents Workspace (Admin)')}
                {requests.filter(r => r.status === 'pending').length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white ring-2 ring-white animate-bounce shadow-md">
                    {requests.filter(r => r.status === 'pending').length}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => setActiveTab('rules')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'rules' 
                  ? 'bg-white text-indigo-600 shadow-sm font-extrabold border border-slate-200/50' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
              id="tab_rules"
            >
              📖 {t('Thang Quy Thành Tích', 'Reward Scaling Scale')}
            </button>
          </div>
        </div>
      </header>

      {/* CORE CONTENT */}
      <main className="max-w-7xl mx-auto px-4 py-6 md:py-10" id="main_content_container">
        
        {/* Admin Pending Tasks Notice Banner */}
        {currentUser && currentUser.role === 'admin' && requests.filter(r => r.status === 'pending').length > 0 && (
          <div className="mb-6 bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-300 dark:border-amber-800/60 p-4.5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg shadow-amber-500/5">
            <div className="flex items-center gap-3.5 text-center sm:text-left flex-1">
              <div className="bg-amber-400 text-slate-950 p-2.5 rounded-xl border border-amber-300 shadow-sm animate-pulse flex items-center justify-center shrink-0">
                <Bell className="h-5 w-5 text-slate-950" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-amber-400 tracking-tight uppercase flex items-center gap-1.5 justify-center sm:justify-start">
                  {t('🔴 CÓ YÊU CẦU ĐANG CHỜ PHÊ DUYỆT!', '🔴 PENDING APPROVAL REQUESTS!')}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold mt-1 leading-relaxed">
                  {t(
                    `Kính thưa Ông Bà, hiện có ${requests.filter(r => r.status === 'pending').length} yêu cầu của các cháu đang chờ duyệt (bao gồm ${requests.filter(r => r.status === 'pending' && r.type === 'add').length} thêm, ${requests.filter(r => r.status === 'pending' && r.type === 'delete').length} xóa/hủy, ${requests.filter(r => r.status === 'pending' && r.type === 'update').length} sửa).`,
                    `Dear Grandparents, there are currently ${requests.filter(r => r.status === 'pending').length} pending requests waiting (including ${requests.filter(r => r.status === 'pending' && r.type === 'add').length} additions, ${requests.filter(r => r.status === 'pending' && r.type === 'delete').length} deletions, and ${requests.filter(r => r.status === 'pending' && r.type === 'update').length} edits).`
                  )}
                </p>
              </div>
            </div>
            {activeTab !== 'admin' && (
              <button
                onClick={() => setActiveTab('admin')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black px-5 py-3 rounded-xl transition-all shadow-md shadow-indigo-500/15 active:scale-95 cursor-pointer whitespace-nowrap uppercase tracking-wider shrink-0"
              >
                {t('👉 Vào Duyệt Ngay', '👉 Go Approve Now')}
              </button>
            )}
          </div>
        )}

        {/* TAB 1: LEADERBOARD & PUBLIC REPORT */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-8 animate-fade-in" id="leaderboard_view">
            
            {/* AGGREGATED STATS SECTION */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="aggregated_stats">
              <div className="bg-gradient-to-br from-white to-emerald-50/30 p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 flex items-center justify-between group">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('Tổng Quỹ Thưởng Tích Lũy', 'Total Cumulative Rewards')}</p>
                  <h3 className="text-2xl font-black text-slate-900 mt-1 leading-none tracking-tight">
                    {formatCurrency(leaderboard.reduce((sum, item) => sum + item.totalReward, 0))}
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 font-medium">{t('Tổng điểm thành tích quy đổi của các cháu', 'Total points-converted rewards for all kids')}</p>
                </div>
                <div className="bg-emerald-100/80 p-3 rounded-2xl border border-emerald-200/50 text-emerald-600 shadow-sm group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300">
                  <Trophy className="h-6 w-6" />
                </div>
              </div>

              <div className="bg-gradient-to-br from-white to-blue-50/30 p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 flex items-center justify-between group">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('Tổng Đã Phát Tiền', 'Total Distributed Cash')}</p>
                  <h3 className="text-2xl font-black text-slate-900 mt-1 leading-none tracking-tight">
                    {formatCurrency(leaderboard.reduce((sum, item) => sum + item.totalReceived, 0))}
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 font-medium">{t('Số tiền mặt Ông Bà đã phát trực tiếp', 'Actual cash handed out directly by Grandparents')}</p>
                </div>
                <div className="bg-blue-100/80 p-3 rounded-2xl border border-blue-200/50 text-blue-600 shadow-sm group-hover:scale-110 group-hover:bg-blue-500 group-hover:text-white transition-all duration-300">
                  <DollarSign className="h-6 w-6" />
                </div>
              </div>

              <div className="bg-gradient-to-br from-white to-amber-50/30 p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 flex items-center justify-between group">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('Số Dư Chưa Phát Toàn Gia Đình', 'Family Remaining Balance')}</p>
                  <h3 className="text-2xl font-black text-slate-900 mt-1 leading-none tracking-tight">
                    {formatCurrency(leaderboard.reduce((sum, item) => sum + item.remainingBalance, 0))}
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 font-medium">{t('Chênh lệch tiền mặt cần thanh toán', 'Pending cash still to be handed out')}</p>
                </div>
                <div className="bg-amber-100/80 p-3 rounded-2xl border border-amber-200/50 text-amber-600 shadow-sm group-hover:scale-110 group-hover:bg-amber-500 group-hover:text-white transition-all duration-300">
                  <Activity className="h-6 w-6" />
                </div>
              </div>
            </div>

            {/* LEADERBOARD TABLE */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden" id="leaderboard_table_container">
              <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-indigo-50/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-base md:text-lg font-black text-slate-900 flex items-center gap-2">
                    🏆 {t('Bảng Thống Kê & Xếp Hạng Đồng Đội', 'Team Statistics & Leaderboard')}
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    {t('Bấm vào dòng của từng cháu để xem thống kê tổng quan chi tiết', 'Click on a child\'s row to view their detailed performance statistics')}
                  </p>
                </div>
                <span className="text-xs text-indigo-600 font-bold bg-indigo-50/60 px-3.5 py-1.5 rounded-xl border border-indigo-100/30 self-start sm:self-center">
                  {t('Cập nhật: 2026-06-30', 'Updated: June 30, 2026')}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/60 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200/60">
                      <th className="py-4 px-6 text-center w-16">{t('Hạng', 'Rank')}</th>
                      <th className="py-4 px-6">{t('Họ Tên', 'Full Name')}</th>
                      <th className="py-4 px-6">{t('Biệt Danh', 'Nickname')}</th>
                      <th className="py-4 px-6 text-right">{t('Tổng Thưởng', 'Total Reward')}</th>
                      <th className="py-4 px-6 text-right">{t('Đã Nhận', 'Received')}</th>
                      <th className="py-4 px-6 text-right">{t('Số Dư Còn Lại', 'Remaining')}</th>
                      <th className="py-4 px-6 text-center">{t('Thành Tích', 'Achievements')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...leaderboard]
                      .sort((a, b) => b.totalReward - a.totalReward)
                      .map((item, idx) => {
                        const balanceColor = item.remainingBalance < 0 
                          ? 'text-rose-600 bg-rose-50 border border-rose-100' 
                          : item.remainingBalance > 0 
                            ? 'text-emerald-600 bg-emerald-50 border border-emerald-100' 
                            : 'text-slate-500 bg-slate-50';
                        return (
                          <tr 
                            key={item.id}
                            onClick={() => setSelectedChildDetail(item)}
                            className="hover:bg-slate-50/80 cursor-pointer transition-all duration-150 active:bg-slate-100 border-b border-slate-100"
                            id={`row_${item.id}`}
                          >
                            <td className="py-4 px-6 text-center">
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-xl text-xs font-bold ${
                                idx === 0 ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-400/30 shadow-sm' :
                                idx === 1 ? 'bg-slate-200 text-slate-800' :
                                idx === 2 ? 'bg-amber-50 text-amber-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {idx + 1}
                              </span>
                            </td>
                            <td className="py-4 px-6 font-bold text-slate-800">
                              <div className="flex items-center gap-1.5">
                                <span>{item.name}</span>
                                {idx === 0 && <span className="text-amber-500 text-base" title={t('Quán quân', 'Champion')}>👑</span>}
                              </div>
                            </td>
                            <td className="py-4 px-6 text-slate-600">
                              <span className="px-2.5 py-1 bg-slate-100 border border-slate-200/60 rounded-lg text-[11px] font-bold text-slate-700">
                                {item.nickname}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-right font-black text-slate-900">
                              {formatCurrency(item.totalReward)}
                            </td>
                            <td className="py-4 px-6 text-right text-slate-500 font-semibold">
                              {formatCurrency(item.totalReceived)}
                            </td>
                            <td className="py-4 px-6 text-right">
                              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold inline-block shadow-sm ${balanceColor}`}>
                                {formatCurrency(item.remainingBalance)}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-center">
                              <span className="inline-flex items-center gap-1 bg-indigo-50/70 text-indigo-700 border border-indigo-100/30 px-3 py-1 rounded-xl text-xs font-bold">
                                <Award className="w-3.5 h-3.5 text-indigo-500" />
                                {item.achievementsCount} {t('bài', 'entries')}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* CHARTS GRAPHICS SECTION */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8" id="charts_container">
              
              {/* Yearly Rewards Comparison Chart */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-sm md:text-base font-black text-slate-950 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-indigo-500" />
                    {t('Tiền thưởng tích lũy theo năm (2025 vs 2026)', 'Cumulative Annual Rewards (2025 vs 2026)')}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">{t('So sánh chỉ số phát triển thành tích giữa các năm', 'Compare achievement progress between years')}</p>
                </div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={leaderboard}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="nickname" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} unit="đ" />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Legend />
                      <Bar dataKey="rewards2025" name={t('Năm 2025', 'Year 2025')} fill="#a78bfa" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="rewards2026" name={t('Năm 2026', 'Year 2026')} fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Achievements Category Pie Chart */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-sm md:text-base font-black text-slate-950 flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-emerald-500" />
                    {t('Cơ cấu tích luỹ thưởng theo môn học / hoạt động', 'Rewards Allocation by Subject / Activity')}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">{t('Tỷ trọng đóng góp quỹ thưởng gia đình', 'Proportion of family reward fund distribution')}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 items-center gap-4">
                  <div className="md:col-span-7 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {categoryChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="md:col-span-5 flex flex-col gap-2">
                    {categoryChartData.map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-2">
                        <span 
                          className="w-3 h-3 rounded-full shrink-0" 
                          style={{ backgroundColor: COLORS[index % COLORS.length] }} 
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-700 truncate">{entry.name}</p>
                          <p className="text-[10px] text-slate-500 font-semibold">{formatCurrency(entry.value)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* DETAILED OVERVIEW POPUP (MODAL) */}
            {selectedChildDetail && (
              <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-scale-up">
                  <div className="bg-slate-900 text-white p-6 relative">
                    <button 
                      onClick={() => setSelectedChildDetail(null)}
                      className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition-colors"
                    >
                      <X className="h-5 w-5" />
                    </button>
                    <span className="text-[9px] font-extrabold tracking-wider uppercase bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-xl">
                      {t('HỒ SƠ DANH HIỆU', 'HONORARY PROFILE')}
                    </span>
                    <h4 className="text-xl font-black mt-2">{selectedChildDetail.name}</h4>
                    <p className="text-xs text-slate-300 mt-1">{t(`Biệt danh thân mật: ${selectedChildDetail.nickname}`, `Affectionate nickname: ${selectedChildDetail.nickname}`)}</p>
                  </div>
                  
                  <div className="p-6 space-y-5">
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 text-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('Hạng học lực', 'Academic Grade')}</p>
                        <p className="text-xs font-bold text-slate-800 mt-1">{selectedChildDetail.gradeLevel}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 text-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('Thành tích đạt', 'Achievements')}</p>
                        <p className="text-xs font-bold text-slate-800 mt-1">{selectedChildDetail.achievementsCount} {t('lần', 'times')}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-xs py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-bold">{t('Tổng tiền thưởng đạt:', 'Total accumulated rewards:')}</span>
                        <span className="font-black text-slate-900">{formatCurrency(selectedChildDetail.totalReward)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-semibold">{t('Năm 2025:', 'Year 2025:')}</span>
                        <span className="font-bold text-slate-700">{formatCurrency(selectedChildDetail.rewards2025)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-semibold">{t('Năm 2026:', 'Year 2026:')}</span>
                        <span className="font-bold text-slate-700">{formatCurrency(selectedChildDetail.rewards2026)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-bold">{t('Đã nhận thanh toán:', 'Total cash distributed:')}</span>
                        <span className="font-black text-slate-700">{formatCurrency(selectedChildDetail.totalReceived)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs py-2 bg-indigo-50/50 px-3.5 rounded-xl border border-indigo-100/30">
                        <span className="text-indigo-950 font-black">{t('Số dư hiện tại:', 'Current balance:')}</span>
                        <span className={`font-black ${selectedChildDetail.remainingBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatCurrency(selectedChildDetail.remainingBalance)}
                        </span>
                      </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200/50 rounded-2xl p-3.5 flex gap-2.5">
                      <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                        {t(
                          'Để bảo mật riêng tư cá nhân theo quy định, danh sách điểm số cụ thể chỉ có thể xem bởi bản thân cháu đó (sau khi đăng nhập) và Ông Bà.',
                          'For privacy reasons, the detailed score lists can only be viewed by the child themselves (after logging in) and Grandparents.'
                        )}
                      </p>
                    </div>

                    <button 
                      onClick={() => setSelectedChildDetail(null)}
                      className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer text-xs"
                    >
                      {t('Đóng cửa sổ', 'Close Portal')}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* TAB 2: PERSONAL USER PORTAL */}
        {activeTab === 'personal' && currentUser && (
          <div className="space-y-8 animate-fade-in" id="personal_view">
            
            {/* Wallet Panel */}
            <div className="wallet-gradient-bg text-white p-6 md:p-8 rounded-3xl border shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
              <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 opacity-[0.03] select-none pointer-events-none">
                <Trophy className="w-64 h-64 text-white" />
              </div>
              <div className="space-y-2.5 relative z-10">
                <span className="text-[9px] font-extrabold bg-amber-400 text-slate-950 px-3 py-1 rounded-xl tracking-wider uppercase shadow-sm">
                  {t('Số Dư Tích Luỹ Cá Nhân', 'PERSONAL ACCUMULATED BALANCE')}
                </span>
                <h2 className="text-xl md:text-2xl font-black tracking-tight">{currentUser.name} {currentUser.nickname ? `(${currentUser.nickname})` : ''}</h2>
                <p className="text-xs text-slate-300 font-medium flex items-center gap-2">
                  {t('Cấp độ chấm thưởng hiện tại:', 'Current reward grade level:')} 
                  <span className="font-bold text-white bg-white/10 border border-white/20 px-2 py-0.5 rounded-lg text-[11px] backdrop-blur-xs">
                    {currentUser.gradeLevel}
                  </span>
                </p>
              </div>

              <div className="grid grid-cols-3 gap-6 w-full md:w-auto relative z-10 border-t border-white/10 md:border-0 pt-4 md:pt-0">
                <div className="text-center md:text-right">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('Tổng Thưởng Đạt', 'Total Rewards')}</p>
                  <p className="text-base md:text-xl font-black mt-1 text-emerald-400 leading-none">
                    {formatCurrency(achievements.reduce((sum, a) => sum + a.reward, 0))}
                  </p>
                </div>
                <div className="text-center md:text-right">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('Đã Nhận', 'Received')}</p>
                  <p className="text-base md:text-xl font-black mt-1 text-sky-400 leading-none">
                    {formatCurrency(payouts.reduce((sum, p) => sum + p.amount, 0))}
                  </p>
                </div>
                <div className="text-center md:text-right">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('Còn Lại', 'Remaining')}</p>
                  <p className={`text-base md:text-xl font-black mt-1 leading-none ${
                    (achievements.reduce((sum, a) => sum + a.reward, 0) - payouts.reduce((sum, p) => sum + p.amount, 0)) >= 0
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}>
                    {formatCurrency(achievements.reduce((sum, a) => sum + a.reward, 0) - payouts.reduce((sum, p) => sum + p.amount, 0))}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left Column: Submit Request Form */}
              <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-5">
                <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
                  <Plus className="h-5 w-5 text-indigo-500" />
                  <h3 className="text-sm md:text-base font-black text-slate-900">{t('Gửi Thành Tích Mới Lên Ông Bà', 'Submit Achievement to Grandparents')}</h3>
                </div>

                <form onSubmit={handleAddRequest} className="space-y-5">
                  {achFormError && (
                    <div className="bg-rose-50 text-rose-700 text-xs p-3.5 rounded-xl border border-rose-200/50 font-medium">
                      {achFormError}
                    </div>
                  )}
                  {achFormSuccess && (
                    <div className="bg-emerald-50 text-emerald-700 text-xs p-3.5 rounded-xl border border-emerald-200/50 font-medium">
                      {achFormSuccess}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('Ngày đạt điểm', 'Achievement Date')}</label>
                      <input 
                        type="date"
                        value={achDate}
                        onChange={(e) => setAchDate(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 focus:outline-none transition-all font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('Môn học / Thể loại', 'Subject / Category')}</label>
                      <input 
                        type="text"
                        value={achCategory}
                        onChange={(e) => setAchCategory(e.target.value)}
                        placeholder={t("Nhập môn học (VD: Toán, Tin học, Công nghệ...)", "Enter subject (e.g. Math, IT, Tech...)")}
                        className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 focus:outline-none transition-all font-semibold text-slate-900"
                        maxLength={50}
                      />
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {['Toán', 'Anh', 'Văn', 'KHTN', 'Tin học', 'Công nghệ', 'GDCD', 'Thể thao', 'Nghệ thuật', 'Việc nhà'].map((subject) => (
                          <button
                            key={subject}
                            type="button"
                            onClick={() => setAchCategory(subject)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                              achCategory === subject 
                                ? 'bg-indigo-600 text-white' 
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {subject}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('Quy cách tính thưởng', 'Reward Calculation Mode')}</label>
                    <div className="flex gap-2 p-1.5 bg-slate-100/80 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setAchType('grade')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          achType === 'grade' ? 'bg-white shadow-xs text-indigo-600 font-extrabold' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {t('Điểm số', 'Grade / Score')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAchType('contest')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          achType === 'contest' ? 'bg-white shadow-xs text-indigo-600 font-extrabold' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {t('Giải thưởng/Kỳ thi', 'Contest / Award')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAchType('custom')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          achType === 'custom' ? 'bg-white shadow-xs text-indigo-600 font-extrabold' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {t('Số tiền khác', 'Custom Amount')}
                      </button>
                    </div>
                  </div>

                  {achType === 'grade' && (
                    <div className="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-200/60">
                      <div className="grid grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">{t('Khối học', 'Grade Level')}</label>
                          <select
                            value={achGradeLevel}
                            onChange={(e) => setAchGradeLevel(e.target.value as any)}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white font-semibold mt-1"
                          >
                            <option value="Cấp 1">{t('Cấp 1', 'Primary (Grade 1-5)')}</option>
                            <option value="Cấp 2">{t('Cấp 2', 'Secondary (Grade 6-9)')}</option>
                            <option value="Cấp 3">{t('Cấp 3', 'High School (Grade 10-12)')}</option>
                            <option value="Đại học">{t('Đại học', 'University / College')}</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">{t('Điểm số', 'Grade Score')}</label>
                          <select
                            value={scoreGrade}
                            onChange={(e) => setScoreGrade(e.target.value)}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white font-bold mt-1 dark:bg-slate-800 dark:text-white"
                          >
                            {rules
                              .filter(r => r.subCategory === 'Điểm số' && r.category === achGradeLevel)
                              .map((r) => (
                                <option key={r.id} value={r.value}>
                                  {r.value}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">{t('Số lượng', 'Quantity')}</label>
                          <select
                            value={scoreQuantity}
                            onChange={(e) => setScoreQuantity(Number(e.target.value))}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white font-bold mt-1"
                          >
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                            <option value={3}>3</option>
                            <option value={4}>4</option>
                            <option value={5}>5</option>
                            <option value={6}>6</option>
                            <option value={7}>7</option>
                            <option value={8}>8</option>
                            <option value={9}>9</option>
                            <option value={10}>10</option>
                          </select>
                        </div>
                      </div>
                      <p className="text-[11px] text-indigo-950 font-medium leading-relaxed italic border-t border-slate-200 pt-2.5">
                        {t('Quy tắc hệ thống:', 'System rules:')} {achGradeLevel} {t('điểm', 'score')} {scoreGrade}
                        {scoreQuantity > 1 ? ` x ${scoreQuantity} ${t('con điểm', 'grades')}` : ''}{' '}
                        {t('quy đổi được', 'converts to')}{' '}
                        <span className="font-extrabold text-indigo-600">{formatCurrency(calculatedReward)}</span>.
                      </p>
                    </div>
                  )}

                  {achType === 'contest' && (
                    <div className="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-200/60">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">{t('Phạm vi kỳ thi', 'Contest Scope')}</label>
                          <select
                            value={contestLevel}
                            onChange={(e) => setContestLevel(e.target.value)}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white font-semibold mt-1"
                          >
                            <option value="Giải cấp trường">{t('Giải cấp trường', 'School Level')}</option>
                            <option value="Giải cấp phường">{t('Giải cấp phường', 'District/Ward Level')}</option>
                            <option value="Giải cấp thành phố">{t('Giải cấp thành phố', 'City/State Level')}</option>
                            <option value="Giải quốc tế">{t('Giải quốc tế', 'National / International')}</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">{t('Hạng giải', 'Contest Rank')}</label>
                          <select
                            value={contestAward}
                            onChange={(e) => setContestAward(e.target.value)}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white font-bold mt-1"
                          >
                            <option value="Giải nhất">{t('Giải nhất', 'First Place (Gold)')}</option>
                            <option value="Giải nhì">{t('Giải nhì', 'Second Place (Silver)')}</option>
                            <option value="Giải ba">{t('Giải ba', 'Third Place (Bronze)')}</option>
                            <option value="Giải khuyến khích">{t('Giải khuyến khích', 'Consolation Prize')}</option>
                          </select>
                        </div>
                      </div>
                      <p className="text-[11px] text-indigo-950 font-medium leading-relaxed italic border-t border-slate-200 pt-2.5">
                        {contestLevel} ({contestAward}) {t('quy đổi được', 'converts to')}{' '}
                        <span className="font-extrabold text-indigo-600">{formatCurrency(calculatedReward)}</span>.
                      </p>
                    </div>
                  )}

                  {achType === 'custom' && (
                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-200/60 space-y-2.5">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('Nhập số tiền mặt đề xuất (đ)', 'Proposed Cash Amount')}</label>
                      <input
                        type="number"
                        value={customReward}
                        onChange={(e) => setCustomReward(e.target.value)}
                        placeholder="Ví dụ: 150000"
                        className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white font-bold focus:outline-indigo-500"
                      />
                      <p className="text-[10px] text-amber-800 leading-relaxed font-semibold">
                        {t(
                          '*Lưu ý: Đối với thành tích đặc biệt hoặc ngoại lệ chưa có trong quy tắc, các cháu tự nhập số tiền đề xuất và Ông Bà sẽ quyết định lúc duyệt.',
                          '*Note: For special achievements or exceptions not listed in the standard rules, propose an amount and Grandparents will make the final decision.'
                        )}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('Mô tả chi tiết thành tích', 'Detailed Description of Achievement')}</label>
                    <textarea
                      rows={3}
                      value={achDescription}
                      onChange={(e) => setAchDescription(e.target.value)}
                      placeholder={t("Ví dụ: 'Cháu đạt điểm 10 kiểm tra cuối kỳ môn Toán lớp 4A1'", "Example: 'I scored 10 points in the final Math test of grade 4A1'")}
                      className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 focus:outline-none transition-all font-medium"
                    />
                  </div>

                  {/* PHOTO PROOF UPLOAD / CAMERA CAPTURE */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {t('📸 Minh chứng thành tích / Ảnh chụp thực tế', '📸 Achievement Proof / Real-time Photo')}
                    </label>
                    
                    <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3">
                      {/* Active Camera Stream View */}
                      {isCameraActive && (
                        <div className="space-y-2.5">
                          <div className="relative overflow-hidden rounded-xl border border-slate-300 bg-black aspect-video flex items-center justify-center">
                            <video 
                              id="camera-stream" 
                              className="w-full h-full object-cover"
                              playsInline 
                              muted
                            />
                            <div className="absolute top-2 left-2 bg-rose-500 text-white text-[9px] px-2 py-0.5 rounded-md font-bold tracking-wider uppercase animate-pulse">
                              LIVE CAMERA
                            </div>
                          </div>
                          {cameraError && (
                            <p className="text-[11px] text-rose-600 font-medium">{cameraError}</p>
                          )}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={capturePhoto}
                              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Camera className="h-4 w-4" />
                              {t('Bấm Chụp Ảnh', 'Snap Photo')}
                            </button>
                            <button
                              type="button"
                              onClick={stopCamera}
                              className="px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                            >
                              {t('Hủy', 'Cancel')}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Not active camera, and no photo selected yet */}
                      {!isCameraActive && !proofImage && (
                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            onClick={startCamera}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/50 p-4 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98"
                          >
                            <Camera className="h-6 w-6 text-indigo-600" />
                            <span>{t('Chụp ảnh camera', 'Take Live Photo')}</span>
                          </button>
                          
                          <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/50 p-4 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98 text-center">
                            <Upload className="h-6 w-6 text-slate-600" />
                            <span>{t('Tải ảnh từ máy', 'Upload From Device')}</span>
                            <input 
                              type="file" 
                              accept="image/*" 
                              onChange={handleProofImageUpload}
                              className="hidden" 
                            />
                          </label>
                        </div>
                      )}

                      {/* Display Selected Image Thumbnail */}
                      {proofImage && (
                        <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-xs relative">
                          <div className="relative h-16 w-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shrink-0 group">
                            <img 
                              src={proofImage} 
                              alt="Proof preview" 
                              className="h-full w-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => setActiveProofModal(proofImage)}
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                              <span className="text-[9px] text-white font-bold uppercase">{t('Xem to', 'Zoom')}</span>
                            </div>
                          </div>
                          
                          <div className="flex-1 space-y-1">
                            <p className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                              <ImageIcon className="h-3.5 w-3.5 text-emerald-500" />
                              {t('Đã lưu minh chứng', 'Proof captured')}
                            </p>
                            <p className="text-[9px] text-slate-400 font-medium">{t('Nhấn vào ảnh để xem kích thước đầy đủ', 'Click image to view full scale')}</p>
                          </div>

                          <button
                            type="button"
                            onClick={clearProofImage}
                            className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                            title={t('Xóa ảnh này', 'Remove Image')}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* PREVIEW BOX */}
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex justify-between items-center shadow-inner">
                    <span className="text-xs font-bold text-indigo-900">{t('Số tiền thưởng quy đổi:', 'Estimated Reward Amount:')}</span>
                    <span className="text-base font-black text-indigo-700">{formatCurrency(calculatedReward)}</span>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-all text-xs active:scale-98 cursor-pointer shadow-sm hover:shadow-indigo-500/10"
                  >
                    {t('Gửi yêu cầu kiểm duyệt', 'Submit Reward Request')}
                  </button>
                </form>
              </div>

              {/* Right Column: Achievements & Requests Logs */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Pending Requests */}
                {requests.length > 0 && (
                  <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
                    <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-500" />
                      {t('Yêu Cầu Chờ Duyệt Gần Đây', 'Recent Pending Requests')}
                    </h3>
                    <div className="space-y-3.5 max-h-60 overflow-y-auto pr-1">
                      {requests.map(req => {
                        const statusColors = req.status === 'pending' 
                          ? 'bg-amber-50 text-amber-800 border-amber-100'
                          : req.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                            : 'bg-red-50 text-red-800 border-red-100';

                        const actionLabel = req.type === 'add' 
                          ? t('Yêu cầu THÊM', 'Request to ADD') 
                          : req.type === 'update' 
                            ? t('Yêu cầu SỬA', 'Request to EDIT') 
                            : t('Yêu cầu XOÁ', 'Request to DELETE');

                        return (
                          <div key={req.id} className="border border-slate-150 p-4 rounded-2xl text-xs space-y-2.5 hover:shadow-sm transition-all duration-200">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-800 flex items-center gap-1.5">{actionLabel}</span>
                              <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-bold ${statusColors}`}>
                                {req.status === 'pending' ? t('Chờ duyệt', 'Pending') : req.status === 'approved' ? t('Đã duyệt', 'Approved') : t('Từ chối', 'Rejected')}
                              </span>
                            </div>
                            <p className="text-slate-600 font-semibold leading-relaxed">{t('Mô tả:', 'Description:')} {req.data.description}</p>
                            
                            {/* Display Proof Image Thumbnail in Request Item if available */}
                            {(req.data.proofImage || req.proofImage) && (
                              <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 max-w-max mt-1">
                                <img 
                                  src={req.data.proofImage || req.proofImage} 
                                  alt="Proof proof" 
                                  className="h-12 w-16 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-90 transition-opacity"
                                  onClick={() => setActiveProofModal(req.data.proofImage || req.proofImage)}
                                />
                                <span className="text-[10px] text-slate-500 font-semibold">📷 {t('Minh chứng', 'Proof Photo')}</span>
                              </div>
                            )}

                            <div className="flex justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                              <span>{t('Tiền thưởng đề xuất:', 'Proposed reward:')} <b className="text-indigo-600 font-extrabold">{formatCurrency(req.data.reward)}</b></span>
                              <span>{t('Ngày gửi:', 'Date:')} {req.createdAt.split('T')[0]}</span>
                            </div>
                            {req.adminNote && (
                              <p className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                                💬 <b>{t('Phản hồi:', 'Feedback:')}</b> {req.adminNote}
                              </p>
                            )}
                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 mt-2">
                              {req.status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditRequest(req)}
                                  className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-xl border bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border-indigo-200/40 hover:border-indigo-300 transition-all cursor-pointer"
                                >
                                  <Edit className="h-3 w-3" />
                                  {t('Chỉnh sửa', 'Edit')}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteOrCancelRequest(req.id, req.data.description, req.status)}
                                className={`flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                                  req.status === 'pending'
                                    ? 'bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border-slate-200 hover:border-rose-250'
                                    : 'bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 border-rose-200/40'
                                }`}
                              >
                                {req.status === 'pending' ? <X className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
                                {req.status === 'pending' ? t('Hủy yêu cầu', 'Cancel Request') : t('Xóa tin này', 'Dismiss')}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Achievements List */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-500" />
                    {t('Sổ Điểm Thành Tích Đã Được Duyệt', 'Approved Academic Honor Roll')}
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/60 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200/50">
                          <th className="py-3 px-3">{t('Ngày', 'Date')}</th>
                          <th className="py-3 px-3">{t('Mô tả', 'Description')}</th>
                          <th className="py-3 px-3">{t('Môn', 'Subject')}</th>
                          <th className="py-3 px-3 text-right">{t('Tiền thưởng', 'Reward')}</th>
                          <th className="py-3 px-3 text-center">{t('Yêu cầu sửa/xoá', 'Modify/Delete')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {achievements.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-400 font-medium">
                              {t('Chưa có thành tích nào được ghi nhận. Hãy gửi thành tích đầu tiên của bạn!', 'No achievements recorded yet. Submit your first one above!')}
                            </td>
                          </tr>
                        ) : (
                          achievements.map(ach => (
                            <tr key={ach.id} className="hover:bg-slate-50/50">
                              <td className="py-3.5 px-3 text-slate-500 font-medium whitespace-nowrap">{ach.date}</td>
                              <td className="py-3.5 px-3 font-bold text-slate-800 leading-relaxed">
                                <div>{ach.description}</div>
                                {ach.proofImage && (
                                  <div className="mt-1.5 flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setActiveProofModal(ach.proofImage!)}
                                      className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-md transition-all cursor-pointer border border-indigo-200/40"
                                    >
                                      <ImageIcon className="h-3 w-3" />
                                      {t('Xem minh chứng', 'View Proof')}
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td className="py-3.5 px-3 text-slate-600">
                                <span className="px-2 py-0.5 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-600 border border-slate-200/40">
                                  {ach.category}
                                </span>
                              </td>
                              <td className="py-3.5 px-3 text-right font-extrabold text-emerald-600">{formatCurrency(ach.reward)}</td>
                              <td className="py-3.5 px-3 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleRequestActionOnAchievement('update', ach)}
                                    className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer"
                                    title={t('Yêu cầu sửa', 'Request Edit')}
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleRequestActionOnAchievement('delete', ach)}
                                    className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                                    title={t('Yêu cầu xoá', 'Request Delete')}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Payouts list */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-blue-500" />
                    {t('Lịch Sử Đã Nhận Tiền Mặt Từ Ông Bà', 'Cash Distribution History')}
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/60 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200/50">
                          <th className="py-3 px-3">{t('Ngày nhận', 'Date Received')}</th>
                          <th className="py-3 px-3">{t('Dịp phát thưởng / Mô tả', 'Occasion / Description')}</th>
                          <th className="py-3 px-3 text-right">{t('Số tiền nhận', 'Cash Amount')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {payouts.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-6 text-center text-slate-400 font-medium">
                              {t('Chưa có ghi nhận nhận tiền thưởng trực tiếp.', 'No cash payouts recorded yet.')}
                            </td>
                          </tr>
                        ) : (
                          payouts.map(pay => (
                            <tr key={pay.id} className="hover:bg-slate-50/50">
                              <td className="py-3.5 px-3 text-slate-500 font-medium whitespace-nowrap">{pay.date}</td>
                              <td className="py-3.5 px-3 font-bold text-slate-800 leading-relaxed">{pay.description}</td>
                              <td className="py-3.5 px-3 text-right font-black text-blue-600">{formatCurrency(pay.amount)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* TAB 3: ADMIN CONSOLE */}
        {activeTab === 'admin' && currentUser && currentUser.role === 'admin' && (
          <div className="space-y-8 animate-fade-in" id="admin_view">
            
            {/* Admin Metrics bar */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-6" id="admin_metrics">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('Yêu cầu chờ duyệt', 'Pending Requests')}</p>
                <h3 className="text-xl md:text-2xl font-black text-amber-500">
                  {requests.filter(r => r.status === 'pending').length} {t('việc', 'tasks')}
                </h3>
                {requests.filter(r => r.status === 'pending').length > 0 && (
                  <p className="text-[10px] text-slate-500 font-medium leading-tight">
                    ({requests.filter(r => r.status === 'pending' && r.type === 'add').length} thêm,{' '}
                    {requests.filter(r => r.status === 'pending' && r.type === 'delete').length} xóa/hủy,{' '}
                    {requests.filter(r => r.status === 'pending' && r.type === 'update').length} sửa)
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('Tổng thành tích ghi nhận', 'Total Achievements')}</p>
                <h3 className="text-xl md:text-2xl font-black text-slate-900">{achievements.length} {t('lần', 'times')}</h3>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('Số lần phát tiền', 'Cash Payouts')}</p>
                <h3 className="text-xl md:text-2xl font-black text-slate-900">{payouts.length} {t('đợt', 'rounds')}</h3>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('Tổng tiền thưởng', 'Total Rewards')}</p>
                <h3 className="text-xl md:text-2xl font-black text-emerald-600">
                  {formatCurrency(achievements.reduce((sum, a) => sum + a.reward, 0))}
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left Side: Requests queue & Direct payout */}
              <div className="lg:col-span-8 space-y-8">
                
                {/* Pending Requests Queue */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-amber-500" />
                      <h3 className="text-sm md:text-base font-black text-slate-950">{t('Danh Sách Chờ Ông Bà Phê Duyệt', 'Waiting List for Grandparents Approval')}</h3>
                    </div>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {requests.filter(r => r.status === 'pending' && r.type === 'add').length > 0 && (
                        <span className="bg-emerald-100/80 text-emerald-800 text-[10px] px-2.5 py-1 rounded-xl font-bold">
                          {requests.filter(r => r.status === 'pending' && r.type === 'add').length} {t('yêu cầu khen thưởng', 'new rewards')}
                        </span>
                      )}
                      {requests.filter(r => r.status === 'pending' && r.type === 'delete').length > 0 && (
                        <span className="bg-rose-100/80 text-rose-800 text-[10px] px-2.5 py-1 rounded-xl font-extrabold animate-pulse">
                          {requests.filter(r => r.status === 'pending' && r.type === 'delete').length} {t('yêu cầu xóa', 'deletions')}
                        </span>
                      )}
                      {requests.filter(r => r.status === 'pending' && r.type === 'update').length > 0 && (
                        <span className="bg-blue-100/80 text-blue-800 text-[10px] px-2.5 py-1 rounded-xl font-bold">
                          {requests.filter(r => r.status === 'pending' && r.type === 'update').length} {t('yêu cầu sửa', 'edits')}
                        </span>
                      )}
                      {requests.filter(r => r.status === 'pending').length === 0 && (
                        <span className="bg-slate-100 text-slate-500 text-[10px] px-2.5 py-1 rounded-xl font-bold">
                          {t('0 việc chờ duyệt', '0 pending')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {requests.filter(r => r.status === 'pending').length === 0 ? (
                      <div className="text-center py-12 bg-slate-50/50 rounded-2xl border border-dashed border-slate-300">
                        <Check className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                        <p className="text-sm font-bold text-slate-800">{t('Thảnh thơi vô cùng!', 'Enjoying peaceful relaxation!')}</p>
                        <p className="text-xs text-slate-500 mt-1">{t('Các cháu chưa gửi thêm yêu cầu thành tích mới nào.', 'The children have not submitted any new achievements yet.')}</p>
                      </div>
                    ) : (
                      requests
                        .filter(r => r.status === 'pending')
                        .map(req => {
                          const requester = leaderboard.find(c => c.id === req.userId);
                          const actionLabel = req.type === 'add' 
                            ? t('THÊM THÀNH TÍCH', 'ADD ACHIEVEMENT') 
                            : req.type === 'update' 
                              ? t('SỬA THÀNH TÍCH', 'EDIT ACHIEVEMENT') 
                              : t('XOÁ THÀNH TÍCH', 'DELETE ACHIEVEMENT');

                          return (
                            <div key={req.id} className="border border-slate-200 p-4 rounded-2xl bg-slate-50/40 space-y-3.5 shadow-xs">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold bg-slate-900 text-white px-2.5 py-0.5 rounded-lg">
                                    {requester ? requester.nickname : 'Cháu'}
                                  </span>
                                  <span className="text-xs font-extrabold text-indigo-700">{actionLabel}</span>
                                </div>
                                <span className="text-[11px] text-slate-500 font-medium">{t('Ngày yêu cầu:', 'Requested date:')} {req.createdAt.split('T')[0]}</span>
                              </div>

                              <div className="text-xs space-y-2 text-slate-700">
                                <p className="leading-relaxed">📝 <b>{t('Mô tả:', 'Description:')}</b> {req.data.description}</p>
                                <div className="grid grid-cols-2 gap-4 bg-white p-2.5 rounded-xl border border-slate-200/60 font-medium">
                                  <p>📅 <b>{t('Ngày đạt:', 'Date achieved:')}</b> {req.data.date}</p>
                                  <p>🏷️ <b>{t('Phân mục:', 'Category:')}</b> {req.data.category}</p>
                                </div>
                                <p className="text-xs font-bold text-slate-800 flex items-center gap-1">
                                  💵 <b>{t('Tiền thưởng quy chuẩn:', 'Standard Reward:')}</b> <span className="font-black text-indigo-600 text-sm">{formatCurrency(req.data.reward)}</span>
                                </p>
                              </div>

                              {/* Display Proof Image to Grandparents for Verification */}
                              {(req.data.proofImage || req.proofImage) && (
                                <div className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-200">
                                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">📸 {t('Ảnh minh chứng thực tế:', 'Real-time Photo Proof:')}</span>
                                  <div className="relative group max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center">
                                    <img 
                                      src={req.data.proofImage || req.proofImage} 
                                      alt="Student Proof" 
                                      className="max-h-48 w-auto object-contain cursor-zoom-in hover:scale-102 transition-transform duration-200"
                                      onClick={() => setActiveProofModal(req.data.proofImage || req.proofImage)}
                                    />
                                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                      <span className="text-xs text-white font-extrabold bg-slate-900/80 px-3 py-1.5 rounded-xl shadow-md uppercase">{t('Xem ảnh kích thước lớn', 'Click to zoom')}</span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Admin Notes Box */}
                              <div className="space-y-2">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('Lời nhắn / Lời phê của Ông Bà (Tùy chọn)', 'Message / Review from Grandparents (Optional)')}</label>
                                <input
                                  type="text"
                                  value={adminNotes[req.id] || ''}
                                  onChange={(e) => setAdminNotes({ ...adminNotes, [req.id]: e.target.value })}
                                  placeholder={t("Ví dụ: 'Cháu ngoan xuất sắc, Ông Bà thưởng thêm 10k!'", "Example: 'Great effort, very proud of you!'")}
                                  className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white focus:outline-indigo-500 transition-all font-medium"
                                />
                              </div>

                              <div className="flex justify-end gap-2 pt-2">
                                <button
                                  onClick={() => handleProcessRequest(req.id, 'reject')}
                                  className="px-3.5 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200/60 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  {t('Từ chối', 'Reject')}
                                </button>
                                <button
                                  onClick={() => handleProcessRequest(req.id, 'approve')}
                                  className="px-4.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  {req.type === 'delete' 
                                    ? t('Duyệt Hủy / Xóa', 'Approve Deletion') 
                                    : req.type === 'update' 
                                      ? t('Duyệt Cập Nhật', 'Approve Edit') 
                                      : t('Duyệt & Thưởng', 'Approve & Reward')}
                                </button>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>

                {/* Manage all achievements directly (CRUD Panel) */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                    <h3 className="text-sm md:text-base font-black text-slate-950 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-emerald-500" />
                      {t('Xem & Sửa Trực Tiếp Toàn Bộ Danh Sách Thành Tích', 'Manage Achievements Directory')}
                    </h3>
                  </div>

                  <div className="overflow-x-auto max-h-96 overflow-y-auto pr-1">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/60 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200/50">
                          <th className="py-3 px-3">{t('Cháu', 'Child')}</th>
                          <th className="py-3 px-3">{t('Ngày', 'Date')}</th>
                          <th className="py-3 px-3">{t('Mô tả', 'Description')}</th>
                          <th className="py-3 px-3">{t('Phân mục', 'Category')}</th>
                          <th className="py-3 px-3 text-right">{t('Thưởng', 'Reward')}</th>
                          <th className="py-3 px-3 text-center">{t('Xoá', 'Delete')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {achievements.map(ach => {
                          const kid = leaderboard.find(c => c.id === ach.userId);
                          return (
                            <tr key={ach.id} className="hover:bg-slate-50/50">
                              <td className="py-3 px-3 font-bold text-slate-800">
                                {kid ? kid.nickname : 'N/A'}
                              </td>
                              <td className="py-3 px-3 text-slate-500 font-medium whitespace-nowrap">{ach.date}</td>
                              <td className="py-3 px-3 font-semibold text-slate-700 leading-relaxed">
                                <div>{ach.description}</div>
                                {ach.proofImage && (
                                  <div className="mt-1 flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setActiveProofModal(ach.proofImage!)}
                                      className="flex items-center gap-1 text-[9px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md transition-all cursor-pointer border border-indigo-200/40"
                                    >
                                      <ImageIcon className="h-2.5 w-2.5" />
                                      {t('Xem minh chứng', 'View Proof')}
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 text-slate-600">
                                <span className="px-2 py-0.5 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-500 border border-slate-200/30">
                                  {ach.category}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right font-extrabold text-emerald-600">{formatCurrency(ach.reward)}</td>
                              <td className="py-3 px-3 text-center">
                                <button
                                  onClick={() => handleDeleteAchievementDirect(ach.id)}
                                  className="p-1.5 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                  title={t('Xoá trực tiếp', 'Delete Directly')}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Manage all payouts directly (CRUD Panel for Payouts) */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                    <h3 className="text-sm md:text-base font-black text-slate-950 flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-indigo-500" />
                      {t('Xem & Sửa Trực Tiếp Lịch Sử Phát Tiền Mặt', 'Manage Cash Distribution Logs')}
                    </h3>
                  </div>

                  <div className="overflow-x-auto max-h-96 overflow-y-auto pr-1">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/60 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200/50">
                          <th className="py-3 px-3">{t('Cháu nhận', 'Recipient')}</th>
                          <th className="py-3 px-3">{t('Ngày phát', 'Date Paid')}</th>
                          <th className="py-3 px-3">{t('Dịp phát thưởng / Mô tả', 'Occasion / Description')}</th>
                          <th className="py-3 px-3 text-right">{t('Số tiền', 'Amount')}</th>
                          <th className="py-3 px-3 text-center">{t('Xoá', 'Delete')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {payouts.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-400 font-medium">
                              {t('Chưa có lịch sử phát tiền mặt.', 'No cash payouts recorded yet.')}
                            </td>
                          </tr>
                        ) : (
                          payouts.map(pay => {
                            const kid = leaderboard.find(c => c.id === pay.userId);
                            return (
                              <tr key={pay.id} className="hover:bg-slate-50/50">
                                <td className="py-3 px-3 font-bold text-slate-800">
                                  {kid ? kid.nickname : 'N/A'}
                                </td>
                                <td className="py-3 px-3 text-slate-500 font-medium whitespace-nowrap">{pay.date}</td>
                                <td className="py-3 px-3 font-semibold text-slate-700 leading-relaxed">{pay.description}</td>
                                <td className="py-3 px-3 text-right font-black text-blue-600">{formatCurrency(pay.amount)}</td>
                                <td className="py-3 px-3 text-center">
                                  <button
                                    onClick={() => handleDeletePayoutDirect(pay.id)}
                                    className="p-1.5 hover:bg-rose-50 text-slate-500 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                                    title={t('Xoá lịch sử chi', 'Delete Payout Log')}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Family Account Management Panel */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
                  <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                    <h3 className="text-sm md:text-base font-black text-slate-950 flex items-center gap-2">
                      <Users className="h-5 w-5 text-indigo-500" />
                      {t('Quản Lý Tài Khoản Thành Viên Gia Đình', 'Family Members Account Management')}
                    </h3>
                    <span className="bg-indigo-100/60 text-indigo-800 text-[10px] px-3 py-1 rounded-xl font-bold">
                      {allUsers.length} {t('tài khoản', 'accounts')}
                    </span>
                  </div>

                  {/* Form to Add/Edit User */}
                  <form onSubmit={handleCreateOrUpdateUser} className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-4.5 space-y-4">
                    <h4 className="text-xs font-black text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                      {editingUserId ? <Edit className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      {editingUserId ? t('Chỉnh Sửa Tài Khoản', 'Edit Member Account') : t('Thêm Thành Viên Mới', 'Add New Family Member')}
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Họ và tên thật', 'Full Name')}</label>
                        <input
                          type="text"
                          required
                          value={userFormName}
                          onChange={(e) => setUserFormName(e.target.value)}
                          placeholder="Ví dụ: Lê Minh Trí"
                          className="w-full text-xs border border-slate-300 rounded-xl p-3 bg-white focus:outline-indigo-500 font-medium transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Biệt danh / Nickname', 'Nickname')}</label>
                        <input
                          type="text"
                          required
                          value={userFormNickname}
                          onChange={(e) => setUserFormNickname(e.target.value)}
                          placeholder="Ví dụ: Bin"
                          className="w-full text-xs border border-slate-300 rounded-xl p-3 bg-white focus:outline-indigo-500 font-medium transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Tên đăng nhập (viết liền ko dấu)', 'Username (lowercase, no spaces)')}</label>
                        <input
                          type="text"
                          required
                          value={userFormUsername}
                          onChange={(e) => setUserFormUsername(e.target.value)}
                          placeholder="Ví dụ: bin"
                          className="w-full text-xs border border-slate-300 rounded-xl p-3 bg-white focus:outline-indigo-500 font-medium transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Vai trò', 'Role')}</label>
                        <select
                          value={userFormRole}
                          onChange={(e) => {
                            const val = e.target.value as 'user' | 'admin';
                            setUserFormRole(val);
                            if (val === 'admin') {
                              setUserFormGrade('N/A');
                            } else {
                              setUserFormGrade('Cấp 2');
                            }
                          }}
                          className="w-full text-xs border border-slate-300 rounded-xl p-3 bg-white font-bold text-slate-800 focus:outline-indigo-500"
                        >
                          <option value="user">{t('Cháu (Chấm điểm & Nhận thưởng)', 'Child (Grade & Rewards)')}</option>
                          <option value="admin">{t('Ông Bà / Phụ huynh (Admin duyệt điểm)', 'Grandparents / Parents (Admin reviewer)')}</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Cấp học (chỉ áp dụng với Cháu)', 'Grade Level (Only applicable to children)')}</label>
                        <select
                          disabled={userFormRole === 'admin'}
                          value={userFormGrade}
                          onChange={(e) => setUserFormGrade(e.target.value)}
                          className={`w-full text-xs border border-slate-300 rounded-xl p-3 bg-white font-bold text-slate-800 focus:outline-indigo-500 ${
                            userFormRole === 'admin' ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200' : ''
                          }`}
                        >
                          <option value="Cấp 1">{t('Cấp 1 (Tiểu học)', 'Primary (Grade 1-5)')}</option>
                          <option value="Cấp 2">{t('Cấp 2 (THCS)', 'Secondary (Grade 6-9)')}</option>
                          <option value="Cấp 3">{t('Cấp 3 (THPT)', 'High School (Grade 10-12)')}</option>
                          <option value="Đại học">{t('Đại học / Cao đẳng', 'University / College')}</option>
                          <option value="N/A">{t('N/A / Khác', 'N/A / Other')}</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                      {editingUserId && (
                        <button
                          type="button"
                          onClick={handleCancelEditUser}
                          className="px-4.5 py-2.5 bg-slate-250 text-slate-700 hover:bg-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          {t('Hủy bỏ', 'Cancel')}
                        </button>
                      )}
                      <button
                        type="submit"
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        {editingUserId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        {editingUserId ? t('Cập Nhật Tài Khoản', 'Update Account') : t('Thêm Mới', 'Add Member')}
                      </button>
                    </div>
                  </form>

                  {/* Users Table List */}
                  <div className="overflow-x-auto max-h-96 overflow-y-auto pr-1">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/60 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200/50">
                          <th className="py-3 px-3">{t('Thành viên', 'Member')}</th>
                          <th className="py-3 px-3">{t('Tên đăng nhập', 'Username')}</th>
                          <th className="py-3 px-3">{t('Vai trò', 'Role')}</th>
                          <th className="py-3 px-3">{t('Cấp học', 'Academic Level')}</th>
                          <th className="py-3 px-3 text-center">{t('Hành động', 'Actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {allUsers.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-400 font-medium">
                              {t('Đang tải danh sách tài khoản...', 'Loading accounts list...')}
                            </td>
                          </tr>
                        ) : (
                          allUsers.map(u => {
                            const isMe = currentUser && u.id === currentUser.id;
                            return (
                              <tr key={u.id} className={`hover:bg-slate-50/50 ${isMe ? 'bg-indigo-50/10' : ''}`}>
                                <td className="py-3 px-3">
                                  <div className="font-extrabold text-slate-800 flex items-center gap-1.5 flex-wrap">
                                    <span>{u.name}</span>
                                    {isMe && <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded font-black tracking-wider uppercase">{t('Bạn', 'You')}</span>}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-medium mt-0.5">{t('Biệt danh:', 'Nickname:')} {u.nickname}</div>
                                </td>
                                <td className="py-3 px-3 font-mono text-indigo-600 font-bold whitespace-nowrap">{u.username}</td>
                                <td className="py-3 px-3 whitespace-nowrap">
                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                    u.role === 'admin' 
                                      ? 'bg-purple-100/70 text-purple-800' 
                                      : 'bg-blue-100/70 text-blue-800'
                                  }`}>
                                    {u.role === 'admin' ? t('Ông Bà (Admin)', 'Grandparents (Admin)') : t('Cháu', 'Child')}
                                  </span>
                                </td>
                                <td className="py-3 px-3 whitespace-nowrap">
                                  {u.role === 'admin' ? (
                                    <span className="text-slate-300">—</span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-700 border border-slate-200/30">
                                      {u.gradeLevel || 'N/A'}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditUser(u)}
                                      className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer"
                                      title={t('Chỉnh sửa tài khoản', 'Edit Account')}
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                    </button>
                                    {!isMe && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteUser(u.id, u.nickname)}
                                        className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                        title={t('Xóa tài khoản', 'Delete Account')}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              {/* Right Side Panels: Record Payouts & Direct Add */}
              <div className="lg:col-span-4 space-y-8">
                
                {/* Direct Cash Payout (Thanh toán trực tiếp) */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-indigo-500" />
                    <h3 className="text-sm md:text-base font-black text-slate-950">{t('Ghi Nhận Phát Tiền Mặt', 'Record Cash Payout')}</h3>
                  </div>

                  <form onSubmit={handleAddPayout} className="space-y-4">
                    {payoutError && <div className="text-xs bg-red-50 text-red-700 p-2.5 rounded-xl border border-red-200 font-bold">{payoutError}</div>}
                    {payoutSuccess && <div className="text-xs bg-emerald-50 text-emerald-700 p-2.5 rounded-xl border border-emerald-200 font-bold">{payoutSuccess}</div>}

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Cháu nhận tiền mặt', 'Recipient child')}</label>
                      <select
                        value={payoutUser}
                        onChange={(e) => setPayoutUser(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-xl p-3 bg-white font-bold text-slate-800"
                      >
                        <option value="">{t('-- Chọn cháu --', '-- Select child --')}</option>
                        {leaderboard.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.nickname})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Ngày phát thưởng', 'Date Paid')}</label>
                      <input
                        type="date"
                        value={payoutDate}
                        onChange={(e) => setPayoutDate(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-xl p-3 font-bold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Số tiền phát thưởng (đ)', 'Cash Reward Amount (VND)')}</label>
                      <input
                        type="number"
                        value={payoutAmount}
                        onChange={(e) => setPayoutAmount(e.target.value)}
                        placeholder="Ví dụ: 200000"
                        className="w-full text-xs border border-slate-300 rounded-xl p-3 font-bold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Dịp khen thưởng / Lý do phát', 'Occasion / Reason of payment')}</label>
                      <input
                        type="text"
                        value={payoutDesc}
                        onChange={(e) => setPayoutDesc(e.target.value)}
                        placeholder={t("Ví dụ: 'Phát thưởng dịp về thăm quê Tết'", "Example: 'New Year Visit'")}
                        className="w-full text-xs border border-slate-300 rounded-xl p-3 font-bold text-slate-800"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition-all text-xs cursor-pointer shadow-md"
                    >
                      {t('Lưu thông tin thanh toán', 'Save Cash Payout')}
                    </button>
                  </form>
                </div>

                {/* Direct Add Achievement (Admin bypass check) */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
                    <Plus className="h-5 w-5 text-emerald-500" />
                    <h3 className="text-sm md:text-base font-black text-slate-950">{t('Thêm Trực Tiếp Thành Tích', 'Directly Add Achievement')}</h3>
                  </div>

                  <form onSubmit={handleAdminDirectAchievement} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Cháu được thưởng', 'Beneficiary child')}</label>
                      <select
                        value={adminAchUser}
                        onChange={(e) => setAdminAchUser(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-xl p-3 bg-white font-bold text-slate-800"
                      >
                        <option value="">{t('-- Chọn cháu --', '-- Select child --')}</option>
                        {leaderboard.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.nickname})</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Ngày đạt', 'Date achieved')}</label>
                        <input
                          type="date"
                          value={adminAchDate}
                          onChange={(e) => setAdminAchDate(e.target.value)}
                          className="w-full text-xs border border-slate-300 rounded-xl p-3 font-bold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Thể loại', 'Category')}</label>
                        <input
                          type="text"
                          value={adminAchCat}
                          onChange={(e) => setAdminAchCat(e.target.value)}
                          placeholder={t("VD: Toán, Anh, Tin học...", "e.g. Math, IT...")}
                          className="w-full text-xs border border-slate-300 rounded-xl p-3 bg-white font-bold text-slate-800"
                          maxLength={50}
                        />
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {['Toán', 'Anh', 'Văn', 'KHTN', 'Tin học', 'Công nghệ', 'GDCD', 'Việc nhà'].map((subject) => (
                            <button
                              key={subject}
                              type="button"
                              onClick={() => setAdminAchCat(subject)}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                adminAchCat === subject 
                                  ? 'bg-indigo-600 text-white' 
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {subject}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Số tiền thưởng trực tiếp (đ)', 'Direct Reward Amount (VND)')}</label>
                      <input
                        type="number"
                        value={adminAchReward}
                        onChange={(e) => setAdminAchReward(e.target.value)}
                        placeholder={t("Nhập số tiền", "Enter amount")}
                        className="w-full text-xs border border-slate-300 rounded-xl p-3 font-bold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Mô tả thành tích', 'Achievement description')}</label>
                      <input
                        type="text"
                        value={adminAchDesc}
                        onChange={(e) => setAdminAchDesc(e.target.value)}
                        placeholder="Ví dụ: 'Thưởng nóng 10 điểm Toán 1 tiết'"
                        className="w-full text-xs border border-slate-300 rounded-xl p-3 font-bold text-slate-800"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-all text-xs shadow-md cursor-pointer"
                    >
                      {t('Xác nhận thêm', 'Confirm Addition')}
                    </button>
                  </form>
                </div>

                {/* Change User Grade Level Card */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-indigo-500" />
                    <h3 className="text-sm md:text-base font-black text-slate-950">{t('Thay Đổi Cấp Học Các Cháu', 'Change Children Academic Level')}</h3>
                  </div>

                  <form onSubmit={handleUpdateUserGrade} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Chọn cháu cần đổi', 'Select child to modify')}</label>
                      <select
                        value={editGradeUser}
                        onChange={(e) => {
                          setEditGradeUser(e.target.value);
                          const matched = leaderboard.find(c => c.id === e.target.value);
                          if (matched) {
                            setEditGradeLevel(matched.gradeLevel);
                          }
                        }}
                        className="w-full text-xs border border-slate-300 rounded-xl p-3 bg-white font-bold text-slate-800 focus:outline-indigo-500"
                      >
                        <option value="">{t('-- Chọn cháu --', '-- Select child --')}</option>
                        {leaderboard.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.nickname}) — {t('Đang:', 'Current:')} {c.gradeLevel}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t('Chọn cấp học mới', 'Select new academic level')}</label>
                      <select
                        value={editGradeLevel}
                        onChange={(e) => setEditGradeLevel(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-xl p-3 bg-white font-bold text-slate-800 focus:outline-indigo-500"
                      >
                        <option value="Cấp 1">{t('Cấp 1 (Tiểu học)', 'Primary (Grade 1-5)')}</option>
                        <option value="Cấp 2">{t('Cấp 2 (THCS)', 'Secondary (Grade 6-9)')}</option>
                        <option value="Cấp 3">{t('Cấp 3 (THPT)', 'High School (Grade 10-12)')}</option>
                        <option value="Đại học">{t('Đại học / Cao đẳng', 'University / College')}</option>
                        <option value="N/A">{t('N/A / Khác', 'N/A / Other')}</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={!editGradeUser}
                      className={`w-full font-bold py-3 rounded-xl transition-all text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                        editGradeUser 
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white' 
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <GraduationCap className="h-4 w-4" />
                      {t('Xác nhận đổi cấp học', 'Confirm Grade Level Change')}
                    </button>
                  </form>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* TAB 4: RULE STANDARDS CONFIGURATOR */}
        {activeTab === 'rules' && (
          <div className="space-y-6 animate-fade-in" id="rules_view">
            
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                <div>
                  <h2 className="text-sm md:text-base font-black text-slate-950 flex items-center gap-2">
                    📖 {t('Bảng Thang Điểm Quy Đổi Thành Tích', 'Academic Reward Standards Table')}
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">{t('Chi tiết cơ chế tính tiền thưởng của Ông Bà cho từng khối cấp học', 'Detailed rewards system set by Grandparents for each academic grade level')}</p>
                </div>
                {currentUser?.role === 'admin' && (
                  <button
                    onClick={() => {
                      setIsAddingRule(true);
                      setEditingRule(null);
                      setRuleCategory('Cấp 1');
                      setRuleSubCategory('Điểm số');
                      setRuleValue('');
                      setRuleRewardAmount(0);
                    }}
                    className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-2 rounded-xl text-xs shadow-md cursor-pointer transition-all active:scale-95 shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('Thêm mức thưởng', 'Add Reward Level')}
                  </button>
                )}
              </div>

              {/* RULES TABLES VIEW */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8" id="rules_subsections">
                
                {/* Academic Scores Rules */}
                <div className="space-y-4">
                  <h3 className="text-xs md:text-sm font-black text-slate-950 border-l-4 border-amber-500 pl-2">
                    🎓 {t('Điểm Số Lớp Học Quy Ra Tiền Thưởng', 'Academic Exam Scores Rewards')}
                  </h3>
                  <div className="overflow-x-auto border border-slate-200/60 rounded-2xl">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/60 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200/50">
                          <th className="py-2.5 px-3">{t('Cấp học', 'Level')}</th>
                          <th className="py-2.5 px-3">{t('Điểm số', 'Score')}</th>
                          <th className="py-2.5 px-3 text-right">{t('Mức thưởng', 'Reward amount')}</th>
                          {currentUser?.role === 'admin' && (
                            <th className="py-2.5 px-3 text-center w-24">{t('Thao tác', 'Actions')}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {rules
                          .filter(r => r.subCategory === 'Điểm số')
                          .map(rule => (
                            <tr key={rule.id} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3 font-bold text-slate-700">{rule.category}</td>
                              <td className="py-2.5 px-3 font-extrabold text-slate-950">{rule.value}</td>
                              <td className="py-2.5 px-3 text-right font-extrabold text-indigo-600">{formatCurrency(rule.rewardAmount)}</td>
                              {currentUser?.role === 'admin' && (
                                <td className="py-2.5 px-3 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => {
                                        setEditingRule(rule);
                                        setIsAddingRule(false);
                                        setRuleCategory(rule.category);
                                        setRuleSubCategory(rule.subCategory);
                                        setRuleValue(rule.value);
                                        setRuleRewardAmount(rule.rewardAmount);
                                      }}
                                      className="p-1 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/45 rounded-lg transition-colors cursor-pointer"
                                      title={t('Sửa', 'Edit')}
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteRule(rule)}
                                      className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/45 rounded-lg transition-colors cursor-pointer"
                                      title={t('Xóa', 'Delete')}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Contest & Extra Awards rules */}
                <div className="space-y-4">
                  <h3 className="text-xs md:text-sm font-black text-slate-950 border-l-4 border-indigo-500 pl-2">
                    🏅 {t('Giải Thưởng Kỳ Thi & Cuộc Thi Các Cấp', 'Competitive & Talent Awards')}
                  </h3>
                  <div className="overflow-x-auto border border-slate-200/60 rounded-2xl">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/60 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200/50">
                          <th className="py-2.5 px-3">{t('Cấp Giải', 'Competition Scope')}</th>
                          <th className="py-2.5 px-3">{t('Hạng Giải', 'Award Rank')}</th>
                          <th className="py-2.5 px-3 text-right">{t('Mức thưởng', 'Reward amount')}</th>
                          {currentUser?.role === 'admin' && (
                            <th className="py-2.5 px-3 text-center w-24">{t('Thao tác', 'Actions')}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {rules
                          .filter(r => r.subCategory !== 'Điểm số')
                          .map(rule => (
                            <tr key={rule.id} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3 font-bold text-slate-700">{rule.category}</td>
                              <td className="py-2.5 px-3 font-extrabold text-slate-950">{rule.subCategory}</td>
                              <td className="py-2.5 px-3 text-right font-extrabold text-indigo-600">{formatCurrency(rule.rewardAmount)}</td>
                              {currentUser?.role === 'admin' && (
                                <td className="py-2.5 px-3 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => {
                                        setEditingRule(rule);
                                        setIsAddingRule(false);
                                        setRuleCategory(rule.category);
                                        setRuleSubCategory(rule.subCategory);
                                        setRuleValue(rule.value);
                                        setRuleRewardAmount(rule.rewardAmount);
                                      }}
                                      className="p-1 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/45 rounded-lg transition-colors cursor-pointer"
                                      title={t('Sửa', 'Edit')}
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteRule(rule)}
                                      className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/45 rounded-lg transition-colors cursor-pointer"
                                      title={t('Xóa', 'Delete')}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              {/* GRANDPARENTS DECISION NOTICES */}
              <div className="bg-slate-50/60 border border-slate-200/80 p-5 rounded-3xl space-y-3.5">
                <h4 className="text-xs font-black text-slate-900 flex items-center gap-2">
                  <Info className="h-4 w-4 text-slate-600" />
                  {t('Quy định Ghi nhận & Trao giải của Ông Bà', 'Grandparents Official Regulations & Criteria')}
                </h4>
                <ul className="text-xs text-slate-600 space-y-2 list-disc pl-5 leading-relaxed font-medium">
                  <li>
                    <b>{t('Nhắn tin báo công:', 'Instant notification:')}</b> {t('Các cháu nhắn tin qua Zalo hoặc gọi điện ngay sau khi có điểm để Ông Bà cập nhật sổ điểm.', 'Children should text over Zalo or phone immediately upon receiving their grades for prompt ledger updates.')}
                  </li>
                  <li>
                    <b>{t('Ngoại lệ & Thành tích mới:', 'Special exceptions:')}</b> {t('Ông Bà giữ quyền tự quyết số tiền thưởng đối với các thành tích mới, đặc biệt xuất sắc hoặc ngoại hạng (ví dụ học vượt cấp, giải thưởng cộng đồng...).', 'Grandparents reserve complete discretionary authority for out-of-scale, community, or fast-track achievements.')}
                  </li>
                  <li>
                    <b>{t('Phát thưởng trực tiếp:', 'Physical distribution:')}</b> {t('Tiền mặt sẽ được Ông Bà phát tận tay khi các cháu về thăm quê hoặc tụ họp gia đình vào các dịp lễ tết.', 'Cash will be personally delivered by hand when children visit the hometown or during family gatherings on holidays.')}
                  </li>
                </ul>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="bg-[#0f172a] dark:bg-[#020617] text-slate-400/95 pt-16 pb-12 border-t border-[#1e293b]/60 relative overflow-hidden" id="footer_section">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.05),transparent_40%)] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pb-12 border-b border-[#1e293b]/60">
            
            {/* Column 1: Brand & Description */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="bg-amber-400 text-slate-950 p-2 rounded-2xl border border-amber-300 shadow-md">
                  <Trophy className="h-5 w-5" />
                </div>
                <span className="text-base font-black text-white tracking-wide uppercase">
                  {t('SỔ VÀNG GIA ĐÌNH', 'FAMILY GOLDEN LEDGER')}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-400 max-w-sm font-medium">
                {t(
                  'Xây dựng với tâm huyết để lưu giữ những nỗ lực học tập của thế hệ tương lai. Khuyến khích sự chăm ngoan, tiến bộ của mỗi cháu trong học tập và các hoạt động thể thao.',
                  'Crafted with love and dedication to document the learning endeavors of our future generations. Encouraging wisdom, diligence, and academic or athletic progress.'
                )}
              </p>
              
              {/* SSL Secure Badge */}
              <div className="flex items-center gap-2 pt-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-emerald-400" />
                  {t('Hệ thống bảo mật & riêng tư nội bộ', 'Secure & private family network')}
                </span>
              </div>
            </div>

            {/* Column 2: Live Statistics */}
            <div className="lg:col-span-4 space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {t('Thống Kê Sổ Điểm Real-time', 'Ledger Live Metrics')}
              </h4>
              <div className="grid grid-cols-2 gap-3.5">
                <div className="bg-slate-950/40 p-3.5 rounded-2xl border border-[#1e293b]/60">
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{t('Thành tích đạt', 'Achievements')}</p>
                  <p className="text-base font-black text-amber-400 mt-1">{achievements.length} {t('lần', 'times')}</p>
                </div>
                <div className="bg-slate-950/40 p-3.5 rounded-2xl border border-[#1e293b]/60">
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{t('Phát thưởng', 'Cash Payouts')}</p>
                  <p className="text-base font-black text-blue-400 mt-1">{payouts.length} {t('đợt', 'rounds')}</p>
                </div>
                <div className="bg-slate-950/40 p-3.5 rounded-2xl border border-[#1e293b]/60 col-span-2">
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{t('Tổng giá trị đã ghi nhận', 'Total Earned Rewards')}</p>
                  <p className="text-lg font-black text-emerald-400 mt-1">
                    {formatCurrency(achievements.reduce((sum, a) => sum + a.reward, 0))}
                  </p>
                </div>
              </div>
            </div>

            {/* Column 3: Guidelines & Support */}
            <div className="lg:col-span-3 space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {t('Quy Tắc Vinh Danh', 'Golden Rules')}
              </h4>
              <ul className="space-y-3 text-xs text-slate-400 font-medium">
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-black">1.</span>
                  <span>{t('Báo công điểm 9, 10 trung thực', 'Report points 9 & 10 honestly')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 font-black">2.</span>
                  <span>{t('Nhắn tin hoặc gọi điện báo Ông Bà', 'Notify Grandparents via Zalo/Call')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-black">3.</span>
                  <span>{t('Nhận tiền thưởng mặt khi về thăm', 'Receive physical cash on gatherings')}</span>
                </li>
              </ul>
            </div>

          </div>

          {/* Sub-footer Section */}
          <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <p className="flex items-center gap-1.5 font-medium text-center md:text-left text-slate-400/90">
              <span>© {new Date().getFullYear()}</span>
              <span className="font-bold text-slate-300">{t('Sổ Vàng Gia Đình', 'Family Golden Ledger')}</span>
              <span>•</span>
              <span>{t('Phát triển với tình yêu thương', 'Crafted with absolute love')}</span>
              <Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500 animate-pulse inline ml-0.5" />
            </p>
            
            <div className="flex flex-wrap justify-center gap-2">
              <span className="text-[10px] bg-slate-950/80 px-3 py-1 rounded-xl text-slate-400/75 border border-[#1e293b]/60">
                React 18 & Vite
              </span>
              <span className="text-[10px] bg-slate-950/80 px-3 py-1 rounded-xl text-slate-400/75 border border-[#1e293b]/60">
                Node.js Full-stack
              </span>
              <span className="text-[10px] bg-slate-950/80 px-3 py-1 rounded-xl text-slate-400/75 border border-[#1e293b]/60">
                Express CJS
              </span>
              <span className="text-[10px] bg-slate-950/80 px-3 py-1 rounded-xl text-slate-400/75 border border-[#1e293b]/60">
                SSL Secure
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* LOGIN DIALOG MODAL */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200/60 shadow-2xl max-w-3xl w-full overflow-hidden my-8 flex flex-col md:flex-row max-h-[90vh] md:max-h-none">
            
            {/* Visual Brand Panel */}
            <div className="login-left-brand-panel p-8 md:p-10 md:w-5/12 flex flex-col justify-between relative overflow-hidden shrink-0">
              <div className="absolute inset-0 bg-radial-gradient from-indigo-950/40 to-slate-950/80 opacity-55 pointer-events-none" />
              <div className="relative z-10 space-y-5">
                <div className="bg-amber-400 text-slate-950 p-3 rounded-2xl w-fit border border-amber-300 shadow-lg animate-pulse">
                  <Trophy className="h-6 w-6 text-slate-950" />
                </div>
                <div>
                  <h3 className="text-xl md:text-2xl font-black tracking-tight leading-tight uppercase text-white">{t('SỔ VÀNG GIA ĐÌNH', 'FAMILY GOLDEN LEDGER')}</h3>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    {t('Nơi tôn vinh học tập, kết nối tình thân và tích lũy những nỗ lực quý giá.', 'A tribute to learning, strengthening family bonds, and rewarding precious efforts.')}
                  </p>
                </div>
              </div>
              
              <div className="relative z-10 pt-8 border-t border-slate-800/60 hidden md:block">
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">{t('Hỗ trợ bảo mật', 'Security Access')}</p>
                <p className="text-[11px] text-slate-300 mt-1.5 leading-relaxed">{t('Đăng nhập bằng đúng Họ Tên hoặc Biệt Danh thật để vào xem thông tin cá nhân của mình.', 'Sign in with your exact real Name or Nickname to view your personal rewards wallet.')}</p>
              </div>
            </div>

            {/* Form & Selection Panel */}
            <div className="p-6 md:p-8 md:w-7/12 flex-1 flex flex-col overflow-y-auto max-h-[60vh] md:max-h-[85vh] bg-white">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h4 className="text-xl font-black text-slate-900 tracking-tight">{t('Xác thực thành viên', 'Member Sign In')}</h4>
                  <p className="text-xs text-slate-500 font-medium">{t('Chọn tên hoặc tự nhập thông tin', 'Choose a profile or type manually')}</p>
                </div>
                <button 
                  type="button"
                  onClick={() => {
                    setShowLoginModal(false);
                    setLoginUsername('');
                    setLoginPassword('');
                    setLoginError('');
                  }}
                  className="text-slate-400 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {loginError && (
                <div className="bg-rose-50 text-rose-700 border border-rose-200 text-xs p-3.5 rounded-xl font-semibold mb-5 flex gap-2">
                  <span className="shrink-0 font-bold">⚠️ {t('Lỗi:', 'Error:')}</span>
                  <span>{loginError}</span>
                </div>
              )}

              {/* Quick Select Profile Grid */}
              <div className="space-y-3 mb-5">
                <label className="block text-xs font-bold text-slate-800">{t('Chọn nhanh thành viên:', 'Quick Select Profile:')}</label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1 border border-slate-150 p-2.5 rounded-2xl bg-slate-50/50 profile-select-grid">
                  {[
                    { name: 'Lê Phương Thảo', nickname: 'Thảo', username: 'thao' },
                    { name: 'Lê Minh Trí', nickname: 'Bin', username: 'bin' },
                    { name: 'Lê Quỳnh Anh', nickname: 'Bi', username: 'bi' },
                    { name: 'Lê Anh Thư', nickname: 'Bông', username: 'bong' },
                    { name: 'Lê Công Hoàng Phúc', nickname: 'Bo', username: 'bo' },
                    { name: 'Lê Công Nguyên', nickname: 'Tý', username: 'ty' },
                    { name: 'Lê Công Minh Khôi', nickname: 'Carot', username: 'carot' },
                    { name: 'Ông Bà (Quản trị)', nickname: 'Admin', username: 'admin' },
                  ].map((m) => {
                    const isSelected = loginUsername === m.name || loginUsername === m.username;
                    return (
                      <button
                        key={m.username}
                        type="button"
                        onClick={() => {
                          setLoginUsername(m.name);
                          setLoginPassword('123'); // Autofill default password for extreme ease of use
                        }}
                        className={`text-left p-2 rounded-xl border text-xs transition-all flex items-center gap-2 cursor-pointer active:scale-[0.97] ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 font-extrabold ring-2 ring-indigo-500/10 shadow-xs'
                            : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-extrabold text-[11px] shrink-0 uppercase shadow-xs ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {m.nickname[0]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] leading-tight font-bold">{m.name}</p>
                          <p className="text-[9px] text-slate-400 font-medium">{t('Biệt danh:', 'Nickname:')} {m.nickname}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Login Form Fields */}
              <form onSubmit={handleLogin} className="space-y-4 flex-1">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">{t('Tên tài khoản hoặc Họ và Tên', 'Account Name or Full Name')}</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      placeholder={t("Nhập họ tên thật của bạn hoặc chọn ở trên", "Enter your real name or select above")}
                      className="w-full text-xs border border-slate-300 rounded-xl p-3 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none bg-white text-slate-900 font-medium shadow-xs"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-bold text-slate-800">{t('Mật khẩu bảo vệ', 'Access Passcode')}</label>
                    <span className="text-[10px] text-indigo-600 font-bold">{t('Gợi ý: Mặc định là 123', 'Hint: Default is 123')}</span>
                  </div>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder={t("Mật khẩu của bạn (ví dụ: 123)", "Your passcode (e.g. 123)")}
                    className="w-full text-xs border border-slate-300 rounded-xl p-3 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none bg-white text-slate-900 font-medium shadow-xs"
                  />
                </div>

                <div className="bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100/60 dark:border-indigo-800/30 p-3.5 rounded-2xl">
                  <p className="text-[10px] text-indigo-700 dark:text-indigo-300 leading-relaxed font-semibold">
                    💡 {t(
                      'Mách nhỏ: Bạn có thể gõ trực tiếp tên thật có dấu như Lê Phương Thảo hoặc viết không dấu, viết biệt danh như Bông, Bo, Bi. Sau đó nhập mật khẩu là 123 để truy cập cực nhanh!',
                      'Pro Tip: You can type your exact Vietnamese name, standard English form, or nicknames like Bong, Bo, Bi. Type default passcode 123 for super fast login!'
                    )}
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl text-xs shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20 active:scale-[0.98] transition-all cursor-pointer uppercase tracking-wider"
                >
                  {t('Đăng nhập vào Hệ thống', 'Sign In to Ledger')}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM CONFIRM DIALOG */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 shrink-0">
                <Info className="h-5 w-5" />
              </div>
              <h4 className="text-base font-extrabold text-slate-900 tracking-tight">{confirmDialog.title}</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-semibold">
              {confirmDialog.message}
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                {confirmDialog.cancelText || t('Hủy bỏ', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PENDING REQUEST MODAL */}
      {editingRequest && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col my-8">
            <div className="flex items-center justify-between border-b border-slate-100 p-5 bg-indigo-50/50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-md">
                  <Edit className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900 tracking-tight">{t('Chỉnh Sửa Yêu Cầu chờ duyệt', 'Edit Pending Request')}</h4>
                  <p className="text-[10px] text-slate-500 font-medium">{t('Thay đổi thông tin thành tích đang chờ duyệt', 'Modify information for pending request')}</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  stopEditCamera();
                  setEditingRequest(null);
                }}
                className="text-slate-400 hover:text-slate-950 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdatePendingRequest} className="p-6 space-y-4 flex-1 overflow-y-auto max-h-[75vh]">
              {/* DATE */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('Ngày đạt thành tích', 'Date achieved')}</label>
                <input
                  type="date"
                  required
                  value={editReqDate}
                  onChange={(e) => setEditReqDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-150 text-xs font-semibold"
                />
              </div>

              {/* CATEGORY */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('Môn học / Hoạt động', 'Subject / Activity')}</label>
                <input
                  type="text"
                  required
                  value={editReqCategory}
                  onChange={(e) => setEditReqCategory(e.target.value)}
                  placeholder={t('Ví dụ: Toán, Anh, Văn, Tin học...', 'Example: Math, English, Literature, IT...')}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-150 text-xs font-semibold bg-white"
                  maxLength={50}
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {['Toán', 'Tiếng Anh', 'Tiếng Việt', 'Khoa học', 'Tin học', 'Công nghệ', 'GDCD', 'Thể chất', 'Mỹ thuật', 'Việc nhà'].map((subject) => (
                    <button
                      key={subject}
                      type="button"
                      onClick={() => setEditReqCategory(subject)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                        editReqCategory === subject 
                          ? 'bg-indigo-600 text-white' 
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {subject}
                    </button>
                  ))}
                </div>
              </div>

              {/* DESCRIPTION */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('Mô tả thành tích', 'Achievement description')}</label>
                <textarea
                  required
                  rows={3}
                  value={editReqDescription}
                  onChange={(e) => setEditReqDescription(e.target.value)}
                  placeholder={t('Ví dụ: Đạt điểm 10 kiểm tra Toán học kì, giúp mẹ lau dọn nhà sạch sẽ...', 'Example: Scored a 10 in Math, helped mom clean the house...')}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-150 text-xs font-semibold resize-none"
                />
              </div>

              {/* REWARD AMOUNT */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('Số tiền thưởng yêu cầu (VNĐ)', 'Requested reward (VND)')}</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="1000"
                  value={editReqReward}
                  onChange={(e) => setEditReqReward(Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-150 text-xs font-bold text-indigo-650"
                />
              </div>

              {/* CAMERA PHOTO / FILE UPLOAD */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {t('📸 Minh chứng thành tích / Ảnh chụp thực tế', '📸 Achievement Proof / Real-time Photo')}
                </label>
                
                <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3">
                  {/* Active Camera Stream View */}
                  {isEditCameraActive && (
                    <div className="space-y-2.5">
                      <div className="relative overflow-hidden rounded-xl border border-slate-300 bg-black aspect-video flex items-center justify-center">
                        <video 
                          id="edit-camera-stream" 
                          className="w-full h-full object-cover"
                          playsInline 
                          muted
                        />
                        <div className="absolute top-2 left-2 bg-rose-500 text-white text-[9px] px-2 py-0.5 rounded-md font-bold tracking-wider uppercase animate-pulse">
                          LIVE CAMERA
                        </div>
                      </div>
                      {editCameraError && (
                        <p className="text-[11px] text-rose-600 font-medium">{editCameraError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={captureEditPhoto}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Camera className="h-4 w-4" />
                          {t('Bấm Chụp Ảnh', 'Snap Photo')}
                        </button>
                        <button
                          type="button"
                          onClick={stopEditCamera}
                          className="px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          {t('Hủy', 'Cancel')}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Not active camera, and no photo selected yet */}
                  {!isEditCameraActive && !editReqProofImage && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={startEditCamera}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/50 p-4 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98"
                      >
                        <Camera className="h-6 w-6 text-indigo-600" />
                        <span>{t('Chụp ảnh camera', 'Take Live Photo')}</span>
                      </button>
                      
                      <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/50 p-4 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98 text-center">
                        <Upload className="h-6 w-6 text-slate-600" />
                        <span>{t('Tải ảnh từ máy', 'Upload From Device')}</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={handleEditProofImageUpload}
                          className="hidden" 
                        />
                      </label>
                    </div>
                  )}

                  {/* Display Selected Image Thumbnail */}
                  {editReqProofImage && (
                    <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-xs relative">
                      <div className="relative h-16 w-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shrink-0 group">
                        <img 
                          src={editReqProofImage} 
                          alt="Proof preview" 
                          className="h-full w-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setActiveProofModal(editReqProofImage)}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <span className="text-[9px] text-white font-bold uppercase">{t('Xem to', 'Zoom')}</span>
                        </div>
                      </div>
                      
                      <div className="flex-1 space-y-1">
                        <p className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                          <ImageIcon className="h-3.5 w-3.5 text-emerald-500" />
                          {t('Đã lưu minh chứng', 'Proof captured')}
                        </p>
                        <p className="text-[9px] text-slate-400 font-medium">{t('Nhấn vào ảnh để xem kích thước đầy đủ', 'Click image to view full scale')}</p>
                      </div>

                      <button
                        type="button"
                        onClick={clearEditProofImage}
                        className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                        title={t('Xóa ảnh này', 'Remove Image')}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    stopEditCamera();
                    setEditingRequest(null);
                  }}
                  className="px-5 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  {t('Hủy bỏ', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
                >
                  {t('Lưu Thay Đổi', 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in max-w-sm w-full">
          <div className={`p-4 rounded-2xl border shadow-xl flex items-start gap-3 ${
            toast.type === 'error' 
              ? 'bg-rose-600 text-white border-rose-500 shadow-rose-100' 
              : toast.type === 'info' 
                ? 'bg-slate-900 text-white border-slate-800' 
                : 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-100'
          }`}>
            <div className="p-1 rounded-lg bg-white/20 shrink-0">
              {toast.type === 'error' ? (
                <X className="h-4 w-4 text-white" />
              ) : (
                <Check className="h-4 w-4 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold leading-tight uppercase tracking-wider text-white/80">
                {toast.type === 'error' ? t('Lỗi hệ thống', 'System Error') : toast.type === 'info' ? t('Thông tin', 'Information') : t('Thành công', 'Success')}
              </p>
              <p className="text-xs font-semibold mt-1 text-white">{toast.message}</p>
            </div>
            <button 
              onClick={() => setToast(null)}
              className="text-white/60 hover:text-white p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* CUSTOM CONFIRM DIALOG */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 shrink-0">
                <Info className="h-5 w-5" />
              </div>
              <h4 className="text-base font-extrabold text-slate-900 tracking-tight">{confirmDialog.title}</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-semibold">
              {confirmDialog.message}
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                {confirmDialog.cancelText || t('Hủy bỏ', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PHOTO PROOF LIGHTBOX ZOOM MODAL */}
      {activeProofModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-[110] p-4 animate-fade-in">
          <div className="relative max-w-4xl w-full flex flex-col items-center">
            {/* Close button */}
            <button 
              onClick={() => setActiveProofModal(null)}
              className="absolute -top-12 right-0 bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-full backdrop-blur-xs transition-colors cursor-pointer"
              title={t('Đóng', 'Close')}
            >
              <X className="h-6 w-6" />
            </button>
            
            {/* Full-size image */}
            <div className="bg-white/5 p-2 rounded-2xl border border-white/10 shadow-2xl max-h-[80vh] overflow-hidden flex items-center justify-center">
              <img 
                src={activeProofModal} 
                alt="Full scale proof" 
                className="max-h-[75vh] max-w-full object-contain rounded-xl select-none"
              />
            </div>
            
            <p className="text-white/60 text-[11px] font-semibold mt-4 text-center tracking-wide">
              {t('💡 Nhấp ra ngoài hoặc bấm dấu X phía trên để đóng', '💡 Click outside or click X above to close')}
            </p>
          </div>
          {/* Backdrop click to close */}
          <div className="absolute inset-0 -z-10" onClick={() => setActiveProofModal(null)} />
        </div>
      )}

      {/* CHANGE PASSWORD MODAL */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-sm w-full overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
                  <Key className="h-5 w-5" />
                </div>
                <h4 className="text-base font-extrabold text-slate-900 tracking-tight">
                  {t('Thay Đổi Mật Khẩu', 'Change Passcode')}
                </h4>
              </div>
              <button 
                onClick={() => {
                  setShowChangePasswordModal(false);
                  setChangePasswordNew('');
                  setChangePasswordConfirm('');
                }}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-lg transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  {t('Mật khẩu mới', 'New Passcode')}
                </label>
                <input
                  type="password"
                  required
                  placeholder={t('Nhập mật khẩu mới tự chọn', 'Enter your preferred passcode')}
                  value={changePasswordNew}
                  onChange={(e) => setChangePasswordNew(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-xl p-3 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-50/80 focus:outline-none bg-white font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  {t('Xác nhận mật khẩu mới', 'Confirm New Passcode')}
                </label>
                <input
                  type="password"
                  required
                  placeholder={t('Nhập lại mật khẩu mới', 'Re-enter your passcode')}
                  value={changePasswordConfirm}
                  onChange={(e) => setChangePasswordConfirm(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-xl p-3 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-50/80 focus:outline-none bg-white font-medium"
                />
              </div>

              <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl">
                <p className="text-[10px] text-amber-900 leading-relaxed font-medium">
                  💡 {t(
                    'Lưu ý: Bạn có thể đặt bất kỳ mật khẩu nào bạn muốn (không bắt buộc phải là 123 nữa). Hãy nhớ kỹ để đăng nhập vào lần sau!',
                    'Note: You can choose any passcode you want (no longer restricted to 123). Please remember it for your next sign-in!'
                  )}
                </p>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowChangePasswordModal(false);
                    setChangePasswordNew('');
                    setChangePasswordConfirm('');
                  }}
                  className="px-4 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  {t('Hủy bỏ', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={changePasswordLoading}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
                >
                  {changePasswordLoading ? t('Đang lưu...', 'Saving...') : t('Lưu mật khẩu', 'Save Passcode')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD / EDIT REWARD RULE MODAL */}
      {(isAddingRule || editingRule) && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden p-6 space-y-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 shrink-0">
                  <Settings className="h-5 w-5" />
                </div>
                <h4 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {editingRule ? t('Cấu Hình Mức Thưởng', 'Configure Reward Level') : t('Thêm Mức Thưởng Mới', 'Add New Reward Level')}
                </h4>
              </div>
              <button 
                onClick={() => {
                  setIsAddingRule(false);
                  setEditingRule(null);
                }}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 p-1 rounded-lg transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="space-y-4">
              
              {/* Type Switcher */}
              {!editingRule && (
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('Loại quy đổi', 'Type')}</label>
                  <div className="flex gap-2 p-1.5 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setRuleSubCategory('Điểm số');
                        setRuleCategory('Cấp 1');
                        setRuleValue('');
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        ruleSubCategory === 'Điểm số' ? 'bg-white dark:bg-slate-700 shadow-xs text-indigo-600 dark:text-indigo-300 font-extrabold' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {t('Điểm số', 'Grade Score')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRuleSubCategory('Giải nhất');
                        setRuleCategory('Giải cấp trường');
                        setRuleValue('Giải nhất');
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        ruleSubCategory !== 'Điểm số' ? 'bg-white dark:bg-slate-700 shadow-xs text-indigo-600 dark:text-indigo-300 font-extrabold' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {t('Giải thưởng/Kỳ thi', 'Contest / Award')}
                    </button>
                  </div>
                </div>
              )}

              {/* Category (Cấp học / Cấp giải) */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {ruleSubCategory === 'Điểm số' ? t('Khối học áp dụng', 'Target Grade Level') : t('Phạm vi cuộc thi', 'Competition Scope')}
                </label>
                {ruleSubCategory === 'Điểm số' ? (
                  <select
                    value={ruleCategory}
                    onChange={(e) => setRuleCategory(e.target.value)}
                    className="w-full text-xs border border-slate-300 dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                  >
                    <option value="Cấp 1">{t('Cấp 1', 'Primary (Grade 1-5)')}</option>
                    <option value="Cấp 2">{t('Cấp 2', 'Secondary (Grade 6-9)')}</option>
                    <option value="Cấp 3">{t('Cấp 3', 'High School (Grade 10-12)')}</option>
                    <option value="Đại học">{t('Đại học', 'University / College')}</option>
                  </select>
                ) : (
                  <select
                    value={ruleCategory}
                    onChange={(e) => setRuleCategory(e.target.value)}
                    className="w-full text-xs border border-slate-300 dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                  >
                    <option value="Giải cấp trường">{t('Giải cấp trường', 'School Level')}</option>
                    <option value="Giải cấp phường">{t('Giải cấp phường', 'District/Ward Level')}</option>
                    <option value="Giải cấp thành phố">{t('Giải cấp thành phố', 'City/State Level')}</option>
                    <option value="Giải quốc tế">{t('Giải quốc tế', 'National / International')}</option>
                  </select>
                )}
              </div>

              {/* SubCategory if Contest (Hạng giải) */}
              {ruleSubCategory !== 'Điểm số' && (
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('Hạng giải thưởng', 'Award Rank')}</label>
                  <select
                    value={ruleSubCategory}
                    onChange={(e) => {
                      setRuleSubCategory(e.target.value);
                      if (!editingRule) {
                        setRuleValue(e.target.value);
                      }
                    }}
                    className="w-full text-xs border border-slate-300 dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                  >
                    <option value="Giải nhất">{t('Giải nhất', 'First Place')}</option>
                    <option value="Giải nhì">{t('Giải nhì', 'Second Place')}</option>
                    <option value="Giải ba">{t('Giải ba', 'Third Place')}</option>
                    <option value="Giải khuyến khích">{t('Giải khuyến khích', 'Consolation Prize')}</option>
                  </select>
                </div>
              )}

              {/* Exact Value Display/Input */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {ruleSubCategory === 'Điểm số' ? t('Giá trị Điểm Số (VD: Điểm 9.5)', 'Score Value (e.g. Điểm 9.5)') : t('Tên nhãn hiển thị giải (VD: Giải nhất (TIMO...))', 'Display Label (e.g. Giải nhất...)')}
                </label>
                <input
                  type="text"
                  required
                  value={ruleValue}
                  onChange={(e) => setRuleValue(e.target.value)}
                  placeholder={ruleSubCategory === 'Điểm số' ? "Ví dụ: 'Điểm 9.5', 'Điểm 10', 'Xuất sắc'" : "Ví dụ: 'Giải nhất', 'Giải nhất (TIMO/ITMC...)'"}
                  className="w-full text-xs border border-slate-300 dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                />
              </div>

              {/* Reward Amount */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('Số tiền thưởng quy đổi (đ)', 'Reward Amount (VND)')}</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="1000"
                  value={ruleRewardAmount}
                  onChange={(e) => setRuleRewardAmount(Number(e.target.value))}
                  placeholder="Ví dụ: 20000"
                  className="w-full text-xs border border-slate-300 dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingRule(false);
                    setEditingRule(null);
                  }}
                  className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  {t('Hủy bỏ', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
                >
                  {t('Lưu lại', 'Save Rule')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
