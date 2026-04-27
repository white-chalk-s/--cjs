const API_BASE = '/api';

const api = {
    getHealth() {
        return fetch(`${API_BASE}/health`).then((res) => res.json());
    },
    getBootstrap() {
        return fetch(`${API_BASE}/bootstrap`).then((res) => res.json());
    },
    getSearchResults(params) {
        const search = new URLSearchParams();
        search.set('query', params.query || '');
        if (params.limit) {
            search.set('limit', String(params.limit));
        }
        return fetch(`${API_BASE}/search?${search.toString()}`).then((res) => res.json());
    },
    getDay(recordDate) {
        return fetch(`${API_BASE}/days/${recordDate}`).then((res) => res.json());
    },
    getMonthDays(monthKey) {
        return fetch(`${API_BASE}/days/month/${monthKey}`).then((res) => res.json());
    },
    saveDay(recordDate, data) {
        return fetch(`${API_BASE}/days/${recordDate}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then((res) => res.json());
    },
    uploadImage(data) {
        return fetch(`${API_BASE}/images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then((res) => res.json());
    },
    deleteImage(imageId) {
        return fetch(`${API_BASE}/images/${imageId}`, {
            method: 'DELETE'
        }).then((res) => res.json());
    },
    getSummary(params) {
        const search = new URLSearchParams();
        search.set('summaryType', params.summaryType);
        search.set('targetDate', params.targetDate);
        return fetch(`${API_BASE}/summaries?${search.toString()}`).then((res) => res.json());
    },
    getSummaryTask(params) {
        const search = new URLSearchParams();
        search.set('summaryType', params.summaryType);
        search.set('targetDate', params.targetDate);
        return fetch(`${API_BASE}/summaries/task?${search.toString()}`).then((res) => res.json());
    },
    ingestSummary(data) {
        return fetch(`${API_BASE}/summaries/ingest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then((res) => res.json());
    },
    getSettings() {
        return fetch(`${API_BASE}/settings`).then((res) => res.json());
    },
    updateSettings(data) {
        return fetch(`${API_BASE}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then((res) => res.json());
    },
    createBackup() {
        return fetch(`${API_BASE}/backup`, {
            method: 'POST'
        }).then((res) => res.json());
    }
};

window.api = api;
