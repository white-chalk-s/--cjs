const express = require('express');
const { getDb, generateId, getNow } = require('../db');

const router = express.Router();

const SUMMARY_TYPE_CONFIG = {
    daily: {
        label: '日总结',
        templateKey: 'daily_summary_template'
    },
    weekly: {
        label: '周总结',
        templateKey: 'weekly_summary_template'
    },
    monthly: {
        label: '月总结',
        templateKey: 'monthly_summary_template'
    }
};

const DEFAULT_SETTINGS = {
    ai_provider: 'Local',
    ai_model: 'local-worker',
    ai_api_key: '',
    daily_summary_template: '请基于当天事件节点输出结构化日总结，重点提取开心、成就、消耗、能量来源。',
    weekly_summary_template: '请基于本周日总结输出周总结，提取重点事件、整体状态、重复问题、积极变化。',
    monthly_summary_template: '请基于本月周总结或日总结输出月总结，提取月度主题、情绪趋势、重要事件、下阶段关注点。'
};

function normalizeSummaryType(value) {
    const normalized = String(value || 'daily').toLowerCase();
    return SUMMARY_TYPE_CONFIG[normalized] ? normalized : null;
}

function formatYmd(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function addDays(date, amount) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
}

function getSummaryPeriod(summaryType, targetDate) {
    const anchor = new Date(`${targetDate}T00:00:00`);
    if (Number.isNaN(anchor.getTime())) {
        return null;
    }

    if (summaryType === 'daily') {
        const start = formatYmd(anchor);
        const end = formatYmd(addDays(anchor, 1));
        return {
            summaryType,
            periodKey: start,
            start,
            end,
            label: start,
            anchorDate: start
        };
    }

    if (summaryType === 'weekly') {
        const mondayOffset = (anchor.getDay() + 6) % 7;
        const startDate = addDays(anchor, -mondayOffset);
        const endDate = addDays(startDate, 7);
        const start = formatYmd(startDate);
        const end = formatYmd(endDate);
        return {
            summaryType,
            periodKey: start,
            start,
            end,
            label: `${start} 至 ${formatYmd(addDays(endDate, -1))}`,
            anchorDate: formatYmd(anchor)
        };
    }

    const start = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}-01`;
    const nextMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    const end = formatYmd(nextMonth);
    const periodKey = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`;
    return {
        summaryType,
        periodKey,
        start,
        end,
        label: `${anchor.getFullYear()}年${String(anchor.getMonth() + 1).padStart(2, '0')}月`,
        anchorDate: formatYmd(anchor)
    };
}

function getSettings(db) {
    const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?, ?, ?)')
        .all(
            'ai_provider',
            'ai_model',
            'ai_api_key',
            'daily_summary_template',
            'weekly_summary_template',
            'monthly_summary_template'
        );

    const settings = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
        settings[row.key] = row.value;
    }

    return settings;
}

function buildImageUrl(filePath) {
    return `/uploads/${String(filePath || '').replace(/\\/g, '/')}`;
}

function parseTags(value) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
    } catch (error) {
        return [];
    }
}

function getEntriesWithImages(db, dayId) {
    const rows = db.prepare(`
        SELECT *
        FROM diary_entries
        WHERE day_id = ?
        ORDER BY sort_order ASC, created_at ASC
    `).all(dayId);

    if (rows.length === 0) {
        return [];
    }

    const entryIds = rows.map((row) => row.id);
    const placeholders = entryIds.map(() => '?').join(', ');
    const imageRows = db.prepare(`
        SELECT *
        FROM entry_images
        WHERE entry_id IN (${placeholders})
        ORDER BY created_at ASC
    `).all(...entryIds);

    const imageMap = new Map();
    for (const image of imageRows) {
        const items = imageMap.get(image.entry_id) || [];
        items.push({
            ...image,
            url: buildImageUrl(image.file_path)
        });
        imageMap.set(image.entry_id, items);
    }

    return rows.map((row) => ({
        id: row.id,
        day_id: row.day_id,
        entry_time: row.entry_time || '',
        title: row.title || '',
        content: row.content || '',
        mood: row.mood || '',
        tags: parseTags(row.tags_json),
        images: imageMap.get(row.id) || [],
        sort_order: row.sort_order,
        created_at: row.created_at,
        updated_at: row.updated_at
    }));
}

