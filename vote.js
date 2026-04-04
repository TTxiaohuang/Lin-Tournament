// /api/vote.js
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('只支持 POST 请求');

    const songName = req.body.songName;
    if (!songName) return res.status(400).send('歌曲名不能为空');

    // 完美对应你刚才找到的那两把钥匙的名字
    const KV_URL = process.env.KV_REST_API_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN;

    if (!KV_URL || !KV_TOKEN) {
        console.error("在 Vercel 环境变量中找不到密钥");
        return res.status(500).json({ error: '数据库配置丢失' });
    }

    try {
        // 1. 给这首歌的票数 +1
        await fetch(`${KV_URL}/ZINCRBY/champion_leaderboard/1/${encodeURIComponent(songName)}`, {
            headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });

        // 2. 获取排行榜前 5 名
        const rankRes = await fetch(`${KV_URL}/ZREVRANGE/champion_leaderboard/0/4/WITHSCORES`, {
            headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const rankData = await rankRes.json();

        // 3. 整理数据发回网页
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
        console.error("数据库读写异常:", error);
        res.status(500).json({ error: '数据库操作失败' });
    }
}