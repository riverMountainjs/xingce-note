
export enum QuestionCategory {
  COMMON_SENSE = '常识判断',
  LOGIC = '判断推理',
  LANGUAGE = '言语理解',
  QUANTITY = '数量关系',
  DATA_ANALYSIS = '资料分析'
}

export interface User {
  id: string;
  username: string;
  password?: string;
  nickname: string;
  avatar: string;
  externalToken?: string; // Added for external plugin authentication
}

export interface Question {
  id: string;
  createdAt: number;
  deletedAt?: number; // Added: Timestamp for soft delete
  materials: string[];
  materialText?: string;
  stem: string;
  options: string[];
  correctAnswer: number;
  userAnswer?: number;
  accuracy: number; // 0-100
  category: QuestionCategory;
  subCategory?: string; 
  tags?: string[];      
  notesImage?: string; 
  noteText?: string;   
  lastPracticedAt?: number;
  mistakeCount: number;
  correctCount?: number; 
  isMastered?: boolean;  
}

export interface SessionDetail {
    questionId: string;
    userAnswer: number; 
    isCorrect: boolean;
    duration: number; 
}

export interface PracticeSession {
  id: string;
  date: number;
  questionIds: string[];
  score: number;
  totalDuration: number;
  details: SessionDetail[];
}
