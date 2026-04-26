const path = require('path');
const os = require('os');

const ROOT_DIR = path.join(__dirname, '..', '..');

module.exports = {
    PORT: Number(process.env.PORT) || 3011,
    ROOT_DIR,
    PUBLIC_DIR: path.join(ROOT_DIR, 'public'),
    DATA_DIR: path.join(ROOT_DIR, 'data'),
    DB_PATH: path.join(ROOT_DIR, 'data', 'database.sqlite'),
    MIGRATIONS_DIR: path.join(ROOT_DIR, 'migrations'),
    BACKUPS_DIR: path.join(ROOT_DIR, 'backups'),
    UPLOADS_DIR: path.join(ROOT_DIR, 'uploads'),
    EXTERNAL_BACKUP_DIR: path.join(os.homedir(), '日记记录平台_备份')
};
