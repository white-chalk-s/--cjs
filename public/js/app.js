const state = {
    route: 'dashboard',
    health: null,
    bootstrap: null,
    settings: null,
    selectedDate: '',
    dayEntries: [],
    selectedEntryId: null,
    timelineEntries: []
};

const routes = [
    { id: 'dashboard', label: '首页' },
    { id: 'timeline', label: '时间轴' },
    { id: 'write', label: '写记录' },
    { id: 'summaries', label: 'AI总结' },
    { id: 'settings', label: '设置' }
];

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getCurrentRoute() {
    const hash = window.location.hash.replace(/^#/, '');
    return routes.some((item) => item.id === hash) ? hash : 'dashboard';
}

function setRoute(route) {
    window.location.hash = route;
}

function getToday() {
    return new Date().toISOString().slice(0, 10);
}

function createEmptyEntry() {
    return {
        id: '',
        entry_time: '',
        title: '',
        content: '',
        mood: '',
        tags: [],
        images: [],
        pendingImages: []
    };
}

function normalizeEntry(entry) {
    return {
        ...createEmptyEntry(),
        ...entry,
        tags: Array.isArray(entry?.tags) ? entry.tags : [],
        images: Array.isArray(entry?.images) ? entry.images : [],
        pendingImages: Array.isArray(entry?.pendingImages) ? entry.pendingImages : []
    };
}

function findSelectedEntry() {
    return state.dayEntries.find((entry) => entry.id === state.selectedEntryId) || state.dayEntries[0] || null;
}

function applyDayData(result) {
    const previousSelectedId = state.selectedEntryId;
    const entries = (result?.data?.entries || []).map(normalizeEntry);

    state.timelineEntries = [...entries];
    state.dayEntries = entries.length > 0 ? [...entries] : [createEmptyEntry()];

    const selectedStillExists = state.dayEntries.find((entry) => entry.id === previousSelectedId);
    state.selectedEntryId = selectedStillExists?.id || state.dayEntries[0]?.id || null;
}

function renderStatus() {
    const healthy = state.health?.success;
    const statusText = healthy ? '后端与数据库已连接' : '等待服务响应';

    return `
        <div class="status-badge">
            <span class="status-dot ${healthy ? 'ok' : ''}"></span>
            <span class="status-text">${statusText}</span>
        </div>
    `;
}

function renderTabs() {
    return routes.map((route) => `
        <button class="tab ${state.route === route.id ? 'active' : ''}" onclick="setRoute('${route.id}')">${route.label}</button>
    `).join('');
}

function renderDashboard() {
    const stats = state.bootstrap?.data?.stats || {};
    const milestones = state.bootstrap?.data?.milestones || [];

    return `
        <div class="page">
            <div class="page-header">
                <div>
                    <h2 class="page-title">MVP 工作台</h2>
                    <div class="page-subtitle">先把写记录、时间轴和图片主链路做稳定，再往首页结果化和 AI 总结推进。</div>
                </div>
                <div class="page-actions">
                    <button class="button-ghost" onclick="refreshApp()">刷新状态</button>
                </div>
            </div>

            <div class="hero">
                <section class="card hero-panel">
                    <div class="hero-title">日记记录平台</div>
                    <div class="hero-copy">当前工程已经可运行，并具备按日期保存节点、图片上传、图片回显和节点排序的基础能力。</div>
                    <ul class="hero-list">
                        ${milestones.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>
                </section>
                <section class="card">
                    <h3 class="section-title">当前基线</h3>
                    <ul class="card-list">
                        <li>架构：Node.js + Express + SQLite + Electron</li>
                        <li>导航：首页 / 时间轴 / 写记录 / AI总结 / 设置</li>
                        <li>能力：单日记录、图片上传、设置保存、本地备份</li>
                    </ul>
                </section>
            </div>

            <div class="metrics-grid">
                <section class="stat-card">
                    <div class="metric-value">${stats.dayCount || 0}</div>
                    <div class="metric-label">日记天数</div>
                </section>
                <section class="stat-card">
                    <div class="metric-value">${stats.entryCount || 0}</div>
                    <div class="metric-label">事件节点</div>
                </section>
                <section class="stat-card">
                    <div class="metric-value">${stats.summaryCount || 0}</div>
                    <div class="metric-label">AI 总结</div>
                </section>
                <section class="stat-card">
                    <div class="metric-value">${stats.imageCount || 0}</div>
                    <div class="metric-label">图片附件</div>
                </section>
            </div>

            <div class="two-column">
                <section class="card">
                    <h3 class="section-title">下一步开发顺序</h3>
                    <ol class="card-list">
                        <li>月历视图与有记录日期标记</li>
                        <li>时间轴筛选与搜索</li>
                        <li>首页一期结果化展示</li>
                        <li>AI 日总结与周/月总结</li>
                    </ol>
                </section>
                <section class="card">
                    <h3 class="section-title">当前已接入接口</h3>
                    <ul class="card-list">
                        <li><code>GET /api/health</code></li>
                        <li><code>GET /api/bootstrap</code></li>
                        <li><code>GET /api/days/:date</code></li>
                        <li><code>PUT /api/days/:date</code></li>
                        <li><code>POST /api/images</code></li>
                        <li><code>DELETE /api/images/:id</code></li>
                    </ul>
                </section>
            </div>
        </div>
    `;
}

function renderTimelineImages(images) {
    if (!images.length) {
        return '';
    }

    return `
        <div class="image-grid timeline-image-grid">
            ${images.map((image) => `
                <a class="image-thumb" href="${escapeHtml(image.url)}" target="_blank" rel="noreferrer">
                    <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.file_name || '图片')}">
                </a>
            `).join('')}
        </div>
    `;
}

