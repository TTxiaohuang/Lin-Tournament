// /api/vote.js
// POST  → 投票 + 返回 Top 5
// GET   → 返回排行榜（支持 ?top=N 参数，默认 5，最大 32）

export default async function handler(req, res) {
    // 智能双路识别
    const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!KV_URL || !KV_TOKEN) {
        console.error("致命错误：环境变量为空！", {
            hasKV_URL: !!process.env.KV_REST_API_URL,
            hasUPSTASH_URL: !!process.env.UPSTASH_REDIS_REST_URL,
            hasKV_TOKEN: !!process.env.KV_REST_API_TOKEN,
            hasUPSTASH_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
        });
        return res.status(500).json({ error: '数据库密码丢失' });
    }

    const headers = { Authorization: `Bearer ${KV_TOKEN}` };

    // ---- GET 请求：返回排行榜 ----
    if (req.method === 'GET') {
        try {
            const top = Math.min(Math.max(parseInt(req.query?.top) || 5, 1), 32);
            const limit = top - 1;
            const url = `${KV_URL}/ZREVRANGE/champion_leaderboard/0/${limit}/WITHSCORES`;

            console.log("GET 排行榜请求:", { top, limit, url: url.replace(KV_TOKEN, '***') });

            const rankRes = await fetch(url, { headers });

            if (!rankRes.ok) {
                const errText = await rankRes.text();
                console.error("Upstash GET 非200:", rankRes.status, errText);
                return res.status(502).json({ error: '数据库查询失败', detail: errText });
            }

            const rankData = await rankRes.json();
            console.log("Upstash GET 响应:", JSON.stringify(rankData).substring(0, 200));

            let leaderboard = [];
            if (rankData.result && Array.isArray(rankData.result)) {
                for (let i = 0; i < rankData.result.length; i += 2) {
                    leaderboard.push({
                        songName: rankData.result[i],
                        votes: parseInt(rankData.result[i + 1])
                    });
                }
            }

            return res.status(200).json(leaderboard);
        } catch (error) {
            console.error("排行榜查询异常:", error.message, error.stack);
            return res.status(500).json({ error: '排行榜查询失败', detail: error.message });
        }
    }

    // ---- POST 请求：投票 + 返回 Top 5 ----
    if (req.method === 'POST') {
        const songName = req.body?.songName;
        if (!songName) return res.status(400).json({ error: '歌曲名不能为空' });

        try {
            console.log("POST 投票请求:", { songName });

            // 投票 +1
            const incrUrl = `${KV_URL}/ZINCRBY/champion_leaderboard/1/${encodeURIComponent(songName)}`;
            console.log("ZINCRBY URL:", incrUrl.replace(KV_TOKEN, '***'));
            const incrRes = await fetch(incrUrl, { method: 'POST', headers });
            if (!incrRes.ok) {
                const errText = await incrRes.text();
                console.error("ZINCRBY 失败:", incrRes.status, errText);
                return res.status(502).json({ error: '投票写入失败', detail: errText });
            }
            console.log("ZINCRBY 成功");

            // 取 Top 5
            const rangeUrl = `${KV_URL}/ZREVRANGE/champion_leaderboard/0/4/WITHSCORES`;
            console.log("ZREVRANGE URL:", rangeUrl.replace(KV_TOKEN, '***'));
            const rankRes = await fetch(rangeUrl, { method: 'POST', headers });

            if (!rankRes.ok) {
                const errText = await rankRes.text();
                console.error("ZREVRANGE 失败:", rankRes.status, errText);
                return res.status(502).json({ error: '排行榜读取失败', detail: errText });
            }

            const rankData = await rankRes.json();
            console.log("ZREVRANGE 响应:", JSON.stringify(rankData).substring(0, 200));

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
            console.error("POST 投票异常:", error.message, error.stack);
            return res.status(500).json({ error: '数据库读写失败', detail: error.message });
        }
    }

    return res.status(405).json({ error: '只支持 GET / POST 请求' });
}
