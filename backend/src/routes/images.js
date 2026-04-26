const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDb, generateId, getNow } = require('../db');
const { UPLOADS_DIR } = require('../config');

const router = express.Router();

const MIME_TO_EXT = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif'
};

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function buildImageUrl(filePath) {
    return `/uploads/${String(filePath || '').replace(/\\/g, '/')}`;
}

function decodeDataUrl(dataUrl) {
    const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
        throw new Error('Invalid image data');
    }

    return {
        mimeType: match[1],
        buffer: Buffer.from(match[2], 'base64')
    };
}

router.post('/', (req, res) => {
    try {
        const db = getDb();
        const { entryId, fileName, dataUrl } = req.body || {};

        if (!entryId || !dataUrl) {
            return res.status(400).json({
                success: false,
                error: 'entryId and dataUrl are required'
            });
        }

        const entry = db.prepare('SELECT id FROM diary_entries WHERE id = ?').get(entryId);
        if (!entry) {
            return res.status(404).json({
                success: false,
                error: 'Entry not found'
            });
        }

        const { mimeType, buffer } = decodeDataUrl(dataUrl);
        const ext = path.extname(String(fileName || '')).toLowerCase() || MIME_TO_EXT[mimeType] || '.png';
        const imageId = generateId('img');
        const safeName = `${imageId}${ext}`;
        const entryDir = path.join(UPLOADS_DIR, entryId);
        const absolutePath = path.join(entryDir, safeName);
        const relativePath = path.join(entryId, safeName);

        ensureDir(entryDir);
        fs.writeFileSync(absolutePath, buffer);

        const now = getNow();
        db.prepare(`
            INSERT INTO entry_images (
                id, entry_id, file_path, file_name, mime_type, file_size, width, height, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            imageId,
            entryId,
            relativePath,
            fileName || safeName,
            mimeType,
            buffer.length,
            null,
            null,
            now
        );

        const image = db.prepare('SELECT * FROM entry_images WHERE id = ?').get(imageId);
        res.json({
            success: true,
            data: {
                ...image,
                url: buildImageUrl(image.file_path)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.delete('/:imageId', (req, res) => {
    try {
        const db = getDb();
        const image = db.prepare('SELECT * FROM entry_images WHERE id = ?').get(req.params.imageId);

        if (!image) {
            return res.status(404).json({
                success: false,
                error: 'Image not found'
            });
        }

        const absolutePath = path.join(UPLOADS_DIR, image.file_path);
        if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
        }

        db.prepare('DELETE FROM entry_images WHERE id = ?').run(req.params.imageId);

        res.json({
            success: true,
            data: {
                id: req.params.imageId
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