function renderTimeline() {
    const entries = state.timelineEntries || [];

    return `
        <div class="page">
            <div class="page-header">
                <div>
                    <h2 class="page-title">时间轴</h2>
                    <div class="page-subtitle">按日期查看当天的节点、标签、心情和图片缩略图。</div>
                </div>
                <div class="page-actions">
                    <input type="date" value="${escapeHtml(state.selectedDate)}" onchange="changeSelectedDate(this.value, true)">
                </div>
            </div>
            <div class="two-column">
                <section class="panel">
                    <h3 class="section-title">查看说明</h3>
                    <ul class="card-list">
                        <li>当前先支持单日时间轴回看</li>
                        <li>下一步补月历视图与有记录日期标记</li>
                        <li>后续补关键词、标签和情绪筛选</li>
                    </ul>
                </section>
                <section class="panel">
                    <h3 class="section-title">单日时间轴</h3>
                    <div class="timeline-list">
                        ${entries.length === 0 ? `
                            <div class="empty-state">
                                <div class="section-title">当天还没有记录</div>
                                <div class="empty-copy">切到“写记录”页新增节点后，这里会展示时间、正文和图片回显。</div>
                            </div>
                        ` : entries.map((entry) => `
                            <article class="timeline-item">
                                <div class="timeline-item-time">${escapeHtml(entry.entry_time || '--:--')}</div>
                                <div class="timeline-item-title">${escapeHtml(entry.title || '未命名节点')}</div>
                                <div class="timeline-item-copy">${escapeHtml(entry.content || '暂无正文')}</div>
                                <div class="field-help">心情：${escapeHtml(entry.mood || '未设置')} · 标签：${escapeHtml((entry.tags || []).join('、') || '无')}</div>
                                ${renderTimelineImages(entry.images || [])}
                            </article>
                        `).join('')}
                    </div>
                </section>
            </div>
            <div class="footer-note">这页已经使用真实单日数据。下一步重点是月历导航和有记录日期聚合。</div>
        </div>
    `;
}

