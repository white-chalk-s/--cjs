const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const {
    DB_PATH,
    DATA_DIR,
    MIGRATIONS_DIR,
    BACKUPS_DIR,
    UPLOADS_DIR,
    EXTERNAL_BACKUP_DIR
} = require('./config');

let db = null;

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function getDb() {
    if (!db) {
        initDb();
    }

    return db;
}

function initDb() {
    ensureDir(DATA_DIR);
    ensureDir(BACKUPS_DIR);
    ensureDir(UPLOADS_DIR);
    ensureDir(EXTERNAL_BACKUP_DIR);

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    runMigrations();
}

function runMigrations() {
    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter((file) => file.endsWith('.sql'))
        .sort();

    let currentVersion = 0;

    try {
        const versionRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('db_version');
        currentVersion = versionRow ? Number(versionRow.value) : 0;
    } catch (error) {
        currentVersion = 0;
    }

    for (const file of files) {
        const match = file.match(/^V(\d+)__/);
        if (!match) {
            continue;
        }

        const targetVersion = Number(match[1]);
        if (targetVersion <= currentVersion) {
            continue;
        }

        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        const statements = sql
            .split(';')
            .map((statement) => statement.trim())
            .filter(Boolean);

        const transaction = db.transaction(() => {
            for (const statement of statements) {
                db.exec(statement);
            }
        });

        transaction();
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
            .run('db_version', String(targetVersion));
    }
}

function closeDb() {
    if (!db) {
        return;
    }

    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    db = null;
}

function backupDatabase() {
    if (!db) {
        return null;
    }

    ensureDir(BACKUPS_DIR);
    ensureDir(EXTERNAL_BACKUP_DIR);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const localFile = path.join(BACKUPS_DIR, `backup_${timestamp}.sqlite`);
    const externalFile = path.join(EXTERNAL_BACKUP_DIR, `backup_${timestamp}.sqlite`);

    db.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(DB_PATH, localFile);
    fs.copyFileSync(DB_PATH, externalFile);

    return { localFile, externalFile };
}

function generateId(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function getNow() {
    return new Date().toISOString();
}

module.exports = {
    getDb,
    initDb,
    closeDb,
    backupDatabase,
    generateId,
    getNow
};

