export type Role = 'user' | 'admin';

export interface User {
  id: string;
  username: string;
  name: string;
  nickname: string;
  role: Role;
  gradeLevel: 'Cấp 1' | 'Cấp 2' | 'Cấp 3' | 'Đại học' | 'N/A';
}

export interface Achievement {
  id: string;
  userId: string;
  date: string;
  description: string;
  category: 'Toán' | 'Văn' | 'Anh' | 'KHTN' | 'Môn khác' | 'Thể thao/Nghệ thuật' | 'Giải thưởng dã ngoại/Khác';
  reward: number;
  approvedBy: string; // 'admin' or system pre-seeded
  createdAt: string;
  proofImage?: string;
}

export interface Payout {
  id: string;
  userId: string;
  date: string;
  description: string;
  amount: number;
  createdAt: string;
}

export type RequestType = 'add' | 'update' | 'delete';
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface AchievementRequest {
  id: string;
  userId: string;
  type: RequestType;
  achievementId?: string; // For update/delete requests
  data: {
    date: string;
    description: string;
    category: string;
    reward: number;
    proofImage?: string;
  };
  status: RequestStatus;
  adminNote?: string;
  createdAt: string;
  proofImage?: string;
}

export interface RewardRule {
  id: string;
  category: string;
  subCategory: string;
  value: string;
  rewardAmount: number;
}
