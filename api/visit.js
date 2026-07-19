// /api/visit.js - 记录独立访客
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('只支持 POST 请求');

    const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!KV_URL || !KV_TOKEN) {
        console.error("Vercel 环境变量为空");
        return res.status(500).json({ error: '数据库密码丢失' });
    }

    try {
        const incrRes = await fetch(`${KV_URL}/INCR/total_visitors`, {
            headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const data = await incrRes.json();
        res.status(200).json({ total_visitors: data.result });
    } catch (error) {
        console.error("访客记录失败:", error);
        res.status(500).json({ error: '记录访问失败' });
    }
}
