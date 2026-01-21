

import { Question, User, PracticeSession, QuestionCategory } from "../types";

// --- CONFIGURATION ---
export const ENABLE_CLOUD_STORAGE = (import.meta as any).env?.PROD || false; 

const KEYS = {
  CURRENT_USER: 'xingce_current_user',
  USERS: 'xingce_users_db',
  QUESTIONS: 'xingce_questions',
  SESSIONS: 'xingce_sessions'
};

// --- INDEXED DB HELPER ---
const DB_NAME = 'XingCeDB';
const DB_VERSION = 3; 

const idb = {
    db: null as IDBDatabase | null,
    async init() {
        if (this.db) return this.db;
        return new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onupgradeneeded = (e) => {
                const db = (e.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains('questions')) db.createObjectStore('questions', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('users')) db.createObjectStore('users', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'key' });
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            request.onerror = (e) => {
                console.error("IDB Error", e);
                reject(e);
            };
        });
    },
    async getAll<T>(storeName: string, userId?: string): Promise<T[]> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => {
                const res = request.result as T[];
                if (userId) {
                    resolve(res.filter((item: any) => item.userId === userId || item.user_id === userId));
                } else {
                    resolve(res);
                }
            };
            request.onerror = () => reject(request.error);
        });
    },
    async get<T>(storeName: string, key: string): Promise<T | undefined> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    async put(storeName: string, value: any) {
        const db = await this.init();
        return new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(value);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    async delete(storeName: string, key: string) {
        const db = await this.init();
        return new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    async deleteMultipleImages(keys: string[]) {
        if (keys.length === 0) return;
        const db = await this.init();
        return new Promise<void>((resolve, reject) => {
            const transaction = db.transaction('images', 'readwrite');
            const store = transaction.objectStore('images');
            let completed = 0;
            keys.forEach(key => {
                store.delete(key).onsuccess = () => {
                    completed++;
                    if(completed === keys.length) resolve();
                };
                store.delete(key).onerror = () => {
                    completed++;
                    if(completed === keys.length) resolve();
                }
            });
        });
    },
    async getKeysStartingWith(prefix: string): Promise<string[]> {
        const db = await this.init();
        return new Promise((resolve) => {
            const keys: string[] = [];
            const transaction = db.transaction('images', 'readonly');
            const store = transaction.objectStore('images');
            const request = store.openCursor(); 
            request.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
                if (cursor) {
                    const key = cursor.key as string;
                    if (key.startsWith(prefix)) {
                        keys.push(key);
                    }
                    cursor.continue();
                } else {
                    resolve(keys);
                }
            };
            request.onerror = () => resolve([]);
        });
    }
};

// --- RICH TEXT HELPERS (Refactored for generic usage) ---
const processHtmlForSave = async (html: string, questionId: string, prefix: string): Promise<string> => {
    if (!html) return '';
    
    // Regex to find base64 images: <img ... src="data:image/..." ...>
    const imgRegex = /<img([^>]+)src=["'](data:image\/[^;]+;base64,[^"']+)["']([^>]*)>/g;
    
    let processedHtml = html;
    const matches = Array.from(html.matchAll(imgRegex));
    
    for (let i = 0; i < matches.length; i++) {
        const fullTag = matches[i][0];
        const beforeSrc = matches[i][1];
        const srcData = matches[i][2];
        const afterSrc = matches[i][3];
        
        // Unique key: {id}_{prefix}_{timestamp}_{index}
        // prefix can be 'rte' or 'analysis'
        const key = `${questionId}_${prefix}_${Date.now()}_${i}`;
        
        // Save to IDB
        await idb.put('images', { key, data: srcData });
        
        // Replace in HTML with a special marker protocol
        const newSrc = `__${prefix.toUpperCase()}_REF__${key}`;
        const newTag = `<img${beforeSrc}src="${newSrc}"${afterSrc}>`;
        processedHtml = processedHtml.replace(fullTag, newTag);
    }
    
    return processedHtml;
};

