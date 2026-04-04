// /api/vote.js
// 这是一个运行在 Vercel 云端的函数，负责与数据库交互

export default async function handler(req, res) {
    // 只接受 POST 请求
    if (req.method !== 'POST') return res.status(405).send('只支持 POST 请求');

    const songName = req.body.songName;
    if (!songName) return res.status(400).send('歌曲名不能为空');

    // Vercel 会自动为我们填入这两个数据库密钥
    const KV_URL = process.env.KV_REST_API_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN;

    try {
        // 1. 给这首歌的票数 +1 (使用 Redis 的 ZINCRBY 命令)
        await fetch(`${KV_URL}/ZINCRBY/champion_leaderboard/1/${encodeURIComponent(songName)}`, {
            headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });

        // 2. 获取排行榜前 5 名 (使用 Redis 的 ZREVRANGE 命令)
        const rankRes = await fetch(`${KV_URL}/ZREVRANGE/champion_leaderboard/0/4/WITHSCORES`, {
            headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const rankData = await rankRes.json();

        // 3. 把拿到的数据整理成漂亮的格式发回给网页
        let leaderboard = [];
        if (rankData.result) {
            for (let i = 0; i < rankData.result.length; i += 2) {
                leaderboard.push({
                    songName: rankData.result[i],
                    votes: parseInt(rankData.result[i+1])
                });
            }
        }

        // 成功返回排行榜数据
        res.status(200).json(leaderboard);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '数据库操作失败' });
    }
}