function renderEntryImageCards(currentEntry) {
    const savedImages = (currentEntry.images || []).map((image) => ({ ...image, kind: 'saved' }));
    const pendingImages = (currentEntry.pendingImages || []).map((image) => ({ ...image, kind: 'pending' }));
    const allImages = [...savedImages, ...pendingImages];

    if (allImages.length === 0) {
        return '<div class="field-help">当前节点还没有图片。</div>';
    }

    return `
        <div class="image-grid">
            ${allImages.map((image) => `
                <div class="image-card">
                    ${image.kind === 'saved' ? `
                        <a class="image-thumb" href="${escapeHtml(image.url)}" target="_blank" rel="noreferrer">
                            <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.file_name || '图片')}">
                        </a>
                    ` : `
                        <div class="image-thumb">
                            <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.file_name || '图片预览')}">
                        </div>
                    `}
                    <div class="image-card-footer">
                        <span class="image-name">
                            ${escapeHtml(image.file_name || '图片')}
                            ${image.kind === 'pending' ? ` · ${escapeHtml(image.status || '待上传')}` : ''}
                        </span>
                        ${image.kind === 'saved'
                            ? `<button class="mini-button danger" onclick="deleteImageFromEntry('${image.id}')">删除</button>`
                            : `<span class="pending-badge">${escapeHtml(image.status || '待上传')}</span>`}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderWrite() {
    const currentEntry = normalizeEntry(findSelectedEntry() || createEmptyEntry());
    const currentIndex = state.dayEntries.findIndex((entry) => entry.id === currentEntry.id);

    return `
        <div class="page">
            <div class="page-header">
                <div>
                    <h2 class="page-title">写记录</h2>
                    <div class="page-subtitle">支持新增节点、排序、批量上传图片、本地预览和上传后回显。</div>
                </div>
                <div class="page-actions">
                    <input type="date" value="${escapeHtml(state.selectedDate)}" onchange="changeSelectedDate(this.value, false)">
                    <button class="button-ghost" onclick="addEntry()">新增节点</button>
                    <button class="button" onclick="saveDayEntries()">保存全部</button>
                </div>
            </div>
            <div class="composer">
                <section class="panel">
                    <h3 class="section-title">事件节点列表</h3>
                    <div class="entry-list">
                        ${state.dayEntries.map((entry, index) => `
                            <article class="entry-chip ${currentEntry.id === entry.id ? 'active' : ''}" onclick="selectEntry('${entry.id}')">
                                <div class="entry-chip-header">
                                    <div class="entry-chip-title">${escapeHtml(entry.entry_time || '--:--')} ${escapeHtml(entry.title || `节点 ${index + 1}`)}</div>
                                    <div class="entry-chip-actions">
                                        <button class="mini-button" onclick="event.stopPropagation(); moveEntry('${entry.id}', -1)" ${index === 0 ? 'disabled' : ''}>上移</button>
                                        <button class="mini-button" onclick="event.stopPropagation(); moveEntry('${entry.id}', 1)" ${index === state.dayEntries.length - 1 ? 'disabled' : ''}>下移</button>
                                    </div>
                                </div>
                                <div class="empty-copy">${escapeHtml(entry.content || '点击后编辑当前节点内容')}</div>
                            </article>
                        `).join('')}
                    </div>
                </section>
                <section class="panel">
                    <h3 class="section-title">当前节点编辑区</h3>
                    <div class="form-grid">
                        <div class="field-row">
                            <label class="field">
                                <span class="field-label">日期</span>
                                <input type="date" value="${escapeHtml(state.selectedDate)}" onchange="changeSelectedDate(this.value, false)">
                            </label>
                            <label class="field">
                                <span class="field-label">时间</span>
                                <input type="time" value="${escapeHtml(currentEntry.entry_time || '')}" oninput="updateSelectedEntryField('entry_time', this.value)">
                            </label>
                        </div>
                        <label class="field">
                            <span class="field-label">标题</span>
                            <input type="text" value="${escapeHtml(currentEntry.title || '')}" oninput="updateSelectedEntryField('title', this.value)">
                        </label>
                        <label class="field">
                            <span class="field-label">正文</span>
                            <textarea oninput="updateSelectedEntryField('content', this.value)">${escapeHtml(currentEntry.content || '')}</textarea>
                        </label>
                        <div class="field-row">
                            <label class="field">
                                <span class="field-label">心情</span>
                                <select oninput="updateSelectedEntryField('mood', this.value)">
                                    <option value="" ${currentEntry.mood ? '' : 'selected'}>未设置</option>
                                    <option value="平静" ${currentEntry.mood === '平静' ? 'selected' : ''}>平静</option>
                                    <option value="开心" ${currentEntry.mood === '开心' ? 'selected' : ''}>开心</option>
                                    <option value="疲惫" ${currentEntry.mood === '疲惫' ? 'selected' : ''}>疲惫</option>
                                    <option value="专注" ${currentEntry.mood === '专注' ? 'selected' : ''}>专注</option>
                                </select>
                            </label>
                            <label class="field">
                                <span class="field-label">标签</span>
                                <input type="text" value="${escapeHtml((currentEntry.tags || []).join(', '))}" oninput="updateSelectedEntryField('tags', this.value)">
                            </label>
                        </div>
                        <div class="field">
                            <span class="field-label">图片附件</span>
                            <div class="field-help">支持选择多张图片。选中后会先在本地预览，再自动上传并回显到当前节点和时间轴。</div>
                            <div class="upload-row">
                                <input id="entryImageInput" type="file" accept="image/*" multiple onchange="handleImageInput(this)">
                            </div>
                            ${renderEntryImageCards(currentEntry)}
                        </div>
                        <div class="page-actions">
                            <button class="button-ghost" onclick="moveEntry('${currentEntry.id}', -1)" ${currentIndex <= 0 ? 'disabled' : ''}>当前节点上移</button>
                            <button class="button-ghost" onclick="moveEntry('${currentEntry.id}', 1)" ${currentIndex < 0 || currentIndex >= state.dayEntries.length - 1 ? 'disabled' : ''}>当前节点下移</button>
                            <button class="button-ghost" onclick="removeSelectedEntry()">删除当前节点</button>
                        </div>
                    </div>
                </section>
            </div>
            <div class="footer-note" id="writeSaveNote"></div>
        </div>
    `;
}

function renderSummaries() {
    return `
        <div class="page">
            <div class="page-header">
                <div>
                    <h2 class="page-title">AI 总结</h2>
                    <div class="page-subtitle">这一页先承载日 / 周 / 月总结的结构，等记录和时间轴稳定后再接生成逻辑。</div>
                </div>
                <div class="page-actions">
                    <button class="button-secondary">重新生成</button>
                </div>
            </div>
            <div class="summary-grid">
                <section class="summary-card">
                    <div class="summary-card-title">日总结</div>
                    <div class="summary-card-copy">提取当天的开心、成就、消耗、能量来源和一句话总结。</div>
                </section>
                <section class="summary-card">
                    <div class="summary-card-title">周总结</div>
                    <div class="summary-card-copy">聚合多个日总结，提取重点事件、整体状态和反复问题。</div>
                </section>
                <section class="summary-card">
                    <div class="summary-card-title">月总结</div>
                    <div class="summary-card-copy">输出月度主题、情绪趋势、关键事件和下阶段关注点。</div>
                </section>
            </div>
            <div class="summary-list" style="margin-top: 18px;">
                <section class="panel">
                    <h3 class="section-title">模板要求</h3>
                    <div class="template-text">第一版必须固定结构，不直接展示原始日记，而是消费结构化提炼结果。</div>
                </section>
            </div>
        </div>
    `;
}

function renderSettings() {
    const settings = state.settings?.data || {};

    return `
        <div class="page">
            <div class="page-header">
                <div>
                    <h2 class="page-title">设置</h2>
                    <div class="page-subtitle">AI 服务商、模型和提炼模板都保存在本地数据库。</div>
                </div>
                <div class="page-actions">
                    <button class="button-ghost" onclick="handleBackup()">导出备份</button>
                    <button class="button" onclick="saveSettings()">保存设置</button>
                </div>
            </div>
            <div class="settings-grid">
                <section class="panel">
                    <h3 class="section-title">AI 配置</h3>
                    <div class="form-grid">
                        <label class="field">
                            <span class="field-label">服务商</span>
                            <input id="ai_provider" type="text" value="${escapeHtml(settings.ai_provider || '')}">
                        </label>
                        <label class="field">
                            <span class="field-label">模型名</span>
                            <input id="ai_model" type="text" value="${escapeHtml(settings.ai_model || '')}">
                        </label>
                        <label class="field">
                            <span class="field-label">API Key</span>
                            <input id="ai_api_key" type="password" value="${escapeHtml(settings.ai_api_key || '')}">
                        </label>
                    </div>
                </section>
                <section class="panel">
                    <h3 class="section-title">模板配置</h3>
                    <div class="form-grid">
                        <label class="field">
                            <span class="field-label">日总结模板</span>
                            <textarea id="daily_summary_template">${escapeHtml(settings.daily_summary_template || '')}</textarea>
                        </label>
                        <label class="field">
                            <span class="field-label">周总结模板</span>
                            <textarea id="weekly_summary_template">${escapeHtml(settings.weekly_summary_template || '')}</textarea>
                        </label>
                        <label class="field">
                            <span class="field-label">月总结模板</span>
                            <textarea id="monthly_summary_template">${escapeHtml(settings.monthly_summary_template || '')}</textarea>
                        </label>
                    </div>
                </section>
            </div>
            <div class="save-note" id="saveNote" style="margin-top:16px;"></div>
        </div>
    `;
}

function renderPage() {
    switch (state.route) {
    case 'timeline':
        return renderTimeline();
    case 'write':
        return renderWrite();
    case 'summaries':
        return renderSummaries();
    case 'settings':
        return renderSettings();
    case 'dashboard':
    default:
        return renderDashboard();
    }
}

function renderApp() {
    const app = document.getElementById('app');
    if (!app) {
        return;
    }

    app.innerHTML = `
        <div class="shell">
            <header class="topbar">
                <div>
                    <h1 class="brand-title">日记记录平台</h1>
                    <div class="brand-subtitle">本地优先 · Electron + SQLite · 先做稳定主链路</div>
                </div>
                ${renderStatus()}
            </header>
            <nav class="tabs">
                ${renderTabs()}
            </nav>
            ${renderPage()}
        </div>
    `;
}

async function refreshApp() {
    try {
        const [health, bootstrap, settings] = await Promise.all([
            api.getHealth(),
            api.getBootstrap(),
            api.getSettings()
        ]);

        state.health = health;
        state.bootstrap = bootstrap;
        state.settings = settings;
    } catch (error) {
        state.health = {
            success: false,
            error: error.message
        };
    }

    renderApp();
}

async function loadDayData(recordDate, options = {}) {
    const targetDate = recordDate || state.selectedDate || getToday();
    state.selectedDate = targetDate;

    try {
        const result = await api.getDay(targetDate);
        applyDayData(result);

        if (!options.silent) {
            renderApp();
        }
    } catch (error) {
        state.dayEntries = [createEmptyEntry()];
        state.timelineEntries = [];
        state.selectedEntryId = null;
        renderApp();
    }
}

async function changeSelectedDate(value, timelineOnly) {
    state.selectedDate = value || getToday();
    await loadDayData(state.selectedDate, { silent: false });

    if (timelineOnly && state.route !== 'timeline') {
        setRoute('timeline');
    }
}

function selectEntry(entryId) {
    state.selectedEntryId = entryId;
    renderApp();
}

function addEntry() {
    const newEntry = normalizeEntry({
        ...createEmptyEntry(),
        id: `draft_${Date.now()}`
    });

    state.dayEntries = [...state.dayEntries, newEntry];
    state.selectedEntryId = newEntry.id;
    renderApp();
}

function moveEntry(entryId, direction) {
    const currentIndex = state.dayEntries.findIndex((entry) => entry.id === entryId);
    const nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= state.dayEntries.length) {
        return;
    }

    const nextEntries = [...state.dayEntries];
    const [entry] = nextEntries.splice(currentIndex, 1);
    nextEntries.splice(nextIndex, 0, entry);
    state.dayEntries = nextEntries;
    state.selectedEntryId = entry.id;
    renderApp();
}