const restoreHtmlImages = async (html: string, prefix: string): Promise<string> => {
    const marker = `__${prefix.toUpperCase()}_REF__`;
    if (!html || !html.includes(marker)) return html;
    
    // Regex: __PREFIX_REF__key
    const refRegex = new RegExp(`${marker}([a-zA-Z0-9_]+)`, 'g');
    const matches = Array.from(html.matchAll(refRegex));
    
    const uniqueKeys = [...new Set(matches.map(m => m[1]))];
    
    const imageMap: Record<string, string> = {};
    
    await Promise.all(uniqueKeys.map(async (key) => {
        try {
            const record = await idb.get<{key:string, data:string}>('images', key);
            if (record && record.data) {
                imageMap[key] = record.data;
            }
        } catch (e) { console.warn('Failed to fetch image', key); }
    }));
    
    let restoredHtml = html;
    matches.forEach(m => {
        const fullRef = m[0]; 
        const key = m[1];
        if (imageMap[key]) {
            restoredHtml = restoredHtml.replace(fullRef, imageMap[key]);
        }
    });
    
    return restoredHtml;
};

interface StorageAdapter {
  register(u, p, n): Promise<{ success: boolean, message: string, user?: User }>;
  login(u, p): Promise<{ success: boolean, message: string, user?: User }>;
  updateUser(user: User): Promise<void>;
  getQuestions(userId: string): Promise<Question[]>;
  saveQuestion(userId: string, q: Question): Promise<void>;
  deleteQuestion(userId: string, qId: string, hard?: boolean): Promise<void>;
  getSessions(userId: string): Promise<PracticeSession[]>;
  saveSession(userId: string, s: PracticeSession, skipStatsUpdate?: boolean): Promise<void>;
  deleteSession(userId: string, sId: string): Promise<void>;
  hydrateQuestionImages(userId: string, question: Question): Promise<Question>;
}

// --- MIGRATION UTILS ---
let migrationChecked = false;

const migrateFromLocalStorage = async (userId: string) => {
    if (migrationChecked) return;
    
    const lsKeyQ = KEYS.QUESTIONS + '_' + userId;
    const localQStr = localStorage.getItem(lsKeyQ);
    if (localQStr) {
        try {
            console.log("Migrating questions from LocalStorage to IndexedDB...");
            const questions: Question[] = JSON.parse(localQStr);
            for (const q of questions) {
                await LocalAdapter.saveQuestion(userId, q);
            }
            localStorage.removeItem(lsKeyQ); 
        } catch (e) { console.error("Migration failed for questions", e); }
    }

    const lsKeyS = KEYS.SESSIONS + '_' + userId;
    const localSStr = localStorage.getItem(lsKeyS);
    if (localSStr) {
        try {
             console.log("Migrating sessions from LocalStorage to IndexedDB...");
             const sessions: PracticeSession[] = JSON.parse(localSStr);
             for (const s of sessions) {
                 await idb.put('sessions', { ...s, userId });
             }
             localStorage.removeItem(lsKeyS);
        } catch (e) { console.error("Migration failed for sessions", e); }
    }
    
    const localUsers = localStorage.getItem(KEYS.USERS);
    if (localUsers) {
        const users = JSON.parse(localUsers);
        for (const u of users) await idb.put('users', u);
    }
    
    migrationChecked = true;
};

