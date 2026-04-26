const express = require('express');
const { getDb, getNow } = require('../db');

const router = express.Router();

const SETTING_KEYS = [
    'ai_provider',
    'ai_model',
    'ai_api_key',
    'daily_summary_template',
    'weekly_summary_template',
    'monthly_summary_template'
];

const DEFAULT_SETTINGS = {
    ai_provider: 'OpenAI',
    ai_model: 'gpt-4.1-mini',
    ai_api_key: '',
    daily_summary_template: '请基于当天事件节点输出结构化日总结，重点提取开心、成就、消耗、能量来源。',
    weekly_summary_template: '请基于本周日总结输出周总结，提取重点事件、整体状态、重复问题、积极变化。',
    monthly_summary_template: '请基于本月周总结或日总结输出月总结，提取月度主题、情绪趋势、重要事件、下阶段关注点。'
};

router.get('/', (req, res) => {
    try {
        const db = getDb();
        const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?, ?, ?)')
            .all(...SETTING_KEYS);

        const data = { ...DEFAULT_SETTINGS };
        for (const row of rows) {
            data[row.key] = row.value;
        }

        res.json({
            success: true,
            data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.put('/', (req, res) => {
    try {
        const db = getDb();
        const payload = req.body || {};
        const entries = Object.entries(payload).filter(([key]) => SETTING_KEYS.includes(key));

        if (entries.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid settings provided'
            });
        }

        const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
        const transaction = db.transaction(() => {
            for (const [key, value] of entries) {
                upsert.run(key, String(value ?? ''), getNow());
            }
        });

        transaction();

        res.json({
            success: true,
            data: {
                updated: entries.map(([key]) => key)
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

