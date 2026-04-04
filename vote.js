// /api/vote.js (无敌自适应找钥匙版)
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('只支持 POST 请求');

    const songName = req.body.songName;
    if (!songName) return res.status(400).send('歌曲名不能为空');

    // 智能双路识别：不管是叫 KV 还是叫 UPSTASH，只要填了就能找到
    const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!KV_URL || !KV_TOKEN) {
        console.error("致命错误：Vercel 环境变量为空！请检查 Settings -> Environment Variables");
        // 如果这里报错，说明 Vercel 的保险箱里真的没有存密码
        return res.status(500).json({ error: '数据库密码丢失' });
    }

    try {
        await fetch(`${KV_URL}/ZINCRBY/champion_leaderboard/1/${encodeURIComponent(songName)}`, {
            headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });

        const rankRes = await fetch(`${KV_URL}/ZREVRANGE/champion_leaderboard/0/4/WITHSCORES`, {
            headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const rankData = await rankRes.json();

        let leaderboard = [];
        if (rankData.result) {
            for (let i = 0; i < rankData.result.length; i += 2) {
                leaderboard.push({
                    songName: rankData.result[i],
                    votes: parseInt(rankData.result[i+1])
                });
            }
        }

        res.status(200).json(leaderboard);
    } catch (error) {
        console.error("数据库请求彻底失败:", error);
        res.status(500).json({ error: '数据库读写失败' });
    }
}