function loadRangeContext(db, period) {
    const days = db.prepare(`
        SELECT *
        FROM diary_days
        WHERE record_date >= ? AND record_date < ?
        ORDER BY record_date ASC
    `).all(period.start, period.end);

    const dayBundles = days.map((day) => ({
        day,
        entries: getEntriesWithImages(db, day.id)
    }));

    const flatEntries = [];
    let imageCount = 0;
    for (const bundle of dayBundles) {
        for (const entry of bundle.entries) {
            flatEntries.push({
                record_date: bundle.day.record_date,
                ...entry
            });
            imageCount += Array.isArray(entry.images) ? entry.images.length : 0;
        }
    }

    return {
        dayBundles,
        flatEntries,
        stats: {
            dayCount: dayBundles.length,
            entryCount: flatEntries.length,
            imageCount
        }
    };
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

    if (positive.has(topMood)) {
        return `整体更偏向 ${topMood}`;
    }

    if (negative.has(topMood)) {
        return `整体更偏向 ${topMood}`;
    }

    return `最常出现的情绪是 ${topMood}`;
}

function buildTaskPayload(summaryType, period, context, settings) {
    const templateKey = SUMMARY_TYPE_CONFIG[summaryType].templateKey;
    return {
        taskId: generateId('summary_task'),
        summaryType,
        period,
        template: settings[templateKey] || '',
        sourceStats: context.stats,
        sourceDays: context.dayBundles.map((bundle) => ({
            dayId: bundle.day.id,
            recordDate: bundle.day.record_date,
            entryCount: bundle.entries.length,
            entries: bundle.entries.map((entry) => ({
                entryTime: entry.entry_time,
                title: entry.title,
                content: entry.content,
                mood: entry.mood,
                tags: entry.tags,
                imageCount: entry.images.length
            }))
        })),
        sourceEntries: context.flatEntries.map((entry) => ({
            recordDate: entry.record_date,
            entryTime: entry.entry_time,
            title: entry.title,
            content: entry.content,
            mood: entry.mood,
            tags: entry.tags,
            images: entry.images.map((image) => ({
                id: image.id,
                fileName: image.file_name,
                url: image.url
            }))
        })),
        generatedAt: getNow(),
        instructions: [
            '请仅根据 sourceDays / sourceEntries / template 生成结构化总结。',
            '输出结果应保留 title、overview、key_points、mood_trend、highlights、concerns、one_line。',
            '如果有必要，可追加 sections 数组，但不要输出和任务无关的内容。'
        ]
    };
}