function removeSelectedEntry() {
    const current = findSelectedEntry();
    if (!current) {
        return;
    }

    state.dayEntries = state.dayEntries.filter((entry) => entry.id !== current.id);
    if (state.dayEntries.length === 0) {
        state.dayEntries = [createEmptyEntry()];
    }

    state.selectedEntryId = state.dayEntries[0]?.id || null;
    renderApp();
}

function updateSelectedEntryField(field, value) {
    const current = findSelectedEntry();
    if (!current) {
        return;
    }

    current[field] = field === 'tags'
        ? String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
        : value;
}

function isMeaningfulEntry(entry) {
    return Boolean(
        entry.title ||
        entry.content ||
        entry.entry_time ||
        entry.mood ||
        (Array.isArray(entry.tags) && entry.tags.length > 0) ||
        (Array.isArray(entry.images) && entry.images.length > 0) ||
        (Array.isArray(entry.pendingImages) && entry.pendingImages.length > 0)
    );
}

async function saveDayEntries(options = {}) {
    const note = document.getElementById('writeSaveNote');
    if (note) {
        note.textContent = '保存中...';
    }

    const selectedIndex = state.dayEntries.findIndex((entry) => entry.id === state.selectedEntryId);
    const payload = {
        entries: state.dayEntries
            .filter(isMeaningfulEntry)
            .map((entry) => ({
                id: String(entry.id || '').startsWith('draft_') ? '' : entry.id,
                title: entry.title || '',
                content: entry.content || '',
                entry_time: entry.entry_time || '',
                mood: entry.mood || '',
                tags: Array.isArray(entry.tags) ? entry.tags : []
            }))
    };

    try {
        const result = await api.saveDay(state.selectedDate, payload);
        if (!result.success) {
            throw new Error(result.error || '保存失败');
        }

        applyDayData(result);
        if (selectedIndex >= 0 && state.dayEntries[selectedIndex]) {
            state.selectedEntryId = state.dayEntries[selectedIndex].id;
        }

        await refreshApp();
        const freshNote = document.getElementById('writeSaveNote');
        if (freshNote) {
            freshNote.textContent = `已保存 ${state.selectedDate} 的 ${payload.entries.length} 个节点。`;
        }

        if (!options.skipRender) {
            renderApp();
        }

        return result;
    } catch (error) {
        if (note) {
            note.textContent = `保存失败：${error.message}`;
        }
        throw error;
    }
}

