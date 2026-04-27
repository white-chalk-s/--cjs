const { getDb, backupDatabase } = require('../db');
const settingsRouter = require('./settings');
const daysRouter = require('./days');
const imagesRouter = require('./images');
const summariesRouter = require('./summaries');

function parseJson(value, fallback = {}) {
    try {
        return JSON.parse(value || '{}');
    } catch (error) {
        return fallback;
    }
}

function mapSummaryPreview(row) {
    if (!row) {
        return null;
    }

    const contentJson = parseJson(row.content_json);
    return {
        id: row.id,
        summaryType: row.period_type,
        periodKey: row.period_key,
        title: contentJson.title || row.period_key || '',
        overview: contentJson.overview || '',
        oneLine: contentJson.one_line || '',
        moodTrend: contentJson.mood_trend || '',
        keyPoints: Array.isArray(contentJson.key_points) ? contentJson.key_points : [],
        highlights: Array.isArray(contentJson.highlights) ? contentJson.highlights : [],
        concerns: Array.isArray(contentJson.concerns) ? contentJson.concerns : [],
        sourceStats: contentJson.source_stats || null,
        updatedAt: row.updated_at,
        createdAt: row.created_at,
        modelName: row.model_name || '',
        generator: contentJson.generator || null
    };
}

function registerApiRoutes(app) {
    app.get('/api/health', (req, res) => {
        try {
            const db = getDb();
            db.prepare('SELECT 1 AS ok').get();

            res.json({
                success: true,
                data: {
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    database: 'connected'
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    app.get('/api/bootstrap', (req, res) => {
        try {
            const db = getDb();
            const stats = {
                dayCount: db.prepare('SELECT COUNT(*) AS count FROM diary_days').get().count,
                entryCount: db.prepare('SELECT COUNT(*) AS count FROM diary_entries').get().count,
                summaryCount: db.prepare('SELECT COUNT(*) AS count FROM ai_summaries').get().count,
                imageCount: db.prepare('SELECT COUNT(*) AS count FROM entry_images').get().count
            };

            const recentDays = db.prepare(`
                SELECT
                    d.id,
                    d.record_date,
                    d.created_at,
                    d.updated_at,
                    COUNT(e.id) AS entry_count,
                    COALESCE(MAX(e.updated_at), d.updated_at) AS last_active_at
                FROM diary_days d
                LEFT JOIN diary_entries e ON e.day_id = d.id
                GROUP BY d.id
                ORDER BY d.record_date DESC
                LIMIT 5
            `).all().map((row) => ({
                id: row.id,
                recordDate: row.record_date,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                entryCount: Number(row.entry_count || 0),
                lastActiveAt: row.last_active_at || row.updated_at
            }));

            const recentEntries = db.prepare(`
                SELECT
                    e.id,
                    e.day_id,
                    d.record_date,
                    e.entry_time,
                    e.title,
                    e.content,
                    e.mood,
                    e.tags_json,
                    e.sort_order,
                    e.updated_at,
                    (SELECT COUNT(*) FROM entry_images i WHERE i.entry_id = e.id) AS image_count
                FROM diary_entries e
                JOIN diary_days d ON d.id = e.day_id
                ORDER BY d.record_date DESC, e.sort_order DESC, e.created_at DESC
                LIMIT 6
            `).all().map((row) => ({
                id: row.id,
                dayId: row.day_id,
                recordDate: row.record_date,
                entryTime: row.entry_time || '',
                title: row.title || '',
                content: row.content || '',
                mood: row.mood || '',
                tags: parseJson(row.tags_json, []),
                sortOrder: row.sort_order,
                updatedAt: row.updated_at,
                imageCount: Number(row.image_count || 0)
            }));

            const recentSummaries = db.prepare(`
                SELECT *
                FROM ai_summaries
                ORDER BY updated_at DESC
                LIMIT 4
            `).all().map(mapSummaryPreview);

            res.json({
                success: true,
                data: {
                    appName: '日记记录平台',
                    currentDate: new Date().toISOString().slice(0, 10),
                    stats,
                    recentDays,
                    recentEntries,
                    recentSummaries,
                    spotlight: {
                        latestDay: recentDays[0] || null,
                        latestEntry: recentEntries[0] || null,
                        latestSummary: recentSummaries[0] || null
                    },
                    milestones: [
                        '基础工程已创建',
                        'SQLite 与 migrations 已接入',
                        '5 个主导航页面骨架已就绪',
                        '设置页已支持本地配置保存'
                    ]
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    app.post('/api/backup', (req, res) => {
        try {
            const files = backupDatabase();

            res.json({
                success: true,
                data: files
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    app.get('/api/search', (req, res) => {
        try {
            const db = getDb();
            const query = String(req.query.query || '').trim();
            const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

            if (!query) {
                return res.json({
                    success: true,
                    data: {
                        query: '',
                        total: 0,
                        results: [],
                        matchedDates: []
                    }
                });
            }

            const like = `%${query}%`;
            const rows = db.prepare(`
                SELECT
                    e.id,
                    e.day_id,
                    d.record_date,
                    e.entry_time,
                    e.title,
                    e.content,
                    e.mood,
                    e.tags_json,
                    e.sort_order,
                    e.updated_at,
                    (SELECT COUNT(*) FROM entry_images i WHERE i.entry_id = e.id) AS image_count
                FROM diary_entries e
                JOIN diary_days d ON d.id = e.day_id
                WHERE d.record_date LIKE ?
                    OR e.entry_time LIKE ?
                    OR e.title LIKE ?
                    OR e.content LIKE ?
                    OR e.mood LIKE ?
                    OR e.tags_json LIKE ?
                ORDER BY d.record_date DESC, e.sort_order ASC, e.created_at ASC
                LIMIT ?
            `).all(like, like, like, like, like, like, limit);

            const results = rows.map((row) => ({
                id: row.id,
                dayId: row.day_id,
                recordDate: row.record_date,
                entryTime: row.entry_time || '',
                title: row.title || '',
                content: row.content || '',
                mood: row.mood || '',
                tags: parseJson(row.tags_json, []),
                sortOrder: row.sort_order,
                updatedAt: row.updated_at,
                imageCount: Number(row.image_count || 0)
            }));

            const matchedDates = [...new Set(results.map((item) => item.recordDate))];

            res.json({
                success: true,
                data: {
                    query,
                    total: results.length,
                    results,
                    matchedDates
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    app.use('/api/days', daysRouter);
    app.use('/api/images', imagesRouter);
    app.use('/api/settings', settingsRouter);
    app.use('/api/summaries', summariesRouter);
}

module.exports = { registerApiRoutes };