const LocalAdapter: StorageAdapter = {
  async register(username, password, nickname) {
    const data = localStorage.getItem(KEYS.USERS);
    const users: User[] = data ? JSON.parse(data) : [];
    if (users.find(u => u.username === username)) return { success: false, message: '用户名已存在' };
    const newUser: User = {
      id: Date.now().toString(),
      username, password, nickname,
      avatar: `https://api.dicebear.com/9.x/avataaars/svg?seed=${username}`
    };
    users.push(newUser);
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
    await idb.put('users', newUser);
    return { success: true, message: '注册成功', user: newUser };
  },
  async login(username, password) {
    const data = localStorage.getItem(KEYS.USERS);
    const users: User[] = data ? JSON.parse(data) : [];
    const user = users.find(u => u.username === username && u.password === password);
    if (user) return { success: true, message: '登录成功', user };
    return { success: false, message: '用户名或密码错误' };
  },
  async updateUser(user) {
    const data = localStorage.getItem(KEYS.USERS);
    const users: User[] = data ? JSON.parse(data) : [];
    const index = users.findIndex(u => u.id === user.id);
    if (index >= 0) {
      users[index] = user;
      localStorage.setItem(KEYS.USERS, JSON.stringify(users));
    }
    await idb.put('users', user);
  },
  async getQuestions(userId) {
    await migrateFromLocalStorage(userId);
    const questions = await idb.getAll<Question & { userId: string }>('questions', userId);
    return questions.sort((a, b) => b.createdAt - a.createdAt);
  },
  async saveQuestion(userId, q) {
      // 1. Process Rich Text Notes
      const processedNoteText = await processHtmlForSave(q.noteText || '', q.id, 'rte');

      // 2. Process Analysis Text (New)
      const processedAnalysis = await processHtmlForSave(q.analysis || '', q.id, 'analysis');

      // 3. Prepare Light Object
      const lightQ = { ...q, userId, noteText: processedNoteText, analysis: processedAnalysis };
      
      // 4. Handle Materials
      const materialsRef: string[] = [];
      if (q.materials) {
          for (let i = 0; i < q.materials.length; i++) {
              const m = q.materials[i];
              if (m && m.length > 500) { 
                  const key = `${q.id}_mat_${i}`;
                  await idb.put('images', { key, data: m });
                  materialsRef.push('__IMAGE_REF__');
              } else {
                  materialsRef.push(m);
              }
          }
      }
      lightQ.materials = materialsRef;

      // 5. Handle Notes Image
      if (q.notesImage && q.notesImage.length > 500) {
          const key = `${q.id}_note`;
          await idb.put('images', { key, data: q.notesImage });
          lightQ.notesImage = '__IMAGE_REF__';
      }

      await idb.put('questions', lightQ);
  },
  async deleteQuestion(userId, qId, hard = false) {
      if (hard) {
          await idb.delete('questions', qId);
          
          const keysToDelete = [`${qId}_note`];
          for(let i=0; i<20; i++) keysToDelete.push(`${qId}_mat_${i}`);
          
          const rteKeys = await idb.getKeysStartingWith(`${qId}_rte_`);
          const analysisKeys = await idb.getKeysStartingWith(`${qId}_analysis_`);
          
          await idb.deleteMultipleImages([...keysToDelete, ...rteKeys, ...analysisKeys]);
      } else {
          const q = await idb.get<Question>('questions', qId);
          if (q) {
              q.deletedAt = Date.now();
              await idb.put('questions', q);
          }
      }
  },
  async getSessions(userId) {
    const sessions = await idb.getAll<PracticeSession & { userId: string }>('sessions', userId);
    return sessions.sort((a, b) => b.date - a.date);
  },
  async saveSession(userId, session, skipStatsUpdate = false) {
    await idb.put('sessions', { ...session, userId });
    
    if (!skipStatsUpdate) {
        const questionIds = session.details.map(d => d.questionId);
        const questions = await Promise.all(questionIds.map(id => idb.get<Question>('questions', id)));

        const updates: Promise<void>[] = [];
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            const detail = session.details[i];
            if (q) {
                if (detail.isCorrect) q.correctCount = (q.correctCount || 0) + 1;
                else q.mistakeCount = (q.mistakeCount || 0) + 1;
                q.lastPracticedAt = Date.now();
                updates.push(idb.put('questions', q));
            }
        }
        await Promise.all(updates);
    }
  },
  async deleteSession(userId, sId) {
    await idb.delete('sessions', sId);
  },
  async hydrateQuestionImages(userId, question) {
      const q = { ...question };
      
      // Hydrate Materials
      if (q.materials && q.materials.some(m => m === '__IDB_REF__' || m === '__IMAGE_REF__')) {
          const newMats = [];
          for (let i = 0; i < q.materials.length; i++) {
              if (q.materials[i] === '__IDB_REF__' || q.materials[i] === '__IMAGE_REF__') {
                  const key = `${q.id}_mat_${i}`;
                  const imgEntry = await idb.get<{key:string, data:string}>('images', key);
                  newMats.push(imgEntry ? imgEntry.data : '');
              } else {
                  newMats.push(q.materials[i]);
              }
          }
          q.materials = newMats;
      }

      // Hydrate Standard Note Image
      if (q.notesImage === '__IDB_REF__' || q.notesImage === '__IMAGE_REF__') {
          const key = `${q.id}_note`;
          const imgEntry = await idb.get<{key:string, data:string}>('images', key);
          q.notesImage = imgEntry ? imgEntry.data : '';
      }

      // Hydrate Rich Text Notes
      if (q.noteText && q.noteText.includes('__RTE_REF__')) {
          q.noteText = await restoreHtmlImages(q.noteText, 'rte');
      }

      // Hydrate Analysis Text (New)
      if (q.analysis && q.analysis.includes('__ANALYSIS_REF__')) {
          q.analysis = await restoreHtmlImages(q.analysis, 'analysis');
      }
      
      return q;
  }
};

