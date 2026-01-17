
import { QuestionCategory } from "../types";
import { SUB_CATEGORY_MAP } from "../constants";

// 豆包/火山引擎 API 配置 (官方标准 Endpoint)
const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
// Flash 模型速度快，配合优化后的 Prompt 和原图上传，能兼顾速度与准确率
const DOUBAO_ENDPOINT_ID = "doubao-seed-1-6-flash-250828"; 

const compressImageForAI = (base64Data: string, mimeType: string = 'image/png'): Promise<string> => {
    // 兼容非浏览器环境 (Cloudflare Workers)
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return Promise.resolve(base64Data.includes(',') ? base64Data.split(',')[1] : base64Data);
    }

    return new Promise((resolve) => {
        const img = new Image();
        // 使用正确的 MIME 类型加载图片
        img.src = base64Data.startsWith('data:') ? base64Data : `data:${mimeType};base64,${base64Data}`;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            
            // 用户要求保持原尺寸，移除分辨率限制，确保小字号内容不丢失细节
            const width = img.width;
            const height = img.height;

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(base64Data); return; }
            
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            
            // 使用较高的 JPEG 质量 (0.85) 确保文字锐利，同时避免 PNG 体积过大
            const compressed = canvas.toDataURL('image/jpeg', 0.85);
            resolve(compressed.split(',')[1]);
        };
        // 如果加载失败（例如格式不支持），降级为原样发送
        img.onerror = () => resolve(base64Data);
    });
};

/**
 * 调用豆包多模态接口进行题目分析
 */
export const analyzeQuestionImage = async (base64Data: string, mimeType: string = 'image/png') => {
  const totalStart = performance.now();
  
  // 安全获取 API Key (兼容 Vite 替换和 Process 环境)
  let apiKey = '';
  try { apiKey = process.env.API_KEY || ''; } catch(e) {}
  
  if (!apiKey) throw new Error("API_KEY 未配置，请在 .env 文件中设置");

  // 标准化图片格式（保持原尺寸）
  const compressStart = performance.now();
  const compressedBase64 = await compressImageForAI(base64Data, mimeType);
  const compressEnd = performance.now();
  
  const categoryTree = Object.entries(SUB_CATEGORY_MAP).map(([cat, subs]) => 
      `${cat}: ${subs.join(", ")}`
  ).join("; ");

  const prompt = `你是一个专业的公务员考试（行测）专家。
    请识别图片中的题目，并严格按照以下 JSON 格式返回。
    
    输出要求：
    - materialText: (重要) 提取题目所属的背景材料文本。如果是资料分析题，请提取表格上方/下方的说明文字或纯文字材料；如果是言语理解题，请提取文段内容。如果没有特定材料则留空。
    - stem: 提取完整的题干文字。**特别注意：如果题干中包含编号列表（如 ①... ②... ③... 或 1... 2...），请务必完整提取这些陈述句，不要遗漏，并保持换行格式。**
    - options: 提取 A, B, C, D 四个选项的内容（不带 A. B. 前缀）。**注意：选项内容经常是数字组合（如"①②③"或"甲乙丙"），请精准识别这些序号，不要看错数字。**
    - category: 必须属于 [常识判断, 判断推理, 言语理解, 数量关系, 资料分析] 之一。
    - subCategory: 根据题型准确分类。
    - tags: 2-3个核心考点关键词。**注意：tags 必须是具体的考点细节，严禁包含大类（category）和小类（subCategory）的名称。例如：“图形推理”是分类，tags应为“对称性”、“一笔画”等。**
    - answerIndex: 优先提取图片中高亮/打钩/红色标记的正确答案。如果图片中没有明确的答案标记，请你作为专家解答该题，并返回正确选项的索引 (A=0, B=1, C=2, D=3)。
    - accuracySuggestion: 提取图片中显示的"全站正确率"或"平均正确率"数值(0-100的整数)。如果图片中没有显示正确率，则返回 60。
    
    分类参考指南：${categoryTree}`;

  const requestBody = {
    model: DOUBAO_ENDPOINT_ID,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${compressedBase64}` }
          }
        ]
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    thinking: { type: "disabled" }
  };

  try {
    const apiStart = performance.now();
    
    // WebApp 端调试日志 (F12可见)
    console.log("[DEBUG] analyzeQuestionImage Body:", requestBody);

    const response = await fetch(ARK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    const apiEnd = performance.now();

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 报错: ${errorText}`);
    }

    const parseStart = performance.now();
    const data = await response.json();
    const content = data.choices[0].message.content;
    const result = JSON.parse(content);

    if (result.options && Array.isArray(result.options)) {
        result.options = result.options.map((opt: string) => 
            opt.replace(/^[A-D][\.、\s]*/, '').trim()
        );
    }
    const parseEnd = performance.now();
    const totalEnd = performance.now();

    console.group(`⚡ AI 识别性能监控 [${new Date().toLocaleTimeString()}]`);
    console.log(`🖼️ 图片压缩: ${(compressEnd - compressStart).toFixed(2)}ms`);
    console.log(`🚀 API 请求: ${(apiEnd - apiStart).toFixed(2)}ms`);
    console.log(`🧩 数据解析: ${(parseEnd - parseStart).toFixed(2)}ms`);
    console.log(`⏱️ 总耗时: ${(totalEnd - totalStart).toFixed(2)}ms`);
    console.groupEnd();

    return result;
  } catch (error: any) {
    console.error("识别失败:", error);
    throw new Error(error.message || "AI 识别失败");
  }
};