function buildLocalFallbackSummary(summaryType, period, context) {
    const moodCounts = countValues(context.flatEntries, (entry) => entry.mood);
    const tagCounts = countValues(
        context.flatEntries.flatMap((entry) => entry.tags || []).map((tag) => ({ tag })),
        (item) => item.tag
    );
    const orderedEntries = [...context.flatEntries].sort((left, right) => {
        const leftKey = `${left.record_date} ${left.entry_time || '00:00'}`;
        const rightKey = `${right.record_date} ${right.entry_time || '00:00'}`;
        return leftKey.localeCompare(rightKey);
    });

    const keyPoints = orderedEntries.slice(0, 6).map((entry) => {
        const time = entry.entry_time ? `${entry.entry_time} ` : '';
        return `${entry.record_date} ${time}${entry.title || '未命名节点'}`.trim();
    });

    const highlights = orderedEntries
        .filter((entry) => /开心|完成|达成|解决|顺利|放松|满足/.test(`${entry.mood} ${entry.title} ${entry.content}`))
        .slice(0, 4)
        .map((entry) => `${entry.record_date} ${entry.title || '未命名节点'}`.trim());

    const concerns = orderedEntries
        .filter((entry) => /疲惫|压力|冲突|拖延|难|焦虑|烦/.test(`${entry.mood} ${entry.title} ${entry.content}`))
        .slice(0, 4)
        .map((entry) => `${entry.record_date} ${entry.title || '未命名节点'}`.trim());

    const topTags = tagCounts.slice(0, 6).map((item) => item.value);
    const overview = context.flatEntries.length === 0
        ? `${period.label}没有记录到事件节点，可以从今天开始补充几个关键节点。`
        : `${period.label}共有 ${context.stats.entryCount} 个事件节点，分布在 ${context.stats.dayCount} 天，${pickMoodDescriptor(moodCounts)}。`;

    return {
        title: `${period.label}总结`,
        overview,
        key_points: keyPoints.length > 0 ? keyPoints : ['本周期没有可提炼的事件节点。'],
        mood_trend: pickMoodDescriptor(moodCounts),
        highlights: highlights.length > 0 ? highlights : ['暂无明显高光事件，建议补充更具体的节点描述。'],
        concerns: concerns.length > 0 ? concerns : ['暂无明显风险点。'],
        one_line: context.flatEntries.length === 0
            ? '这一段时间还没有记录，适合先从一个小事件开始。'
            : `${period.label}里最值得延续的是 ${topTags[0] || '持续记录'}。`,
        generator: {
            provider: 'local-fallback',
            model: 'rule-based',
            mode: 'fallback'
        },
        source_stats: {
            ...context.stats,
            top_moods: moodCounts.slice(0, 5),
            top_tags: topTags
        }
    };
}

function normalizeSummaryContent(summaryType, period, context, payload) {
    const sourceStats = payload.source_stats || payload.sourceStats || context.stats;
    return {
        summary_type: summaryType,
        title: String(payload.title || `${period.label}总结`),
        period,
        overview: String(payload.overview || ''),
        key_points: Array.isArray(payload.key_points) && payload.key_points.length > 0
            ? payload.key_points.map((item) => String(item)).filter(Boolean)
            : [],
        mood_trend: String(payload.mood_trend || ''),
        highlights: Array.isArray(payload.highlights) && payload.highlights.length > 0
            ? payload.highlights.map((item) => String(item)).filter(Boolean)
            : [],
        concerns: Array.isArray(payload.concerns) && payload.concerns.length > 0
            ? payload.concerns.map((item) => String(item)).filter(Boolean)
            : [],
        one_line: String(payload.one_line || ''),
        source_stats: sourceStats,
        generator: payload.generator || {
            provider: 'local',
            model: 'local-worker',
            mode: 'ingest'
        },
        sections: Array.isArray(payload.sections) ? payload.sections : undefined
    };
}

function buildRawText(summary) {
    const lines = [
        summary.title,
        `概览：${summary.overview}`,
        `情绪趋势：${summary.mood_trend}`,
        `一句话总结：${summary.one_line}`,
        '',
        '关键点：',
        ...summary.key_points.map((item) => `- ${item}`),
        '',
        '亮点：',
        ...summary.highlights.map((item) => `- ${item}`),
        '',
        '需要关注：',
        ...summary.concerns.map((item) => `- ${item}`)
    ];

    return lines.join('\n');
}