const CloudAdapter: StorageAdapter = {
  async register(username, password, nickname) {
    const newUser: User = { id: Date.now().toString(), username, password, nickname, avatar: `https://api.dicebear.com/9.x/avataaars/svg?seed=${username}` };
    const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newUser) });
    return await res.json();
  },
  async login(username, password) {
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    return await res.json();
  },
  async updateUser(user) {
    await fetch('/api/user', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id }, body: JSON.stringify(user) });
  },
  async getQuestions(userId) {
    const res = await fetch('/api/questions', { headers: { 'X-User-Id': userId } });
    return res.ok ? await res.json() : [];
  },
  async saveQuestion(userId, question) {
    await fetch('/api/questions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Id': userId }, body: JSON.stringify(question) });
  },
  async deleteQuestion(userId, qId, hard = false) {
    await fetch(`/api/questions/${qId}?hard=${hard}`, { method: 'DELETE', headers: { 'X-User-Id': userId } });
  },
  async getSessions(userId) {
    const res = await fetch('/api/sessions', { headers: { 'X-User-Id': userId } });
    return res.ok ? await res.json() : [];
  },
  async saveSession(userId, session, skipStatsUpdate = false) {
    await fetch('/api/sessions', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'X-User-Id': userId }, 
        body: JSON.stringify(session) 
    });
  },
  async deleteSession(userId, sId) {
    await fetch(`/api/sessions/${sId}`, { method: 'DELETE', headers: { 'X-User-Id': userId } });
  },
  async hydrateQuestionImages(userId, question) {
      const hasPlaceholder = question.materials.some(m => m === '__IMAGE_REF__') || question.notesImage === '__IMAGE_REF__';
      if (!hasPlaceholder) return question;
      try {
          const res = await fetch(`/api/questions/${question.id}/images`, { headers: { 'X-User-Id': userId } });
          if (res.ok) {
              const images = await res.json();
              const newMaterials = question.materials.map((m, i) => m === '__IMAGE_REF__' ? images.materials[i] || '' : m);
              return { ...question, materials: newMaterials, notesImage: question.notesImage === '__IMAGE_REF__' ? images.notesImage : question.notesImage };
          }
      } catch (e) { console.error(e); }
      return question;
  }
};

const getAdapter = () => ENABLE_CLOUD_STORAGE ? CloudAdapter : LocalAdapter;

export const getUser = (): User | null => {
  const data = localStorage.getItem(KEYS.CURRENT_USER);
  return data ? JSON.parse(data) : null;
};

export const logoutUser = () => localStorage.removeItem(KEYS.CURRENT_USER);

