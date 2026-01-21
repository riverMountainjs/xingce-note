
/**
 * Cloudflare Pages Functions - API Backend
 * Assumes a D1 binding named 'DB' in wrangler.toml
 */
import { analyzeExternalQuestion, chatWithQuestion } from "../../services/geminiService";

// --- Fix Types: Use 'any' to avoid compilation errors in generic environments ---
interface Env {
  DB: any; // Was D1Database
  API_KEY: string;
}

export const onRequest: any = async (context: any) => {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '').split('/');
  const route = path[0]; 
  
  const json = (data: any, status = 200) => 
    new Response(JSON.stringify(data), {
      status,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Allow Plugin CORS
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-External-Token'
      }
    });

  if (request.method === 'OPTIONS') return json({ ok: true });

  const err = (msg: string, status = 400) => json({ success: false, message: msg }, status);

  try {
    // --- 1. External Plugin Logic (New) ---
    // Check for External Token
    const externalToken = request.headers.get('X-External-Token');
    let authenticatedUser: any = null;
    
    if (externalToken) {
        // Authenticate via token
        authenticatedUser = await env.DB.prepare(
            'SELECT * FROM users WHERE external_token = ?'
        ).bind(externalToken).first();
    }

    if (route === 'external') {
        if (!authenticatedUser) return err('Invalid Token / Unauthorized', 401);
        const action = path[1];

        // Action 1: Analyze (Proxy to AI Service)
        if (action === 'analyze' && request.method === 'POST') {
            const payload = await request.json();
            // FIX: Pass API Key directly instead of hacking process.env which doesn't exist in Workers
            const result = await analyzeExternalQuestion(payload as any, env.API_KEY);
            return json({ success: true, ...result });
        }

        // Action 2: Chat (New)
        if (action === 'chat' && request.method === 'POST') {
            const payload = await request.json();
            const result = await chatWithQuestion(payload as any, env.API_KEY);
            return json({ success: true, ...result });
        }

        // Action 3: Save (Direct Save to DB)
        if (action === 'save' && request.method === 'POST') {
            const q = await request.json();
            
            // --- IMAGE EXTRACTION LOGIC (Consistent with Standard POST) ---
            // Strip large base64 images from JSON to keep D1 'questions' table small and efficient.
            // Save images to 'question_images' table instead.
            
            const imagesToSave: { key: string, data: string }[] = [];
            const originalMaterials = q.materials || [];
            
            // Process Materials Array
            const lightMaterials = originalMaterials.map((m: string, idx: number) => {
                // Threshold: 1000 chars (basically any base64 image)
                if (m && m.length > 1000) { 
                    imagesToSave.push({ key: `material_${idx}`, data: m });
                    return '__IMAGE_REF__'; 
                }
                return m;
            });

            // Process Notes Image
            let lightNotesImage = q.notesImage;
            if (q.notesImage && q.notesImage.length > 1000) {
                imagesToSave.push({ key: 'notesImage', data: q.notesImage });
                lightNotesImage = '__IMAGE_REF__';
            }
            
            // Construct "Light" Question Object (Metadata only)
            // Ensure userId is forced to the authenticated user from token
            const lightQ = { 
                ...q, 
                materials: lightMaterials, 
                notesImage: lightNotesImage, 
                userId: authenticatedUser.id 
            };
            
            // 1. Clean old images (if updating existing question)
            await env.DB.prepare('DELETE FROM question_images WHERE question_id = ?').bind(q.id).run();
            
            // 2. Insert new images
            if (imagesToSave.length > 0) {
                const stmt = env.DB.prepare('INSERT INTO question_images (question_id, field_key, image_data, created_at) VALUES (?, ?, ?, ?)');
                // D1 Batch insert
                await env.DB.batch(imagesToSave.map(img => stmt.bind(q.id, img.key, img.data, Date.now())));
            }

            // 3. Upsert Question Metadata
            const exists = await env.DB.prepare('SELECT id FROM questions WHERE id = ?').bind(q.id).first();
            
            if (exists) {
                await env.DB.prepare(
                    'UPDATE questions SET category = ?, accuracy = ?, json_data = ? WHERE id = ?'
                ).bind(q.category, q.accuracy, JSON.stringify(lightQ), q.id).run();
            } else {
                await env.DB.prepare(
                    'INSERT INTO questions (id, user_id, category, accuracy, created_at, json_data) VALUES (?, ?, ?, ?, ?, ?)'
                ).bind(q.id, authenticatedUser.id, q.category, q.accuracy, q.createdAt, JSON.stringify(lightQ)).run();
            }
            return json({ success: true, id: q.id });
        }
        return err('External action not found', 404);
    }

    // --- 2. Standard Auth Routes ---
    if (route === 'auth') {
      const action = path[1];
      if (request.method === 'POST') {
        const body: any = await request.json();
        if (action === 'register') {
          try {
            // Create a random external token on register
            const token = crypto.randomUUID();
            await env.DB.prepare(
              'INSERT INTO users (id, username, password, nickname, avatar, external_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).bind(body.id, body.username, body.password, body.nickname, body.avatar, token, Date.now()).run();
            return json({ success: true, user: { ...body, externalToken: token } });
          } catch (e: any) {
            // Differentiate between Unique Constraint (username taken) and other errors (e.g. missing column)
            const msg = e.message || '';
            if (msg.includes('UNIQUE constraint') || msg.includes('Constraint failed')) {
                 return err('用户名已存在');
            }
            // Return actual DB error to help debugging (e.g. "no such column: external_token")
            return err('注册失败: ' + msg);
          }
        }
        if (action === 'login') {
            const user = await env.DB.prepare(
                'SELECT * FROM users WHERE username = ? AND password = ?'
            ).bind(body.username, body.password).first();
            if (user) return json({ success: true, user });
            return err('用户名或密码错误', 401);
        }
      }
    }

    const userId = request.headers.get('X-User-Id');
    if (!userId && route !== 'auth') return err('Unauthorized', 401);

    if (route === 'user' && request.method === 'PUT') {
        const body: any = await request.json();
        // Allow updating/generating token
        const token = body.externalToken || authenticatedUser?.external_token || crypto.randomUUID();
        await env.DB.prepare(
            'UPDATE users SET nickname = ?, password = ?, avatar = ?, external_token = ? WHERE id = ?'
        ).bind(body.nickname, body.password, body.avatar, token, userId).run();
        return json({ success: true, externalToken: token });
    }

    // ... (Existing Routes for questions, sessions remain identical but using 'any' for DB types) ...
    if (route === 'questions') {
        if (request.method === 'GET') {
            const qId = path[1];
            if (qId && path[2] === 'images') {
                const { results } = await env.DB.prepare(
                    'SELECT field_key, image_data FROM question_images WHERE question_id = ?'
                ).bind(qId).all();
                const images: any = { materials: [], notesImage: '' };
                const materialsMap: Record<number, string> = {};
                results.forEach((r: any) => {
                    if (r.field_key === 'notesImage') images.notesImage = r.image_data;
                    else if (r.field_key.startsWith('material_')) {
                        const idx = parseInt(r.field_key.split('_')[1]);
                        materialsMap[idx] = r.image_data;
                    }
                });
                const maxIdx = Math.max(-1, ...Object.keys(materialsMap).map(Number));
                for(let i=0; i<=maxIdx; i++) if(materialsMap[i]) images.materials[i] = materialsMap[i];
                return json(images);
            }
            const { results } = await env.DB.prepare(
                'SELECT json_data FROM questions WHERE user_id = ? ORDER BY created_at DESC'
            ).bind(userId).all();
            const questions = results.map((r: any) => JSON.parse(r.json_data));
            return json(questions);
        }

        if (request.method === 'POST') {
            const q: any = await request.json();
            const imagesToSave: { key: string, data: string }[] = [];
            const originalMaterials = q.materials || [];
            const lightMaterials = originalMaterials.map((m: string, idx: number) => {
                if (m && m.length > 1000) { 
                    imagesToSave.push({ key: `material_${idx}`, data: m });
                    return '__IMAGE_REF__'; 
                }
                return m;
            });
            let lightNotesImage = q.notesImage;
            if (q.notesImage && q.notesImage.length > 1000) {
                imagesToSave.push({ key: 'notesImage', data: q.notesImage });
                lightNotesImage = '__IMAGE_REF__';
            }
            const lightQ = { ...q, materials: lightMaterials, notesImage: lightNotesImage, userId }; // Ensure userId is set

            await env.DB.prepare('DELETE FROM question_images WHERE question_id = ?').bind(q.id).run();
            if (imagesToSave.length > 0) {
                const stmt = env.DB.prepare('INSERT INTO question_images (question_id, field_key, image_data, created_at) VALUES (?, ?, ?, ?)');
                await env.DB.batch(imagesToSave.map(img => stmt.bind(q.id, img.key, img.data, Date.now())));
            }
            const exists = await env.DB.prepare('SELECT id FROM questions WHERE id = ?').bind(q.id).first();
            if (exists) {
                await env.DB.prepare(
                    'UPDATE questions SET category = ?, accuracy = ?, json_data = ? WHERE id = ?'
                ).bind(q.category, q.accuracy, JSON.stringify(lightQ), q.id).run();
            } else {
                await env.DB.prepare(
                    'INSERT INTO questions (id, user_id, category, accuracy, created_at, json_data) VALUES (?, ?, ?, ?, ?, ?)'
                ).bind(q.id, userId, q.category, q.accuracy, q.createdAt, JSON.stringify(lightQ)).run();
            }
            return json({ success: true });
        }

        if (request.method === 'DELETE') {
            const qId = path[1];
            const isHard = url.searchParams.get('hard') === 'true';
            if(qId) {
                if (isHard) {
                    await env.DB.batch([
                        env.DB.prepare('DELETE FROM questions WHERE id = ? AND user_id = ?').bind(qId, userId),
                        env.DB.prepare('DELETE FROM question_images WHERE question_id = ?').bind(qId)
                    ]);
                } else {
                    const row: any = await env.DB.prepare('SELECT json_data FROM questions WHERE id = ?').bind(qId).first();
                    if (row) {
                        const q = JSON.parse(row.json_data as string);
                        q.deletedAt = Date.now();
                        await env.DB.prepare('UPDATE questions SET json_data = ? WHERE id = ?').bind(JSON.stringify(q), qId).run();
                    }
                }
                return json({ success: true });
            }
        }
    }

    if (route === 'sessions') {
        if (request.method === 'GET') {
            const { results } = await env.DB.prepare(
                'SELECT json_data FROM sessions WHERE user_id = ? ORDER BY created_at DESC'
            ).bind(userId).all();
            const sessions = results.map((r: any) => JSON.parse(r.json_data));
            return json(sessions);
        }
        if (request.method === 'POST') {
            const s: any = await request.json();
            await env.DB.prepare(
                'INSERT INTO sessions (id, user_id, score, created_at, json_data) VALUES (?, ?, ?, ?, ?)'
            ).bind(s.id, userId, s.score, s.date, JSON.stringify(s)).run();
            
            if (s.details && s.details.length > 0) {
                 const qIds = s.details.map((d: any) => d.questionId);
                 const placeholders = qIds.map(() => '?').join(',');
                 const { results } = await env.DB.prepare(
                     `SELECT id, json_data FROM questions WHERE id IN (${placeholders})`
                 ).bind(...qIds).all();

                 const updates: Promise<any>[] = [];
                 results.forEach((row: any) => {
                     const q = JSON.parse(row.json_data);
                     const detail = s.details.find((d: any) => d.questionId === q.id);
                     if (detail) {
                         if (detail.isCorrect) q.correctCount = (q.correctCount || 0) + 1;
                         else q.mistakeCount = (q.mistakeCount || 0) + 1;
                         q.lastPracticedAt = Date.now();
                         updates.push(
                             env.DB.prepare('UPDATE questions SET json_data = ? WHERE id = ?')
                               .bind(JSON.stringify(q), q.id).run()
                         );
                     }
                 });
                 if (updates.length > 0) await Promise.all(updates);
            }
            return json({ success: true });
        }
        if (request.method === 'DELETE') {
            const sId = path[1];
            if(sId) {
                await env.DB.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').bind(sId, userId).run();
                return json({ success: true });
            }
        }
    }

    return err('Not Found', 404);

  } catch (error: any) {
    return err(error.message || 'Internal Server Error', 500);
  }
};