function mapSummaryRow(row) {
    if (!row) {
        return null;
    }

    let contentJson = {};
    try {
        contentJson = JSON.parse(row.content_json || '{}');
    } catch (error) {
        contentJson = {};
    }

    return {
        id: row.id,
        summary_type: row.period_type,
        period_key: row.period_key,
        source_day_id: row.source_day_id,
        content_json: contentJson,
        raw_text: row.raw_text || '',
        model_name: row.model_name || '',
        prompt_version: row.prompt_version || '',
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function saveSummary(db, summaryType, period, summary, sourceDayId) {
    const existing = db.prepare(`
        SELECT id, created_at
        FROM ai_summaries
        WHERE period_type = ? AND period_key = ?
    `).get(summaryType, period.periodKey);

    const now = getNow();
    const id = existing?.id || generateId('summary');
    const rawText = buildRawText(summary);

    db.prepare(`
        INSERT OR REPLACE INTO ai_summaries (
            id, period_type, period_key, source_day_id, content_json, raw_text,
            model_name, prompt_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        summaryType,
        period.periodKey,
        sourceDayId || null,
        JSON.stringify(summary),
        rawText,
        summary.generator?.model || 'local-worker',
        'v2-local-bridge',
        existing?.created_at || now,
        now
    );

    return db.prepare('SELECT * FROM ai_summaries WHERE id = ?').get(id);
}

function getSummaryRow(db, summaryType, periodKey) {
    return db.prepare(`
        SELECT *
        FROM ai_summaries
        WHERE period_type = ? AND period_key = ?
        LIMIT 1
    `).get(summaryType, periodKey);
}

function buildSummaryBundle(db, summaryType, targetDate) {
    const settings = getSettings(db);
    const period = getSummaryPeriod(summaryType, targetDate);
    if (!period) {
        return null;
    }

    const context = loadRangeContext(db, period);
    const task = buildTaskPayload(summaryType, period, context, settings);
    const existing = getSummaryRow(db, summaryType, period.periodKey);

    return {
        settings: {
            provider: settings.ai_provider,
            model: settings.ai_model,
            template: settings[SUMMARY_TYPE_CONFIG[summaryType].templateKey] || ''
        },
        period,
        sourceStats: context.stats,
        task,
        summary: mapSummaryRow(existing)
    };
}

router.get('/', (req, res) => {
    try {
        const summaryType = normalizeSummaryType(req.query.summaryType);
        const targetDate = String(req.query.targetDate || new Date().toISOString().slice(0, 10));

        if (!summaryType) {
            return res.status(400).json({
                success: false,
                error: 'Invalid summary type'
            });
        }

        const db = getDb();
        const bundle = buildSummaryBundle(db, summaryType, targetDate);
        if (!bundle) {
            return res.status(400).json({
                success: false,
                error: 'Invalid target date'
            });
        }

        res.json({
            success: true,
            data: {
                summaryType,
                ...bundle
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/task', (req, res) => {
    try {
        const summaryType = normalizeSummaryType(req.query.summaryType);
        const targetDate = String(req.query.targetDate || new Date().toISOString().slice(0, 10));

        if (!summaryType) {
            return res.status(400).json({
                success: false,
                error: 'Invalid summary type'
            });
        }

        const db = getDb();
        const bundle = buildSummaryBundle(db, summaryType, targetDate);
        if (!bundle) {
            return res.status(400).json({
                success: false,
                error: 'Invalid target date'
            });
        }

        res.json({
            success: true,
            data: {
                summaryType,
                period: bundle.period,
                task: bundle.task,
                sourceStats: bundle.sourceStats,
                settings: bundle.settings,
                summary: bundle.summary
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/ingest', (req, res) => {
    try {
        const summaryType = normalizeSummaryType(req.body?.summaryType);
        const targetDate = String(req.body?.targetDate || new Date().toISOString().slice(0, 10));
        const payload = req.body?.summary || req.body?.content_json || req.body || {};

        if (!summaryType) {
            return res.status(400).json({
                success: false,
                error: 'Invalid summary type'
            });
        }

        const db = getDb();
        const bundle = buildSummaryBundle(db, summaryType, targetDate);
        if (!bundle) {
            return res.status(400).json({
                success: false,
                error: 'Invalid target date'
            });
        }

        const normalized = normalizeSummaryContent(summaryType, bundle.period, {
            ...bundle,
            stats: bundle.sourceStats
        }, payload);

        const sourceDayId = summaryType === 'daily'
            ? bundle.task.sourceDays[0]?.dayId
            : null;

        const savedRow = saveSummary(
            db,
            summaryType,
            bundle.period,
            normalized,
            sourceDayId
        );

        res.json({
            success: true,
            data: {
                summary: mapSummaryRow(savedRow),
                period: bundle.period,
                sourceStats: bundle.sourceStats
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
