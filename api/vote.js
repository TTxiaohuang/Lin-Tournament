// /api/vote.js
// POST  → 投票 + 返回 Top 5
// GET   → 返回排行榜（支持 ?top=N 参数，默认 5，最大 32）

export default async function handler(req, res) {
    // 智能双路识别：不管是叫 KV 还是叫 UPSTASH，只要填了就能找到
    const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!KV_URL || !KV_TOKEN) {
        console.error("致命错误：Vercel 环境变量为空！请检查 Settings -> Environment Variables");
        return res.status(500).json({ error: '数据库密码丢失' });
    }

    const headers = { Authorization: `Bearer ${KV_TOKEN}` };

    // ---- GET 请求：返回排行榜 ----
    if (req.method === 'GET') {
        try {
            const top = Math.min(Math.max(parseInt(req.query?.top) || 5, 1), 32);
            const limit = top - 1; // Redis ZREVRANGE 是 0-indexed

            const rankRes = await fetch(`${KV_URL}/ZREVRANGE/champion_leaderboard/0/${limit}/WITHSCORES`, { headers });
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

            return res.status(200).json(leaderboard);
        } catch (error) {
            console.error("排行榜查询失败:", error);
            return res.status(500).json({ error: '排行榜查询失败' });
        }
    }

    // ---- POST 请求：投票 + 返回 Top 5 ----
    if (req.method === 'POST') {
        const songName = req.body?.songName;
        if (!songName) return res.status(400).json({ error: '歌曲名不能为空' });

        try {
            // 投票 +1
            await fetch(`${KV_URL}/ZINCRBY/champion_leaderboard/1/${encodeURIComponent(songName)}`, { headers });

            // 取 Top 5
            const rankRes = await fetch(`${KV_URL}/ZREVRANGE/champion_leaderboard/0/4/WITHSCORES`, { headers });
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

            return res.status(200).json(leaderboard);
        } catch (error) {
            console.error("数据库请求彻底失败:", error);
            return res.status(500).json({ error: '数据库读写失败' });
        }
    }

    // 其他方法
    return res.status(405).json({ error: '只支持 GET / POST 请求' });
}
