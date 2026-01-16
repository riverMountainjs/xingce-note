import { QuestionCategory } from "./types";

export const SUB_CATEGORY_MAP: Record<QuestionCategory, string[]> = {
  [QuestionCategory.COMMON_SENSE]: [
    '政治常识', '法律常识', '经济常识', '人文历史', '科技常识', '地理国情', '管理公文'
  ],
  [QuestionCategory.LOGIC]: [
    '图形推理', '定义判断', '类比推理', '逻辑判断', '事件排序'
  ],
  [QuestionCategory.LANGUAGE]: [
    '逻辑填空', '中心理解', '细节判断', '语句表达', '篇章阅读'
  ],
  [QuestionCategory.QUANTITY]: [
    '数字推理', '数学运算', '工程问题', '行程问题', '经济利润', '几何问题', '排列组合',
    '最值问题', '和差倍比问题', '概率问题', '不定方程问题', '统筹规划问题', '分段计算问题', '数列问题'
  ],
  [QuestionCategory.DATA_ANALYSIS]: [
    '文字材料', '表格材料', '图形材料', '综合材料'
  ]
};