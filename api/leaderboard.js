// /api/leaderboard.js - 读取网友冠军歌曲排行
export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).send('只支持 GET 请求');

    const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!KV_URL || !KV_TOKEN) {
        console.error("致命错误：Vercel 环境变量为空！请检查 Settings -> Environment Variables");
        return res.status(500).json({ error: '数据库密码丢失' });
    }

    try {
        // 取所有人（因为总共就32首歌，全部拉取非常快，方便前端计算总真实票数）
        const rankRes = await fetch(`${KV_URL}/ZREVRANGE/champion_leaderboard/0/-1/WITHSCORES`, {
            headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const rankData = await rankRes.json();

        let leaderboard = [];
        if (rankData.result) {
            for (let i = 0; i < rankData.result.length; i += 2) {
                leaderboard.push({
                    songName: rankData.result[i],
                    votes: parseInt(rankData.result[i + 1])
                });
            }
        }

        res.status(200).json(leaderboard);
    } catch (error) {
        console.error("数据库请求彻底失败:", error);
        res.status(500).json({ error: '数据库读取失败' });
    }
}
