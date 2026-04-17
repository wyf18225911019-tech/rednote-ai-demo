// /api/chat.js
export default async function handler(req, res) {
  // 安全拦截：仅允许POST方法，防止意外的GET请求访问
  if (req.method!== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. 本接口仅支持POST请求。' });
  }

  try {
    // 解析客户端传入的JSON负载，提取历史对话数组
    const { messages } = req.body;

    if (!messages ||!Array.isArray(messages)) {
      return res.status(400).json({ error: '请求参数错误，请提供合法的messages数组。' });
    }

    // 核心设计：注入强约束性的System Prompt
    // 该Prompt直接定义了返回结果的格式、语气以及严格的表格输出需求
    const systemPrompt = {
      role: "system",
      content: `你是一个小红书风格的生活方式博主+决策助手。
用户将提出一种需求，请你务必按以下三大模块结构化输出内容：

1. 推荐方案（提供3-5个具体选项）
- 名称
- 推荐理由（采用第一人称的真实体验风格，带有一点种草语气）
- 适合人群

2. 对比分析（必须使用Markdown表格呈现，以体现出色的决策对比能力）
- 表头必须包含：选项、优点、缺点、适合谁

3. 可执行方案（引导用户立刻行动）
- 如果是旅行/线下活动：按时间线（例如9:00-18:00）列出详细行程安排
- 如果是线上商品/护肤品：列出清晰的购买清单及规格建议

附加要求：
- 风格真实、有生活感，像高赞的小红书笔记总结，可适当使用emoji。
- 避免冗长的官话空话，突出各选项间的核心差异。
- 你的主要目标是帮助用户快速完成选择，而不是简单地堆砌信息。`
    };

    // 将系统提示词放置于对话上下文的最前端
    const apiMessages = [systemPrompt,...messages];

    // 调用DeepSeek API (与OpenAI SDK完全兼容的接口标准)
    // 使用 fetch API 减少依赖，适配 Vercel Edge/Node 运行时
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 关键安全机制：API密钥在部署环境中配置，对前端完全不可见
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` 
      },
      body: JSON.stringify({
        model: 'deepseek-chat', // 使用极速且性价比极高的聊天模型
        messages: apiMessages,
        temperature: 0.7, // 设置中等发散度，保证内容生动且格式稳定
        max_tokens: 2500 // 给予充分的生成空间以容纳表格和长清单
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('模型API通信异常:', errorData);
      return res.status(response.status).json({ error: '第三方AI服务暂时不可用，请重试。' });
    }

    const data = await response.json();
    const resultText = data.choices.message.content;

    // 将模型生成的核心Markdown文本包裹在JSON中返回
    return res.status(200).json({ result: resultText });

  } catch (error) {
    console.error('Vercel Serverless 执行错误:', error);
    return res.status(500).json({ error: '服务器内部逻辑错误。' });
  }
}