export const loginUser = async (u: string, p: string) => {
    const result = await getAdapter().login(u, p);
    if (result.success && result.user) localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(result.user));
    return result;
};

export const registerUser = async (u: string, p: string, n: string) => {
    const result = await getAdapter().register(u, p, n);
    if (result.success && result.user) localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(result.user));
    return result;
};

export const saveUser = async (updatedUser: User) => {
    localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(updatedUser));
    await getAdapter().updateUser(updatedUser);
};

export const getQuestions = async (): Promise<Question[]> => {
    const user = getUser();
    return user ? await getAdapter().getQuestions(user.id) : [];
};

export const saveQuestion = async (question: Question) => {
    const user = getUser();
    if (user) await getAdapter().saveQuestion(user.id, question);
};

export const deleteQuestion = async (id: string, hard: boolean = false) => {
    const user = getUser();
    if (user) await getAdapter().deleteQuestion(user.id, id, hard);
};

export const restoreQuestion = async (id: string) => {
    const user = getUser();
    if (!user) return;
    
    if (!ENABLE_CLOUD_STORAGE) {
        const q = await idb.get<Question>('questions', id);
        if (q) {
            delete q.deletedAt;
            await idb.put('questions', q);
        }
    } else {
        const questions = await getQuestions();
        const q = questions.find(item => item.id === id);
        if (q) {
             const restored = { ...q };
             delete restored.deletedAt;
             await saveQuestion(restored);
        }
    }
};

export const getSessions = async (): Promise<PracticeSession[]> => {
    const user = getUser();
    return user ? await getAdapter().getSessions(user.id) : [];
};

export const saveSession = async (session: PracticeSession) => {
    const user = getUser();
    if (user) await getAdapter().saveSession(user.id, session);
};

export const deleteSession = async (id: string) => {
    const user = getUser();
    if (user) await getAdapter().deleteSession(user.id, id);
};

export const hydrateQuestion = async (question: Question): Promise<Question> => {
    const user = getUser();
    return user ? await getAdapter().hydrateQuestionImages(user.id, question) : question;
};

export const restoreBackup = async (data: any) => {
    const user = getUser();
    if (!user || !data.questions) throw new Error("无效备份文件");
    const adapter = getAdapter();
    for (const q of data.questions) {
        await adapter.saveQuestion(user.id, q);
    }
    if (data.sessions) {
        for (const s of data.sessions) {
            await adapter.saveSession(user.id, s, true);
        }
    }
};

export const getStats = async () => {
    const allQuestions = await getQuestions(); 
    const sessions = await getSessions();

    const OFFSET = 8 * 60 * 60 * 1000;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const getDayId = (ts: number) => Math.floor((ts + OFFSET) / DAY_MS);

    const now = Date.now();
    const todayDayId = getDayId(now);

    let total = 0;
    let masteredCount = 0;
    let todayMistakes = 0;
    let yesterdayMistakes = 0;
    let weekMistakes = 0;
    let monthMistakes = 0;
    
    const byCategory: any = {};
    Object.values(QuestionCategory).forEach(cat => byCategory[cat] = 0);

    for (const q of allQuestions) {
        if (q.deletedAt) continue;
        
        total++;
        if (q.isMastered) masteredCount++;
        
        if (byCategory[q.category] !== undefined) {
            byCategory[q.category]++;
        }

        const qDayId = getDayId(q.createdAt);
        const diff = todayDayId - qDayId;

        if (diff === 0) todayMistakes++;
        else if (diff === 1) yesterdayMistakes++;
        
        if (diff >= 0 && diff <= 6) weekMistakes++;
        if (diff >= 0 && diff <= 29) monthMistakes++;
    }

    let todayPracticeCount = 0;
    for (const s of sessions) {
        const sDayId = getDayId(s.date);
        if (sDayId === todayDayId) {
            todayPracticeCount += s.questionIds.length;
        }
    }
    
    return { total, masteredCount, todayMistakes, yesterdayMistakes, weekMistakes, monthMistakes, todayPracticeCount, byCategory };
};
