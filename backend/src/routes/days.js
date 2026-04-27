const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDb, generateId, getNow } = require('../db');
const { UPLOADS_DIR } = require('../config');

const router = express.Router();

function normalizeTags(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }

    if (typeof value === 'string') {
        return value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return [];
}

function buildImageUrl(filePath) {
    return `/uploads/${String(filePath || '').replace(/\\/g, '/')}`;
}

function deleteEntryImages(db, entryId) {
    const images = db.prepare('SELECT id, file_path FROM entry_images WHERE entry_id = ?').all(entryId);
    for (const image of images) {
        const absolutePath = path.join(UPLOADS_DIR, image.file_path);
        if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
        }
    }

    const entryDir = path.join(UPLOADS_DIR, entryId);
    if (fs.existsSync(entryDir)) {
        fs.rmSync(entryDir, { recursive: true, force: true });
    }
}

function mapEntry(row, imageMap) {
    return {
        id: row.id,
        day_id: row.day_id,
        entry_time: row.entry_time || '',
        title: row.title || '',
        content: row.content || '',
        mood: row.mood || '',
        tags: (() => {
            try {
                return JSON.parse(row.tags_json || '[]');
            } catch (error) {
                return [];
            }
        })(),
        images: imageMap.get(row.id) || [],
        sort_order: row.sort_order,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function getImageMap(db, entryIds) {
    const imageMap = new Map();

    if (!entryIds.length) {
        return imageMap;
    }

    const placeholders = entryIds.map(() => '?').join(', ');
    const rows = db.prepare(`
        SELECT *
        FROM entry_images
        WHERE entry_id IN (${placeholders})
        ORDER BY created_at ASC
    `).all(...entryIds);

    for (const row of rows) {
        const images = imageMap.get(row.entry_id) || [];
        images.push({
            ...row,
            url: buildImageUrl(row.file_path)
        });
        imageMap.set(row.entry_id, images);
    }

    return imageMap;
}

function getEntriesWithImages(db, dayId) {
    const rows = db.prepare(`
        SELECT *
        FROM diary_entries
        WHERE day_id = ?
        ORDER BY sort_order ASC, created_at ASC
    `).all(dayId);

    const imageMap = getImageMap(db, rows.map((row) => row.id));
    return rows.map((row) => mapEntry(row, imageMap));
}

function parseMonthKey(monthKey) {
    const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return null;
    }

    const next = new Date(year, month, 1);
    const nextYear = next.getFullYear();
    const nextMonth = String(next.getMonth() + 1).padStart(2, '0');

    return {
        start: `${match[1]}-${match[2]}-01`,
        end: `${nextYear}-${nextMonth}-01`
    };
}

router.get('/month/:monthKey', (req, res) => {
    try {
        const db = getDb();
        const range = parseMonthKey(req.params.monthKey);

        if (!range) {
            return res.status(400).json({
                success: false,
                error: 'Invalid month key'
            });
        }

        const rows = db.prepare(`
            SELECT
                d.id,
                d.record_date,
                d.updated_at,
                COUNT(e.id) AS entry_count
            FROM diary_days d
            LEFT JOIN diary_entries e ON e.day_id = d.id
            WHERE d.record_date >= ? AND d.record_date < ?
            GROUP BY d.id
            ORDER BY d.record_date ASC
        `).all(range.start, range.end);

        const days = rows.map((row) => ({
            id: row.id,
            record_date: row.record_date,
            day: Number(String(row.record_date).slice(8, 10)),
            entry_count: Number(row.entry_count) || 0,
            updated_at: row.updated_at
        }));

        const totalEntries = days.reduce((sum, day) => sum + day.entry_count, 0);

        res.json({
            success: true,
            data: {
                month: req.params.monthKey,
                range,
                recordedDayCount: days.length,
                totalEntries,
                days
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/:recordDate', (req, res) => {
    try {
        const db = getDb();
        const { recordDate } = req.params;

        const day = db.prepare('SELECT * FROM diary_days WHERE record_date = ?').get(recordDate);
        if (!day) {
            return res.json({
                success: true,
                data: {
                    day: null,
                    entries: []
                }
            });
        }

        const entries = getEntriesWithImages(db, day.id);

        res.json({
            success: true,
            data: {
                day,
                entries
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.put('/:recordDate', (req, res) => {
    try {
        const db = getDb();
        const { recordDate } = req.params;
        const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
        const now = getNow();

        const transaction = db.transaction(() => {
            let day = db.prepare('SELECT * FROM diary_days WHERE record_date = ?').get(recordDate);

            if (!day) {
                day = {
                    id: generateId('day'),
                    record_date: recordDate
                };

                db.prepare(`
                    INSERT INTO diary_days (id, record_date, created_at, updated_at)
                    VALUES (?, ?, ?, ?)
                `).run(day.id, recordDate, now, now);
            } else {
                db.prepare('UPDATE diary_days SET updated_at = ? WHERE id = ?').run(now, day.id);
            }

            const existingIds = db.prepare('SELECT id FROM diary_entries WHERE day_id = ?').all(day.id).map((row) => row.id);
            const existingIdSet = new Set(existingIds);
            const retainedIds = new Set();

            const insertEntry = db.prepare(`
                INSERT INTO diary_entries (
                    id, day_id, entry_time, title, content, mood, tags_json, sort_order, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const updateEntry = db.prepare(`
                UPDATE diary_entries
                SET entry_time = ?, title = ?, content = ?, mood = ?, tags_json = ?, sort_order = ?, updated_at = ?
                WHERE id = ? AND day_id = ?
            `);

            for (let index = 0; index < entries.length; index += 1) {
                const entry = entries[index] || {};
                const entryId = entry.id && existingIdSet.has(entry.id)
                    ? entry.id
                    : generateId('entry');
                const tags = normalizeTags(entry.tags);

                retainedIds.add(entryId);

                if (existingIdSet.has(entryId)) {
                    updateEntry.run(
                        entry.entry_time || '',
                        entry.title || '',
                        entry.content || '',
                        entry.mood || '',
                        JSON.stringify(tags),
                        index,
                        now,
                        entryId,
                        day.id
                    );
                } else {
                    insertEntry.run(
                        entryId,
                        day.id,
                        entry.entry_time || '',
                        entry.title || '',
                        entry.content || '',
                        entry.mood || '',
                        JSON.stringify(tags),
                        index,
                        now,
                        now
                    );
                }
            }

            const deleteEntry = db.prepare('DELETE FROM diary_entries WHERE id = ? AND day_id = ?');
            for (const existingId of existingIds) {
                if (!retainedIds.has(existingId)) {
                    deleteEntryImages(db, existingId);
                    deleteEntry.run(existingId, day.id);
                }
            }

            const remainingCount = db.prepare('SELECT COUNT(*) AS count FROM diary_entries WHERE day_id = ?').get(day.id).count;
            if (remainingCount === 0) {
                db.prepare('DELETE FROM diary_days WHERE id = ?').run(day.id);
            }
        });

        transaction();

        const savedDay = db.prepare('SELECT * FROM diary_days WHERE record_date = ?').get(recordDate);
        const savedEntries = savedDay ? getEntriesWithImages(db, savedDay.id) : [];

        res.json({
            success: true,
            data: {
                day: savedDay,
                entries: savedEntries
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
