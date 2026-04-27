const DEFAULT_BASE_URL = process.env.DIARY_PLATFORM_URL || 'http://127.0.0.1:3011';
const SUMMARY_TYPE = String(process.env.SUMMARY_TYPE || 'daily').toLowerCase();
const TARGET_DATE = String(process.env.TARGET_DATE || new Date().toISOString().slice(0, 10));
const LOCAL_AI_ENDPOINT = String(process.env.LOCAL_AI_ENDPOINT || '').trim();

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`${response.status} ${text}`);
    }

    return text ? JSON.parse(text) : null;
}

function countValues(items, getter) {
    const counts = new Map();
    for (const item of items) {
        const value = String(getter(item) || '').trim();
        if (!value) {
            continue;
        }

        counts.set(value, (counts.get(value) || 0) + 1);
    }

    return [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function pickMoodDescriptor(moodCounts) {
    if (moodCounts.length === 0) {
        return '未设置情绪';
    }

    const topMood = moodCounts[0].value;
    const positive = new Set(['开心', '平静', '专注', '满足', '轻松']);
    const negative = new Set(['疲惫', '焦虑', '沮丧', '压力', '低落']);

    if (positive.has(topMood) || negative.has(topMood)) {
        return `整体更偏向 ${topMood}`;
    }

    return `最常出现的情绪是 ${topMood}`;
}

function buildLocalSummary(task) {
    const entries = Array.isArray(task?.sourceEntries) ? task.sourceEntries : [];
    const moodCounts = countValues(entries, (entry) => entry.mood);
    const tagCounts = countValues(
        entries.flatMap((entry) => entry.tags || []).map((tag) => ({ tag })),
        (item) => item.tag
    );
    const ordered = [...entries].sort((left, right) => {
        const leftKey = `${left.recordDate} ${left.entryTime || '00:00'}`;
        const rightKey = `${right.recordDate} ${right.entryTime || '00:00'}`;
        return leftKey.localeCompare(rightKey);
    });

    const keyPoints = ordered.slice(0, 6).map((entry) => {
        const time = entry.entryTime ? `${entry.entryTime} ` : '';
        return `${entry.recordDate} ${time}${entry.title || '未命名节点'}`.trim();
    });

    const highlights = ordered
        .filter((entry) => /开心|完成|达成|解决|顺利|放松|满足/.test(`${entry.mood} ${entry.title} ${entry.content}`))
        .slice(0, 4)
        .map((entry) => `${entry.recordDate} ${entry.title || '未命名节点'}`.trim());

    const concerns = ordered
        .filter((entry) => /疲惫|压力|冲突|拖延|难|焦虑|烦/.test(`${entry.mood} ${entry.title} ${entry.content}`))
        .slice(0, 4)
        .map((entry) => `${entry.recordDate} ${entry.title || '未命名节点'}`.trim());

    const topTags = tagCounts.slice(0, 6).map((item) => item.value);
    const periodLabel = task?.period?.label || task?.period?.periodKey || '总结';

    return {
        title: `${periodLabel}总结`,
        overview: entries.length === 0
            ? `${periodLabel}没有记录到事件节点，可以从今天开始补充几个关键节点。`
            : `${periodLabel}共有 ${task?.sourceStats?.entryCount || entries.length} 个事件节点，分布在 ${task?.sourceStats?.dayCount || 0} 天，${pickMoodDescriptor(moodCounts)}。`,
        key_points: keyPoints.length > 0 ? keyPoints : ['本周期没有可提炼的事件节点。'],
        mood_trend: pickMoodDescriptor(moodCounts),
        highlights: highlights.length > 0 ? highlights : ['暂无明显高光事件，建议补充更具体的节点描述。'],
        concerns: concerns.length > 0 ? concerns : ['暂无明显风险点。'],
        one_line: entries.length === 0
            ? '这一段时间还没有记录，适合先从一个小事件开始。'
            : `${periodLabel}里最值得延续的是 ${topTags[0] || '持续记录'}。`,
        generator: {
            provider: LOCAL_AI_ENDPOINT ? 'local-ai-endpoint' : 'local-rule-worker',
            model: LOCAL_AI_ENDPOINT ? 'custom-local-model' : 'rule-based',
            mode: LOCAL_AI_ENDPOINT ? 'endpoint' : 'fallback'
        },
        source_stats: {
            ...(task?.sourceStats || {}),
            top_moods: moodCounts.slice(0, 5),
            top_tags: topTags
        }
    };
}

async function run() {
    const taskUrl = new URL('/api/summaries/task', DEFAULT_BASE_URL);
    taskUrl.searchParams.set('summaryType', SUMMARY_TYPE);
    taskUrl.searchParams.set('targetDate', TARGET_DATE);

    const taskResult = await fetchJson(taskUrl.toString());
    const task = taskResult?.data?.task;

    if (!task) {
        throw new Error('Failed to load summary task');
    }

    let summary = null;

    if (LOCAL_AI_ENDPOINT) {
        const localResult = await fetchJson(LOCAL_AI_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(task)
        });

        summary = localResult?.summary || localResult?.content_json || localResult;
    } else {
        summary = buildLocalSummary(task);
    }

    const ingestUrl = new URL('/api/summaries/ingest', DEFAULT_BASE_URL);
    const ingestResult = await fetchJson(ingestUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            summaryType: SUMMARY_TYPE,
            targetDate: TARGET_DATE,
            summary
        })
    });

    console.log(JSON.stringify({
        ok: true,
        summaryType: SUMMARY_TYPE,
        targetDate: TARGET_DATE,
        savedId: ingestResult?.data?.summary?.id || null
    }, null, 2));
}

run().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
