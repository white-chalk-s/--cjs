const { getDb, backupDatabase } = require('../db');
const settingsRouter = require('./settings');
const daysRouter = require('./days');
const imagesRouter = require('./images');

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

            res.json({
                success: true,
                data: {
                    appName: '日记记录平台',
                    currentDate: new Date().toISOString().slice(0, 10),
                    stats,
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

    app.use('/api/days', daysRouter);
    app.use('/api/images', imagesRouter);
    app.use('/api/settings', settingsRouter);
}

module.exports = { registerApiRoutes };