/**
 * 批量识别逻辑
 */
export const analyzeBatchQuestions = async (base64Data: string, mimeType: string) => {
    let apiKey = '';
    try { apiKey = process.env.API_KEY || ''; } catch(e) {}
    if (!apiKey) throw new Error("API Key 未配置");
    
    // 标准化图片格式（保持原尺寸）
    const compressed = await compressImageForAI(base64Data, mimeType);

    const prompt = `识别图片中的所有题目。请返回一个 JSON 对象，包含 "questions" 数组。
    每个题目对象需包含：
    - materialText: 题目材料（如资料分析的文字材料、言语理解的文段）
    - stem: 题干（**必须包含 ①②③④ 等编号内容**）
    - options: 选项数组（**精准识别选项中的数字组合，如 ①③④**）
    - answerIndex: 答案索引(0-3)，优先识别图片中的标记，无标记则自行解答
    - category: 分类
    - subCategory: 子分类
    - accuracySuggestion: 图片中的正确率
    - tags: 标签数组（**必须是具体考点，不要重复 category 和 subCategory 的名称**）
    `;

    const requestBody = {
        model: DOUBAO_ENDPOINT_ID,
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${compressed}` } }
                ]
            }
        ],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" }
    };

    try {
        const response = await fetch(ARK_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        const content = data.choices[0].message.content;
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : (parsed.questions || []);
    } catch (error) {
        console.error("批量识别失败:", error);
        return [];
    }
};

/**
 * [插件专用] 联合分析接口
 * 接收文本数据，返回分类和通俗易懂的解析
 */
export const analyzeExternalQuestion = async (
    payload: { 
        stem: string, 
        options: string[], 
        materials: string[],
        materialText?: string,
        userAnswer?: number, // 用户选错的选项索引
        correctAnswer?: number // 正确选项索引
    }, 
    apiKeyOverride?: string
) => {
    let apiKey = apiKeyOverride;
    
    if (!apiKey) {
        try { apiKey = process.env.API_KEY; } catch (e) {}
    }

    if (!apiKey) throw new Error("API_KEY 未配置");

    const categoryTree = Object.entries(SUB_CATEGORY_MAP).map(([cat, subs]) => `${cat}: ${subs.join(", ")}`).join("; ");

    // 选项字母映射
    const labels = ['A', 'B', 'C', 'D'];
    
    // 构建用户答题情况的描述
    let userStatus = "";
    if (payload.userAnswer !== undefined && payload.userAnswer >= 0 && payload.userAnswer <= 3) {
        if (payload.correctAnswer !== undefined && payload.userAnswer === payload.correctAnswer) {
             userStatus = "用户做对了这道题。";
        } else {
             userStatus = `用户错选了：${labels[payload.userAnswer]}。请分析为什么用户会选这个选项（错误原因）。`;
        }
    } else {
        userStatus = "请给出完整的解析。";
    }

    const prompt = `你是一位经验丰富、说话通俗易懂的公考行测 AI 助手。
    
    题目信息:
    题干: ${payload.stem}
    选项: ${payload.options.join(' | ')}
    ${payload.materialText ? `材料文本: ${payload.materialText}` : ''}
    ${userStatus}
    
    请严格返回 JSON 格式:
    {
      "category": "必须选自 [常识判断, 判断推理, 言语理解, 数量关系, 资料分析]",
      "subCategory": "子类，参考: ${categoryTree}",
      "miniAnalysis": "解析内容。请用HTML格式（使用 <p>, <b>, <span> 颜色等标签美化）。\n要求：\n1. 风格通俗易懂，详略得当，不要堆砌术语。\n2. **重点分析**：为什么正确选项是对的？思路是什么？\n3. **针对性**：${userStatus.includes('做对') ? '用户做对了，重点总结该题型的秒杀技巧或核心公式，不需要纠错。' : '用户做错了，请详细解释错误选项的陷阱在哪里，以及如何避免。'}\n4. 对于明显凑数的错误选项，一笔带过即可。"
    }`;

    const messages: any[] = [{ role: "user", content: [{ type: "text", text: prompt }] }];
    
    if (payload.materials && payload.materials.length > 0) {
        // Limit to first 3 images to avoid payload issues
        const mats = payload.materials.slice(0, 3);
        mats.forEach(mat => {
             const imgUrl = mat.startsWith('http') ? mat : (mat.startsWith('data:') ? mat : `data:image/jpeg;base64,${mat}`);
             messages[0].content.push({ type: "image_url", image_url: { url: imgUrl } });
        });
    }

    const requestBody = {
        model: DOUBAO_ENDPOINT_ID,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.3,
        thinking: { type: "disabled" }
    };

    // Server-side Log (Visible in Wrangler Logs)
    console.log("====== [DEBUG] Plugin Analyze Request Payload ======");
    console.log(JSON.stringify(requestBody, null, 2));

    const response = await fetch(ARK_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
         const errorText = await response.text();
         throw new Error(`AI Service Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    try {
        const result = JSON.parse(data.choices[0].message.content);
        // ★★★ 关键修改：将请求体 requestBody 附带在返回结果中
        // 这样您在浏览器 Network 面板查看 /api/external/analyze 的 Response 时，
        // 就能看到 _debug_request_body 字段，无需查看服务器日志。
        return { ...result, _debug_request_body: requestBody };
    } catch (e) {
        console.error("AI Response Parse Error", data);
        throw new Error("Failed to parse AI response");
    }
};

/**
 * [插件专用] 对话接口
 * 支持用户对题目进行追问
 */
export const chatWithQuestion = async (
    payload: { 
        stem: string, 
        options: string[], 
        history: {role: string, content: string}[],
        newMessage: string
    }, 
    apiKeyOverride?: string
) => {
    let apiKey = apiKeyOverride;
    if (!apiKey) { try { apiKey = process.env.API_KEY; } catch (e) {} }
    if (!apiKey) throw new Error("API_KEY 未配置");

    const systemPrompt = `你是一位公考行测 AI 助手。正在辅导学生做这道题：
    题干：${payload.stem}
    选项：${payload.options.join(' | ')}
    
    请解答用户的疑问。回答要简练、直接、切中要害。
    可以使用Markdown语法，例如用 **粗体** 强调重点。`;

    const messages = [
        { role: 'system', content: systemPrompt },
        ...payload.history,
        { role: 'user', content: payload.newMessage }
    ];

    const requestBody = {
        model: DOUBAO_ENDPOINT_ID,
        messages,
        temperature: 0.5,
        thinking: { type: "disabled" }
    };

    const response = await fetch(ARK_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Chat Error (${response.status}): ${errorText}`);
    }
    const data = await response.json();
    // 同样附带 Debug 信息
    return { reply: data.choices[0].message.content, _debug_request_body: requestBody };
};