async function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('File read failed'));
        reader.readAsDataURL(file);
    });
}

async function createPendingImagePreviews(files) {
    const previews = [];

    for (const file of files) {
        previews.push({
            previewId: `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            file_name: file.name,
            url: await readFileAsDataUrl(file),
            status: '待上传'
        });
    }

    return previews;
}

function updatePendingImageStatus(entryId, previewId, status) {
    const entry = state.dayEntries.find((item) => item.id === entryId);
    if (!entry || !Array.isArray(entry.pendingImages)) {
        return;
    }

    entry.pendingImages = entry.pendingImages.map((image) => (
        image.previewId === previewId
            ? { ...image, status }
            : image
    ));
}

async function handleImageInput(inputOrFiles) {
    const input = inputOrFiles?.files ? inputOrFiles : null;
    const files = Array.from(input?.files || inputOrFiles || []);
    if (files.length === 0) {
        return;
    }

    const current = findSelectedEntry();
    const note = document.getElementById('writeSaveNote');

    if (!current) {
        return;
    }

    try {
        const previewItems = await createPendingImagePreviews(files);
        current.pendingImages = [...(current.pendingImages || []), ...previewItems];
        renderApp();

        if (!current.id || String(current.id).startsWith('draft_')) {
            await saveDayEntries({ skipRender: false });
        }

        const savedCurrent = findSelectedEntry();
        if (!savedCurrent?.id) {
            throw new Error('当前节点未成功保存');
        }

        savedCurrent.pendingImages = [...previewItems];
        renderApp();

        if (note) {
            note.textContent = `正在上传 ${files.length} 张图片...`;
        }

        for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            const pending = previewItems[index];
            updatePendingImageStatus(savedCurrent.id, pending.previewId, '上传中');
            renderApp();

            const result = await api.uploadImage({
                entryId: savedCurrent.id,
                fileName: file.name,
                dataUrl: pending.url
            });

            if (!result.success) {
                throw new Error(result.error || '图片上传失败');
            }

            updatePendingImageStatus(savedCurrent.id, pending.previewId, '已上传');
            renderApp();
        }

        await loadDayData(state.selectedDate, { silent: true });
        renderApp();
        const freshNote = document.getElementById('writeSaveNote');
        if (freshNote) {
            freshNote.textContent = `已上传 ${files.length} 张图片。`;
        }
        if (input) {
            input.value = '';
        }
    } catch (error) {
        const selected = findSelectedEntry();
        if (selected) {
            selected.pendingImages = [];
        }
        renderApp();
        if (note) {
            note.textContent = `图片上传失败：${error.message}`;
        }
    }
}

async function deleteImageFromEntry(imageId) {
    const note = document.getElementById('writeSaveNote');
    if (note) {
        note.textContent = '正在删除图片...';
    }

    try {
        const result = await api.deleteImage(imageId);
        if (!result.success) {
            throw new Error(result.error || '删除失败');
        }

        await loadDayData(state.selectedDate, { silent: true });
        renderApp();
        const freshNote = document.getElementById('writeSaveNote');
        if (freshNote) {
            freshNote.textContent = '图片已删除。';
        }
    } catch (error) {
        if (note) {
            note.textContent = `删除图片失败：${error.message}`;
        }
    }
}

async function saveSettings() {
    const payload = {
        ai_provider: document.getElementById('ai_provider')?.value || '',
        ai_model: document.getElementById('ai_model')?.value || '',
        ai_api_key: document.getElementById('ai_api_key')?.value || '',
        daily_summary_template: document.getElementById('daily_summary_template')?.value || '',
        weekly_summary_template: document.getElementById('weekly_summary_template')?.value || '',
        monthly_summary_template: document.getElementById('monthly_summary_template')?.value || ''
    };

    const note = document.getElementById('saveNote');
    if (note) {
        note.textContent = '保存中...';
    }

    try {
        const result = await api.updateSettings(payload);
        await refreshApp();
        const freshNote = document.getElementById('saveNote');
        if (freshNote) {
            freshNote.textContent = result.success ? '设置已保存到本地数据库。' : `保存失败：${result.error}`;
        }
    } catch (error) {
        if (note) {
            note.textContent = `保存失败：${error.message}`;
        }
    }
}

async function handleBackup() {
    const note = document.getElementById('saveNote');
    if (note) {
        note.textContent = '正在创建备份...';
    }

    try {
        const result = await api.createBackup();
        if (note) {
            note.textContent = result.success
                ? `备份已生成：${result.data.localFile}`
                : `备份失败：${result.error}`;
        }
    } catch (error) {
        if (note) {
            note.textContent = `备份失败：${error.message}`;
        }
    }
}

window.setRoute = setRoute;
window.refreshApp = refreshApp;
window.saveSettings = saveSettings;
window.handleBackup = handleBackup;
window.changeSelectedDate = changeSelectedDate;
window.selectEntry = selectEntry;
window.addEntry = addEntry;
window.moveEntry = moveEntry;
window.removeSelectedEntry = removeSelectedEntry;
window.updateSelectedEntryField = updateSelectedEntryField;
window.saveDayEntries = saveDayEntries;
window.handleImageInput = handleImageInput;
window.deleteImageFromEntry = deleteImageFromEntry;

window.addEventListener('hashchange', () => {
    state.route = getCurrentRoute();
    renderApp();
});

state.route = getCurrentRoute();
state.selectedDate = getToday();
refreshApp();
loadDayData(state.selectedDate, { silent: true });
