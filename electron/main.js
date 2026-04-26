const { app, BrowserWindow } = require('electron');
const { createApp } = require('../backend/src/app');
const { initDb, closeDb } = require('../backend/src/db');
const { PORT } = require('../backend/src/config');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

let mainWindow = null;
let server = null;

function startServer() {
    initDb();

    const expressApp = createApp();
    return new Promise((resolve) => {
        server = expressApp.listen(PORT, () => {
            console.log(`[Electron] http://localhost:${PORT}`);
            resolve();
        });
    });
}

async function createWindow() {
    await startServer();

    mainWindow = new BrowserWindow({
        width: 1360,
        height: 900,
        minWidth: 1080,
        minHeight: 720,
        title: '日记记录平台',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    await mainWindow.loadURL(`http://localhost:${PORT}`);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (server) {
        server.close(() => {
            closeDb();
        });
    }

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

