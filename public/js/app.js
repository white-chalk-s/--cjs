const state = {
    route: 'dashboard',
    health: null,
    bootstrap: null,
    settings: null,
    selectedDate: '',
    selectedMonth: '',
    dayEntries: [],
    selectedEntryId: null,
    timelineEntries: [],
    monthOverview: null,
    summaryType: 'daily',
    summaryAnchorDate: '',
    summaryMonthKey: '',
    summaryData: null,
    summaryLoading: false,
    summaryError: '',
    summarySourceStats: null,
    summaryPeriod: null,
    summaryTask: null,
    homepageMomentIndex: 0
};

state.timelineQuery = '';
state.timelineFilter = 'all';
state.globalSearchQuery = '';
state.globalSearchResults = [];
state.globalSearchMatchedDates = [];
state.globalSearchLoading = false;
state.globalSearchError = '';
state.activeDrawer = '';

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

function openDrawer(drawerId) {
    state.activeDrawer = String(drawerId || '');
    renderApp();
}

function closeDrawer() {
    if (!state.activeDrawer) {
        return;
    }

    state.activeDrawer = '';
    renderApp();
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

function getMonthKey(dateValue) {
    return String(dateValue || getToday()).slice(0, 7);
}

function getMonthLabel(monthKey) {
    const [year, month] = String(monthKey || '').split('-');
    if (!year || !month) {
        return String(monthKey || '');
    }

    return `${year}年${Number(month)}月`;
}

function getDaysInMonth(monthKey) {
    const [year, month] = String(monthKey || '').split('-').map((item) => Number(item));
    if (!year || !month) {
        return 0;
    }

    return new Date(year, month, 0).getDate();
}

function buildCalendarCells(monthKey, dayMap) {
    const [year, month] = String(monthKey || '').split('-').map((item) => Number(item));
    if (!year || !month) {
        return [];
    }

    const firstDay = new Date(year, month - 1, 1);
    const daysInMonth = getDaysInMonth(monthKey);
    const leadingEmptyCells = (firstDay.getDay() + 6) % 7;
    const cells = [];

    for (let index = 0; index < leadingEmptyCells; index += 1) {
        cells.push(null);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        const dayValue = String(day).padStart(2, '0');
        const recordDate = `${monthKey}-${dayValue}`;
        cells.push({
            recordDate,
            day,
            entryCount: Number(dayMap.get(recordDate)?.entry_count || 0)
        });
    }

    while (cells.length % 7 !== 0) {
        cells.push(null);
    }

    return cells;
}

function getSummaryTypeLabel(summaryType) {
    switch (summaryType) {
    case 'weekly':
        return '周总结';
    case 'monthly':
        return '月总结';
    case 'daily':
    default:
        return '日总结';
    }
}

function formatDateTimeLabel(value) {
    const text = String(value || '').trim();
    if (!text) {
        return '';
    }

    return text.replace('T', ' ').slice(0, 16);
}

async function openTodayWrite() {
    await changeSelectedDate(getToday(), false);
    setRoute('write');
}

async function openTodayTimeline() {
    await changeSelectedDate(getToday(), true);
}

function openTodaySummary() {
    state.summaryType = 'daily';
    state.summaryAnchorDate = getToday();
    state.summaryMonthKey = getMonthKey(getToday());
    setRoute('summaries');
}

function rotateHomepageMoment() {
    const dashboard = state.bootstrap?.data || {};
    const insights = buildHomepageInsights(dashboard);
    const total = insights.moments.length || 1;
    state.homepageMomentIndex = (state.homepageMomentIndex + 1) % total;
    renderApp();
}

async function copyHomepageAdvice() {
    const dashboard = state.bootstrap?.data || {};
    const insights = buildHomepageInsights(dashboard);
    const text = insights.actionItems
        .map((item) => `${item.step}. ${item.title} - ${item.note}`)
        .join('\n');

    try {
        await navigator.clipboard.writeText(text);
    } catch (error) {
        console.warn('copy failed', error);
    }
}

function getWeekdayLabel(dateValue) {
    const date = new Date(`${dateValue || getToday()}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
}

function truncateText(text, maxLength = 64) {
    const value = String(text || '').trim();
    if (!value) {
        return '';
    }

    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, maxLength - 1)}…`;
}

function parseTags(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }

    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
    } catch (error) {
        return [];
    }
}

function countValues(items, getter) {
    const counts = new Map();
    for (const item of items) {
        const value = String(getter(item) || '').trim();
        if (!value) {
            continue;
        }

        counts.set(value, (counts.get(value) || 0) + 1);
    }

    return [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function buildHomepageInsights(dashboard) {
    const recentDays = Array.isArray(dashboard?.recentDays) ? dashboard.recentDays : [];
    const recentEntries = Array.isArray(dashboard?.recentEntries) ? dashboard.recentEntries : [];
    const recentSummaries = Array.isArray(dashboard?.recentSummaries) ? dashboard.recentSummaries : [];
    const allTags = recentEntries.flatMap((entry) => parseTags(entry.tags));
    const moodCounts = countValues(recentEntries, (entry) => entry.mood);
    const tagCounts = countValues(allTags.map((tag) => ({ tag })), (item) => item.tag);

    const latestSummary = recentSummaries[0] || null;
    const latestEntry = recentEntries[0] || null;
    const latestDay = recentDays[0] || null;

    const happyMoment = latestSummary?.oneLine
        || latestSummary?.overview
        || latestEntry?.content
        || latestEntry?.title
        || '今天还没有足够的记录来提炼回看内容。';

    const repeatAdvice = tagCounts[0]?.value
        ? `可以继续放大 ${tagCounts[0].value} 这类场景。`
        : '可以继续保留晚一点复盘、短一点记录的方式。';

    const avoidAdvice = moodCounts.find((item) => /疲|压|烦|累|低|乱/.test(item.value))?.value
        ? `最近和 ${moodCounts.find((item) => /疲|压|烦|累|低|乱/.test(item.value)).value} 相关的状态更容易带来消耗。`
        : '下午连续切换任务仍然值得优先减少。';

    const supplementAdvice = latestEntry?.content
        ? `把 ${truncateText(latestEntry.content, 18)} 这样的具体细节补完整。`
        : '补一条具体瞬间：时间、心情、地点、发生了什么。';

    const evidenceOne = latestEntry
        ? `${latestEntry.recordDate} ${latestEntry.title || '未命名节点'}`
        : '先写下一条具体完成事项。';

    const evidenceTwo = latestSummary?.keyPoints?.[0] || latestSummary?.overview || '先生成一条总结，沉淀可重复的做法。';

    const evidenceThree = latestEntry?.mood
        ? `当前情绪主词：${latestEntry.mood}`
        : '先积累几条记录，情绪趋势才会更清楚。';

    const moments = [
        latestSummary?.oneLine,
        latestSummary?.overview,
        latestEntry?.content,
        latestEntry?.title,
        latestDay?.recordDate ? `${latestDay.recordDate} 这一天还可以继续补充细节。` : '',
        '今天还没有足够的记录来提炼回看内容。'
    ].map((item) => String(item || '').trim()).filter(Boolean);

    const primaryTags = tagCounts.slice(0, 3).map((item) => item.value);

    const growthTitle = latestSummary?.oneLine
        || latestSummary?.overview
        || '用短记录和定期总结，把零散事实变成可复用的模式。';

    const growthDescription = latestSummary?.moodTrend
        || latestSummary?.mood_trend
        || `当前记录还在累积中，先把 ${recentEntries.length || 0} 条事件节点保存稳定。`;

    const energyTop = tagCounts.slice(0, 3).map((item, index) => ({
        rank: index + 1,
        value: item.value,
        note: item.count > 1 ? `出现 ${item.count} 次` : '最近出现'
    }));

    const sourceTop = recentEntries.slice(0, 3).map((entry, index) => ({
        rank: index + 1,
        value: entry.title || entry.recordDate,
        note: entry.mood || '未填写情绪'
    }));

    const calendarDays = recentDays.slice(0, 7).reverse().map((day) => ({
        label: day.recordDate === getToday() ? '今天' : day.recordDate.slice(5),
        entryCount: day.entryCount || 0,
        mood: day.entryCount > 0 ? (moodCounts[0]?.value || '平稳') : '空白',
        tone: day.entryCount > 2 ? 'good' : day.entryCount > 0 ? 'calm' : 'low'
    }));

    while (calendarDays.length < 7) {
        calendarDays.unshift({
            label: `D${calendarDays.length + 1}`,
            entryCount: 0,
            mood: '暂无',
            tone: 'low'
        });
    }

    const actionItems = [
        {
            step: 1,
            title: '安排 20 分钟记录窗口。',
            note: '先写时间、心情、标题和两句话正文。',
            type: '记录'
        },
        {
            step: 2,
            title: '合并同类小任务。',
            note: '减少频繁切换带来的消耗。',
            type: '专注'
        },
        {
            step: 3,
            title: '补一条被照顾的瞬间。',
            note: '把开心回看的素材补完整。',
            type: '回看'
        },
        {
            step: 4,
            title: '保留 10 分钟复盘。',
            note: '只写事件，不写长篇。',
            type: '总结'
        }
    ];

    return {
        latestSummary,
        latestEntry,
        latestDay,
        moments,
        happyMoment,
        primaryTags,
        repeatAdvice,
        avoidAdvice,
        supplementAdvice,
        evidenceOne,
        evidenceTwo,
        evidenceThree,
        growthTitle,
        growthDescription,
        energyTop,
        sourceTop,
        tagCounts,
        calendarDays,
        actionItems
    };
}

function getSummaryTargetDate() {
    if (state.summaryType === 'monthly') {
        return `${state.summaryMonthKey || getMonthKey(state.summaryAnchorDate || state.selectedDate)}-01`;
    }

    return state.summaryAnchorDate || state.selectedDate || getToday();
}

function syncSummaryDraftState() {
    const baseDate = state.selectedDate || getToday();
    state.summaryAnchorDate = state.summaryAnchorDate || baseDate;
    state.summaryMonthKey = state.summaryMonthKey || getMonthKey(baseDate);
}

function mapSummaryPayload(result) {
    const data = result?.data || {};
    const summary = data.summary || null;

    return {
        period: data.period || null,
        summary,
        task: data.task || null,
        sourceStats: data.sourceStats || data.source_stats || summary?.content_json?.source_stats || data.task?.sourceStats || null,
        settings: data.settings || null
    };
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

function applyMonthData(result) {
    state.monthOverview = result || null;
}

function applySummaryData(result) {
    const payload = mapSummaryPayload(result);
    state.summaryData = payload.summary;
    state.summaryTask = payload.task;
    state.summarySourceStats = payload.sourceStats;
    state.summaryPeriod = payload.period;
    state.summaryError = '';
    state.summaryLoading = false;
    return payload;
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

function renderStatus() {
    const healthy = state.health?.success;

    return `
        <div class="status-badge" aria-label="${healthy ? '服务与数据库在线' : '服务或数据库未连接'}">
            <span class="status-mini ${healthy ? 'ok' : ''}" title="${healthy ? '服务在线' : '服务未连接'}"></span>
            <span class="status-mini database ${healthy ? 'ok' : ''}" title="${healthy ? '数据库在线' : '数据库未连接'}"></span>
        </div>
    `;
}

function renderDashboard() {
    const dashboard = state.bootstrap?.data || {};
    const stats = dashboard.stats || {};
    const currentDate = dashboard.currentDate || getToday();
    const currentWeekday = getWeekdayLabel(currentDate);
    const dateChip = `${currentDate} ${currentWeekday}`.trim();
    const milestones = Array.isArray(dashboard.milestones) ? dashboard.milestones : [];
    const recentDays = Array.isArray(dashboard.recentDays) ? dashboard.recentDays : [];
    const recentEntries = Array.isArray(dashboard.recentEntries) ? dashboard.recentEntries : [];
    const recentSummaries = Array.isArray(dashboard.recentSummaries) ? dashboard.recentSummaries : [];
    const insights = buildHomepageInsights(dashboard);
    const latestSummary = insights.latestSummary;
    const latestEntry = insights.latestEntry;
    const latestDay = insights.latestDay;
    const moment = insights.moments[state.homepageMomentIndex % Math.max(insights.moments.length, 1)] || insights.happyMoment;
    const sourceLabel = latestSummary?.periodKey
        || latestEntry?.recordDate
        || latestDay?.recordDate
        || currentDate;
    const summaryTags = [
        ...(parseTags(latestEntry?.tags).slice(0, 2)),
        ...(insights.primaryTags || []).slice(0, 3)
    ].filter(Boolean).slice(0, 3);
    while (summaryTags.length < 3) {
        summaryTags.push(['记录', '回看', '总结'][summaryTags.length]);
    }

    const energyTop = insights.energyTop.length > 0
        ? insights.energyTop
        : [
            { rank: 1, value: '散步', note: '恢复' },
            { rank: 2, value: '咖啡店写字', note: '专注' },
            { rank: 3, value: '整理房间', note: '放松' }
        ];

    const sourceTop = insights.sourceTop.length > 0
        ? insights.sourceTop
        : [
            { rank: 1, value: '先写一条记录', note: '更容易开始' },
            { rank: 2, value: '补上时间与心情', note: '事实更完整' },
            { rank: 3, value: '再补图片', note: '证据更强' }
        ];

    const calendarDays = insights.calendarDays;
    const actionItems = insights.actionItems;
    const summaryOverview = latestSummary?.overview || latestSummary?.oneLine || '今天还没有足够的内容可以提炼。';
    const summaryMood = latestSummary?.moodTrend || latestSummary?.mood_trend || '暂无总结结果';
    const summaryKeyPoint = latestSummary?.keyPoints?.[0] || latestEntry?.content || '本周期没有可提炼的事件节点。';
    const summaryPointTwo = latestSummary?.keyPoints?.[1] || '先把一条具体记录写完整。';
    const summaryPointThree = latestSummary?.keyPoints?.[2] || '后面再用 AI 把它整理成总结。';
    const summaryPointFour = latestSummary?.concerns?.[0] || '暂时没有明显需要关注的问题。';
    const growthTitle = insights.growthTitle;
    const growthDescription = insights.growthDescription;

    return `
        <div class="page dashboard-page">
            <section class="section top-layout">
                <article class="card happy-card">
                    <div class="card-head">
                        <div class="card-title">
                            <div class="icon">😊</div>
                            <h3>开心回看</h3>
                        </div>
                        <button class="more-button" onclick="rotateHomepageMoment()">换一条</button>
                    </div>
                    <div class="card-body">
                        <div class="happy-quote">
                            <div class="eyebrow">最近值得回看的瞬间</div>
                            <h2>${escapeHtml(moment)}</h2>
                            <p>这条来自 ${escapeHtml(sourceLabel)} 的记录。它会被整理成可回看的片段，而不是单纯存成一段原始文本。</p>
                            <div class="tag-row">
                                ${summaryTags.map((tag) => `<span class="tag orange">${escapeHtml(tag)}</span>`).join('')}
                                <button class="tag" onclick="setRoute('timeline')">去看原记录</button>
                            </div>
                        </div>

                        <div class="quick-grid">
                            <div class="quick-item">
                                <strong>适合重复</strong>
                                <span>${escapeHtml(insights.repeatAdvice)}</span>
                            </div>
                            <div class="quick-item">
                                <strong>适合避开</strong>
                                <span>${escapeHtml(insights.avoidAdvice)}</span>
                            </div>
                            <div class="quick-item">
                                <strong>适合补充</strong>
                                <span>${escapeHtml(insights.supplementAdvice)}</span>
                            </div>
                        </div>
                    </div>
                </article>

                <aside class="card today-focus">
                    <div class="card-head">
                        <div class="card-title">
                            <div class="icon">🧭</div>
                            <h3>今日入口</h3>
                        </div>
                    </div>
                    <div class="card-body today-focus">
                        <div class="focus-card">
                            <div class="eyebrow">${escapeHtml(dateChip)}</div>
                            <h2>记录一个具体事件，不写完整长文。</h2>
                            <p>先保存时间、心情、标题和两句话正文。图片可以之后补充。</p>
                        </div>

                        <div class="route-list">
                            <button class="route" onclick="openTodayWrite()">
                                <div class="route-icon">✍️</div>
                                <div>
                                    <strong>写今日记录</strong>
                                    <span>新增事件节点和图片</span>
                                </div>
                                <div class="route-arrow">→</div>
                            </button>
                            <button class="route" onclick="openTodayTimeline()">
                                <div class="route-icon">🕘</div>
                                <div>
                                    <strong>查看时间轴</strong>
                                    <span>回看原始事件细节</span>
                                </div>
                                <div class="route-arrow">→</div>
                            </button>
                            <button class="route" onclick="openTodaySummary()">
                                <div class="route-icon">✨</div>
                                <div>
                                    <strong>生成 AI 总结</strong>
                                    <span>提取开心、成就、消耗</span>
                                </div>
                                <div class="route-arrow">→</div>
                            </button>
                        </div>
                    </div>
                </aside>
            </section>

            <section class="section two-col">
                <article class="card">
                    <div class="card-head">
                        <div class="card-title">
                            <div class="icon">✨</div>
                            <h3>今日 AI 提炼</h3>
                        </div>
                        <button class="more-button" onclick="setRoute('summaries')">查看详情</button>
                    </div>
                    <div class="card-body">
                        <div class="ai-list">
                            <div class="ai-block">
                                <h4>今日正向证据</h4>
                                <p>${escapeHtml(summaryKeyPoint)}</p>
                            </div>
                            <div class="ai-block">
                                <h4>值得重复的做法</h4>
                                <p>${escapeHtml(summaryPointTwo)}</p>
                            </div>
                            <div class="ai-block">
                                <h4>需要减少的消耗源</h4>
                                <p>${escapeHtml(summaryPointFour)}</p>
                            </div>
                            <div class="ai-block">
                                <h4>明天可执行动作</h4>
                                <p>${escapeHtml(summaryPointThree)}</p>
                            </div>
                        </div>
                    </div>
                </article>

                <article class="card">
                    <div class="card-head">
                        <div class="card-title">
                            <div class="icon">🏆</div>
                            <h3>成就证据</h3>
                        </div>
                        <button class="more-button" onclick="setRoute('write')">证据库</button>
                    </div>
                    <div class="card-body">
                        <div class="evidence-list">
                            <div class="evidence">
                                <div class="dot blue"></div>
                                <div>
                                    <strong>完成事项</strong>
                                    <span>${escapeHtml(insights.evidenceOne)}</span>
                                </div>
                            </div>
                            <div class="evidence">
                                <div class="dot"></div>
                                <div>
                                    <strong>突破时刻</strong>
                                    <span>${escapeHtml(insights.evidenceTwo)}</span>
                                </div>
                            </div>
                            <div class="evidence">
                                <div class="dot orange"></div>
                                <div>
                                    <strong>自我照顾</strong>
                                    <span>${escapeHtml(insights.evidenceThree)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </article>
            </section>

            <section class="section card">
                <div class="card-head">
                    <div class="card-title">
                        <div class="icon">🌱</div>
                        <h3>成长视角</h3>
                    </div>
                    <button class="more-button" onclick="setRoute('summaries')">查看全部行为证据</button>
                </div>
                <div class="card-body">
                    <div class="growth-layout">
                        <div class="growth-main">
                            <b>本周正在形成的有效模式</b>
                            <h4>${escapeHtml(growthTitle)}</h4>
                            <p>${escapeHtml(growthDescription)}</p>
                            <div class="tag-row">
                                <span class="tag">适用：任务切换后</span>
                                <span class="tag">动作：散步 20 分钟</span>
                                <span class="tag">结果：晚上能复盘</span>
                            </div>
                        </div>

                        <div class="growth-cards">
                            <div class="growth-card">
                                <strong>主动表达</strong>
                                <span>${escapeHtml(latestEntry?.title || '把真实想法写下来。')}</span>
                            </div>
                            <div class="growth-card">
                                <strong>坚持完成</strong>
                                <span>${escapeHtml(`目前共有 ${recentEntries.length || 0} 条事件节点。`)}</span>
                            </div>
                            <div class="growth-card">
                                <strong>处理冲突</strong>
                                <span>${escapeHtml(summaryMood)}</span>
                            </div>
                            <div class="growth-card">
                                <strong>照顾自己</strong>
                                <span>${escapeHtml(insights.repeatAdvice)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section class="section two-col">
                <article class="card">
                    <div class="card-head">
                        <div class="card-title">
                            <div class="icon">⚡</div>
                            <h3>能量来源</h3>
                        </div>
                        <button class="more-button" onclick="setRoute('timeline')">查看统计</button>
                    </div>
                    <div class="card-body">
                        <div class="source-layout">
                            <div class="ranking">
                                <h4>人物 TOP3</h4>
                                <div class="rank-list">
                                    ${energyTop.map((item) => `
                                        <div class="rank">
                                            <div class="rank-no">${item.rank}</div>
                                            <span>${escapeHtml(item.value)}</span>
                                            <em>${escapeHtml(item.note)}</em>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>

                            <div class="ranking">
                                <h4>活动 TOP3</h4>
                                <div class="rank-list">
                                    ${sourceTop.map((item) => `
                                        <div class="rank">
                                            <div class="rank-no">${item.rank}</div>
                                            <span>${escapeHtml(item.value)}</span>
                                            <em>${escapeHtml(item.note)}</em>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                </article>

                <article class="card">
                    <div class="card-head">
                        <div class="card-title">
                            <div class="icon">🧩</div>
                            <h3>消耗提醒</h3>
                        </div>
                        <button class="more-button" onclick="setRoute('timeline')">查看原因</button>
                    </div>
                    <div class="card-body">
                        <div class="evidence-list">
                            <div class="evidence">
                                <div class="dot orange"></div>
                                <div>
                                    <strong>下午切换过多</strong>
                                    <span>${escapeHtml(insights.avoidAdvice)}</span>
                                </div>
                            </div>
                            <div class="evidence">
                                <div class="dot orange"></div>
                                <div>
                                    <strong>复盘时间偏晚</strong>
                                    <span>太晚开始复盘时，更容易只记录疲惫。</span>
                                </div>
                            </div>
                            <div class="evidence">
                                <div class="dot"></div>
                                <div>
                                    <strong>可替代做法</strong>
                                    <span>${escapeHtml(insights.repeatAdvice)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </article>
            </section>

            <section class="section bottom-layout">
                <article class="card">
                    <div class="card-head">
                        <div class="card-title">
                            <div class="icon">📅</div>
                            <h3>本周心情日历</h3>
                        </div>
                        <button class="more-button" onclick="setRoute('timeline')">周总结</button>
                    </div>
                    <div class="card-body">
                        <div class="calendar">
                            ${calendarDays.map((day, index) => `
                                <div class="day ${day.tone}">
                                    <div class="day-head">
                                        <span>${escapeHtml(day.label)}</span>
                                        <span>${escapeHtml(String(day.entryCount || 0))}条</span>
                                    </div>
                                    <strong>${day.tone === 'good' ? '🙂' : day.tone === 'calm' ? '😐' : '😣'}</strong>
                                    <p>${escapeHtml(day.mood)}</p>
                                </div>
                            `).join('')}
                        </div>

                        <div class="trend-row">
                            <div class="trend">
                                <strong>本周恢复点</strong>
                                <span>${escapeHtml(latestSummary?.highlights?.[0] || '最近还没有明显恢复点。')}</span>
                            </div>
                            <div class="trend">
                                <strong>本周消耗点</strong>
                                <span>${escapeHtml(latestSummary?.concerns?.[0] || '最近还没有明显消耗点。')}</span>
                            </div>
                        </div>
                    </div>
                </article>

                <article class="card">
                    <div class="card-head">
                        <div class="card-title">
                            <div class="icon">🧭</div>
                            <h3>明日行动建议</h3>
                        </div>
                        <button class="more-button" onclick="copyHomepageAdvice()">复制</button>
                    </div>
                    <div class="card-body">
                        <div class="advice-layout">
                            <div class="primary-advice">
                                <b>明天最优先</b>
                                <h4>${escapeHtml(actionItems[0].title)}</h4>
                                <p>${escapeHtml('任务切换两次后，先用短散步重置状态。不要等到明显疲惫后再休息。')}</p>
                            </div>

                            <div class="advice-list">
                                ${actionItems.map((item) => `
                                    <div class="advice">
                                        <div class="step">${item.step}</div>
                                        <div>
                                            <strong>${escapeHtml(item.title)}</strong>
                                            <span>${escapeHtml(item.note)}</span>
                                        </div>
                                        <div class="type">${escapeHtml(item.type)}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </article>
            </section>
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

function renderTimelineCalendar() {
    const overview = state.monthOverview?.data || {};
    const days = Array.isArray(overview.days) ? overview.days : [];
    const dayMap = new Map(days.map((item) => [item.record_date, item]));
    const selectedMonth = state.selectedMonth || getMonthKey(state.selectedDate);
    const cells = buildCalendarCells(selectedMonth, dayMap);
    const daysInMonth = getDaysInMonth(selectedMonth);
    const recordDays = overview.recordedDayCount ?? dayMap.size;
    const totalEntries = overview.totalEntries ?? days.reduce((sum, day) => sum + (Number(day.entry_count) || 0), 0);
    const today = getToday();

    return `
        <section class="panel month-panel">
            <div class="calendar-header">
                <div>
                    <h3 class="section-title">${escapeHtml(getMonthLabel(selectedMonth))}</h3>
                    <div class="field-help">点击日期可以直接查看当天的事件节点。</div>
                </div>
                <div class="calendar-controls">
                    <button class="mini-button" onclick="shiftMonth(-1)">上月</button>
                    <input type="month" value="${escapeHtml(selectedMonth)}" onchange="changeMonth(this.value)">
                    <button class="mini-button" onclick="shiftMonth(1)">下月</button>
                </div>
            </div>
            <div class="calendar-weekdays">
                <span>一</span>
                <span>二</span>
                <span>三</span>
                <span>四</span>
                <span>五</span>
                <span>六</span>
                <span>日</span>
            </div>
            <div class="calendar-grid">
                ${cells.map((cell) => {
                    if (!cell) {
                        return '<div class="calendar-cell empty"></div>';
                    }

                    const dayValue = String(cell.day).padStart(2, '0');
                    const recordDate = cell.recordDate;
                    const isSelected = recordDate === state.selectedDate;
                    const isToday = recordDate === today;
                    const hasRecords = cell.entryCount > 0;
                    const dayInfo = dayMap.get(recordDate);

                    return `
                        <button class="calendar-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${hasRecords ? 'has-records' : ''}"
                            onclick="changeSelectedDate('${recordDate}', true)">
                            <span class="calendar-day-number">${dayValue}</span>
                            <span class="calendar-day-meta">${hasRecords ? `${dayInfo.entry_count} 条` : '无记录'}</span>
                        </button>
                    `;
                }).join('')}
            </div>
            <div class="timeline-summary">
                <div class="timeline-summary-item">
                    <span>记录日期</span>
                    <strong>${recordDays}</strong>
                </div>
                <div class="timeline-summary-item">
                    <span>事件节点</span>
                    <strong>${totalEntries}</strong>
                </div>
                <div class="timeline-summary-item">
                    <span>本月天数</span>
                    <strong>${daysInMonth}</strong>
                </div>
            </div>
        </section>
    `;
}

function renderTimeline() {
    const entries = state.timelineEntries || [];
    const selectedMonth = state.selectedMonth || getMonthKey(state.selectedDate);
    const filledEntries = entries.filter((entry) => String(entry.content || entry.title || '').trim());
    const imageCount = entries.reduce((sum, entry) => sum + (Array.isArray(entry.images) ? entry.images.length : 0), 0);
    const moodCounts = countValues(entries, (entry) => entry.mood);
    const topMood = moodCounts[0]?.value || '未设置';

    return `
        <div class="page">
            <div class="page-header">
                <div>
                    <h2 class="page-title">时间轴</h2>
                    <div class="page-subtitle">用月历快速定位日期，再查看当天的节点、标签、心情和图片缩略图。</div>
                </div>
                <div class="page-actions">
                    <input type="date" value="${escapeHtml(state.selectedDate)}" onchange="changeSelectedDate(this.value, true)">
                    <input type="month" value="${escapeHtml(selectedMonth)}" onchange="changeMonth(this.value)">
                </div>
            </div>
            <section class="section top-layout">
                <article class="card">
                    <div class="card-head">
                        <div class="card-title">
                            <div class="icon">🕘</div>
                            <h3>时间轴总览</h3>
                        </div>
                        <button class="more-button" onclick="openTodayTimeline()">回到今天</button>
                    </div>
                    <div class="card-body">
                        <div class="focus-card timeline-focus-card">
                            <div class="eyebrow">${escapeHtml(state.selectedDate || getToday())}</div>
                            <h2>先用月历找到那一天，再顺着事件节点回看情绪、标签和图片。</h2>
                            <p>时间轴页适合做“回看”和“对照”，不是一次性写很多内容，而是快速定位某天到底发生了什么。</p>
                        </div>
                        <div class="quick-grid timeline-quick-grid">
                            <div class="quick-item">
                                <strong>当天节点</strong>
                                <span>${escapeHtml(String(entries.length))} 条</span>
                            </div>
                            <div class="quick-item">
                                <strong>有内容节点</strong>
                                <span>${escapeHtml(String(filledEntries.length))} 条</span>
                            </div>
                            <div class="quick-item">
                                <strong>图片数量</strong>
                                <span>${escapeHtml(String(imageCount))} 张</span>
                            </div>
                        </div>
                    </div>
                </article>
                <article class="card">
                    <div class="card-head">
                        <div class="card-title">
                            <div class="icon">📌</div>
                            <h3>回看提示</h3>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="evidence-list">
                            <div class="evidence">
                                <div class="dot blue"></div>
                                <div>
                                    <strong>当前日期</strong>
                                    <span>${escapeHtml(state.selectedDate || '未选择')}</span>
                                </div>
                            </div>
                            <div class="evidence">
                                <div class="dot"></div>
                                <div>
                                    <strong>主情绪</strong>
                                    <span>${escapeHtml(topMood)}</span>
                                </div>
                            </div>
                            <div class="evidence">
                                <div class="dot orange"></div>
                                <div>
                                    <strong>适合下一步</strong>
                                    <span>${entries.length > 0 ? '点开时间点和图片，补全细节。' : '先去写记录页补一条具体事件。'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </article>
            </section>
            <div class="timeline-layout">
                ${renderTimelineCalendar()}
                <section class="panel timeline-detail-panel">
                    <div class="card-head timeline-panel-head">
                        <div class="card-title">
                            <div class="icon">📍</div>
                            <h3>单日时间轴</h3>
                        </div>
                        <div class="field-help">当前日期：${escapeHtml(state.selectedDate || '--')}</div>
                    </div>
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
            <div class="footer-note">这页已经具备月历导航和单日回看能力。下一步可以继续做搜索和标签筛选。</div>
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

function formatSummaryPeriodLabel(period) {
    if (!period) {
        return '';
    }

    return period.label || period.periodKey || '';
}

function renderSummaryList(title, items, emptyText) {
    const list = Array.isArray(items) ? items : [];

    return `
        <section class="summary-card">
            <div class="summary-card-title">${escapeHtml(title)}</div>
            <div class="summary-card-copy">
                ${list.length === 0 ? escapeHtml(emptyText) : `
                    <ul class="summary-bullet-list">
                        ${list.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>
                `}
            </div>
        </section>
    `;
}

function renderSummaryDetails() {
    const summary = state.summaryData?.content_json || null;
    const period = state.summaryPeriod || null;
    const sourceStats = summary?.source_stats || state.summarySourceStats || null;

    if (!summary) {
        return `
            <section class="panel">
                <div class="empty-state">
                    <div class="section-title">还没有回传结果</div>
                    <div class="empty-copy">先准备本地 AI 任务，然后由你的本地模型处理后，把结果 POST 回平台即可。</div>
                </div>
            </section>
        `;
    }

    return `
        <section class="panel summary-panel">
            <div class="summary-hero">
                <div>
                    <div class="summary-kicker">${escapeHtml(getSummaryTypeLabel(state.summaryType))}</div>
                    <h3 class="section-title">${escapeHtml(summary.title || getSummaryTypeLabel(state.summaryType))}</h3>
                    <div class="field-help">${escapeHtml(formatSummaryPeriodLabel(period))}</div>
                </div>
                <div class="summary-stats">
                    <div class="summary-stat">
                        <span>日数</span>
                        <strong>${escapeHtml(String(sourceStats?.day_count ?? sourceStats?.dayCount ?? 0))}</strong>
                    </div>
                    <div class="summary-stat">
                        <span>节点</span>
                        <strong>${escapeHtml(String(sourceStats?.entry_count ?? sourceStats?.entryCount ?? 0))}</strong>
                    </div>
                    <div class="summary-stat">
                        <span>图片</span>
                        <strong>${escapeHtml(String(sourceStats?.image_count ?? sourceStats?.imageCount ?? 0))}</strong>
                    </div>
                </div>
            </div>
            <div class="summary-overview">
                <div class="summary-card-title">概览</div>
                <div class="template-text">${escapeHtml(summary.overview || '')}</div>
            </div>
        </section>
    `;
}

function renderSummaryTaskPanel() {
    const task = state.summaryTask || null;
    if (!task) {
        return `
            <section class="panel">
                <div class="empty-state">
                    <div class="section-title">本地任务未准备</div>
                    <div class="empty-copy">点击“准备任务”后，平台会输出一份可给本地 AI 使用的 JSON 任务。</div>
                </div>
            </section>
        `;
    }

    return `
        <section class="panel">
            <div class="page-header" style="margin-bottom: 12px;">
                <div>
                    <h3 class="section-title">本地 AI 任务</h3>
                    <div class="field-help">把这份 JSON 交给本地模型处理，生成结果后再调用 /api/summaries/ingest。</div>
                </div>
                <div class="page-actions">
                    <button class="button-ghost" onclick="copySummaryTask()">复制任务 JSON</button>
                </div>
            </div>
            <div class="template-text" style="max-height: 320px; overflow: auto;">${escapeHtml(JSON.stringify(task, null, 2))}</div>
        </section>
    `;
}

function renderWrite() {
    const currentEntry = normalizeEntry(findSelectedEntry() || createEmptyEntry());
    const currentIndex = state.dayEntries.findIndex((entry) => entry.id === currentEntry.id);
    const totalImages = state.dayEntries.reduce((sum, entry) => sum + (entry.images?.length || 0) + (entry.pendingImages?.length || 0), 0);
    const writeHint = currentEntry.title || currentEntry.content
        ? '先把当前节点写完整，再考虑新增下一条。'
        : '先写时间、标题、两句话正文，保存后再补图片。';

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
            <section class="section top-layout">
                <article class="card">
                    <div class="card-head">
                        <div class="card-title">
                            <div class="icon">✍️</div>
                            <h3>写记录</h3>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="focus-card write-focus-card">
                            <div class="eyebrow">${escapeHtml(state.selectedDate || getToday())}</div>
                            <h2>一条记录只写一个具体事件，不追求一次写完整篇长文。</h2>
                            <p>${escapeHtml(writeHint)}</p>
                        </div>
                        <div class="quick-grid">
                            <div class="quick-item">
                                <strong>节点数量</strong>
                                <span>${escapeHtml(String(state.dayEntries.length))} 条</span>
                            </div>
                            <div class="quick-item">
                                <strong>图片总数</strong>
                                <span>${escapeHtml(String(totalImages))} 张</span>
                            </div>
                            <div class="quick-item">
                                <strong>当前节点</strong>
                                <span>${escapeHtml(currentEntry.title || `节点 ${Math.max(currentIndex + 1, 1)}`)}</span>
                            </div>
                        </div>
                    </div>
                </article>
                <article class="card">
                    <div class="card-head">
                        <div class="card-title">
                            <div class="icon">🧭</div>
                            <h3>记录建议</h3>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="route-list">
                            <button class="route" onclick="addEntry()">
                                <div class="route-icon">＋</div>
                                <div>
                                    <strong>新增一个节点</strong>
                                    <span>把今天拆成多个事件片段</span>
                                </div>
                                <div class="route-arrow">→</div>
                            </button>
                            <button class="route" onclick="saveDayEntries()">
                                <div class="route-icon">💾</div>
                                <div>
                                    <strong>先保存再细化</strong>
                                    <span>先把事实留住，后面再润色</span>
                                </div>
                                <div class="route-arrow">→</div>
                            </button>
                            <button class="route" onclick="setRoute('timeline')">
                                <div class="route-icon">🕘</div>
                                <div>
                                    <strong>写完去回看</strong>
                                    <span>保存后到时间轴检查顺序和图片</span>
                                </div>
                                <div class="route-arrow">→</div>
                            </button>
                        </div>
                    </div>
                </article>
            </section>
            <div class="composer">
                <section class="panel">
                    <div class="card-head timeline-panel-head">
                        <div class="card-title">
                            <div class="icon">📚</div>
                            <h3>事件节点列表</h3>
                        </div>
                        <div class="field-help">点击左侧节点后，在右边编辑。</div>
                    </div>
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
                    <div class="card-head timeline-panel-head">
                        <div class="card-title">
                            <div class="icon">📝</div>
                            <h3>当前节点编辑区</h3>
                        </div>
                        <div class="field-help">当前编辑：${escapeHtml(currentEntry.title || `节点 ${Math.max(currentIndex + 1, 1)}`)}</div>
                    </div>
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

function renderWrite() {
    const currentEntry = normalizeEntry(findSelectedEntry() || createEmptyEntry());
    const currentIndex = state.dayEntries.findIndex((entry) => entry.id === currentEntry.id);
    const currentEntryLabel = [currentEntry.entry_time, currentEntry.title]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .join('');
    const currentEntrySummary = currentEntryLabel || `节点 ${Math.max(currentIndex + 1, 1)}`;

    return `
        <div class="page page-workbench write-page">
            <div class="page-header">
                <div>
                    <h2 class="page-title">写记录</h2>
                    <div class="page-subtitle">按事件节点录入</div>
                </div>
                <div class="page-actions">
                    <input type="date" value="${escapeHtml(state.selectedDate)}" onchange="changeSelectedDate(this.value, false)">
                    <button class="button-ghost" onclick="addEntry()">新增节点</button>
                    <button class="button" onclick="saveDayEntries()">保存全部</button>
                </div>
            </div>
            <section class="card workbench-banner">
                <div class="workbench-banner-main">
                    <div>
                        <div class="eyebrow">${escapeHtml(state.selectedDate || getToday())} · 今日记录</div>
                        <h3 class="workbench-banner-title">今天已记录 ${escapeHtml(String(state.dayEntries.length))} 个节点，当前编辑 ${escapeHtml(currentEntrySummary)}。</h3>
                        <p class="workbench-banner-copy">先写事实，再补心情、标签和图片。</p>
                    </div>
                    <div class="workbench-banner-actions">
                        <button class="button-secondary drawer-launch" onclick="openDrawer('write-support')">
                            今日概况与提示
                            <span>${escapeHtml(topTags[0]?.value || topMood)}</span>
                        </button>
                        <button class="button-secondary" onclick="setRoute('timeline')">查看时间轴</button>
                    </div>
                </div>
                <div class="workbench-metrics">
                    <div class="quick-item compact">
                        <strong>节点</strong>
                        <span>${escapeHtml(String(state.dayEntries.length))}</span>
                    </div>
                    <div class="quick-item compact">
                        <strong>图片</strong>
                        <span>${escapeHtml(String(totalImages))}</span>
                    </div>
                    <div class="quick-item compact">
                        <strong>待上传</strong>
                        <span>${escapeHtml(String(pendingImages))}</span>
                    </div>
                    <div class="quick-item compact">
                        <strong>当前节点</strong>
                        <span>${escapeHtml(currentEntry.title || `节点 ${Math.max(currentIndex + 1, 1)}`)}</span>
                    </div>
                </div>
            </section>
            <div class="write-workspace compact-write-grid workbench-grid">
                <section class="panel write-list-panel scroll-panel">
                    <div class="timeline-head">
                        <div>
                            <h3>事件节点</h3>
                            <div class="field-help">左侧选节点，右侧编辑。</div>
                        </div>
                        <button class="button-secondary" onclick="addEntry()">新增</button>
                    </div>
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
                                <div class="empty-copy">${escapeHtml(entry.content || '点开后编辑当前节点内容')}</div>
                            </article>
                        `).join('')}
                    </div>
                </section>
                <section class="panel write-editor-panel scroll-panel">
                    <div class="card-head timeline-panel-head">
                        <div class="card-title">
                            <div class="icon">●</div>
                            <h3>当前节点编辑区</h3>
                        </div>
                        <div class="field-help">当前编辑：${escapeHtml(currentEntry.title || `节点 ${Math.max(currentIndex + 1, 1)}`)}</div>
                    </div>
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
                            <div class="field-help">支持多张图片，本地预览后会自动上传并回显。</div>
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
            <div class="footer-note compact-note" id="writeSaveNote"></div>
        </div>
    `;
}

function renderWrite() {
    const currentEntry = normalizeEntry(findSelectedEntry() || createEmptyEntry());
    const currentIndex = state.dayEntries.findIndex((entry) => entry.id === currentEntry.id);
    const totalImages = state.dayEntries.reduce((sum, entry) => sum + (entry.images?.length || 0) + (entry.pendingImages?.length || 0), 0);
    const pendingImages = state.dayEntries.reduce((sum, entry) => sum + (entry.pendingImages?.length || 0), 0);
    const topMood = countValues(state.dayEntries, (entry) => entry.mood)[0]?.value || '未设置';
    const topTags = countValues(
        state.dayEntries.flatMap((entry) => parseTags(entry.tags || []))
            .map((tag) => ({ tag })),
        (item) => item.tag
    );
    const currentEntryLabel = [currentEntry.entry_time, currentEntry.title]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .join('');
    const currentEntrySummary = currentEntryLabel || `节点 ${Math.max(currentIndex + 1, 1)}`;

    return `
        <div class="page page-workbench write-page write-prototype">
            <section class="card workbench-banner write-hero-prototype">
                <div class="write-title-block">
                    <h2 class="page-title">写记录</h2>
                    <div class="page-subtitle">按事件节点录入</div>
                </div>
                <div class="write-conclusion">
                    <p>今天已记录 ${escapeHtml(String(state.dayEntries.length))} 个节点，当前编辑 ${escapeHtml(currentEntrySummary)}。先写事实，再补心情、标签和图片。</p>
                </div>
                <div class="write-action-grid">
                    <div class="write-action-card"><strong>新增</strong>一个独立事件节点。</div>
                    <div class="write-action-card"><strong>填写</strong>时间标题和正文。</div>
                    <div class="write-action-card"><strong>上传</strong>节点相关图片。</div>
                    <div class="write-action-card"><strong>保存</strong>后生成当天总结。</div>
                </div>
            </section>
            <div class="write-workspace compact-write-grid workbench-grid">
                <section class="panel write-list-panel scroll-panel">
                    <div class="timeline-head">
                        <div>
                            <h3>事件节点</h3>
                            <div class="field-help">按当天顺序排列</div>
                        </div>
                        <button class="button-secondary" onclick="addEntry()">新增</button>
                    </div>
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
                                <div class="empty-copy">${escapeHtml(entry.content || '点开后编辑当前节点内容')}</div>
                            </article>
                        `).join('')}
                    </div>
                    <div class="page-actions">
                        <button class="button-ghost" onclick="moveEntry('${currentEntry.id}', -1)" ${currentIndex <= 0 ? 'disabled' : ''}>上移</button>
                        <button class="button-ghost" onclick="moveEntry('${currentEntry.id}', 1)" ${currentIndex < 0 || currentIndex >= state.dayEntries.length - 1 ? 'disabled' : ''}>下移</button>
                        <button class="button-ghost" onclick="removeSelectedEntry()">删除</button>
                    </div>
                </section>
                <section class="panel write-editor-panel scroll-panel">
                    <div class="card-head timeline-panel-head">
                        <div class="card-title">
                            <div class="icon">●</div>
                            <h3>当前节点编辑</h3>
                        </div>
                        <div class="field-help">保存状态：编辑中</div>
                    </div>
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
                            <div class="field-help">支持多张图片，本地预览后会自动上传并回显。</div>
                            <div class="upload-row">
                                <input id="entryImageInput" type="file" accept="image/*" multiple onchange="handleImageInput(this)">
                            </div>
                            ${renderEntryImageCards(currentEntry)}
                        </div>
                    </div>
                </section>
            </div>
            <div class="footer-note compact-note" id="writeSaveNote"></div>
        </div>
    `;
}

function renderSummaries() {
    const summary = state.summaryData?.content_json || null;
    const sourceStats = summary?.source_stats || state.summarySourceStats || null;
    const period = state.summaryPeriod || null;
    const summaryTypeLabel = getSummaryTypeLabel(state.summaryType);
    const loadingText = state.summaryLoading ? '准备中...' : '准备任务';
    const targetDate = getSummaryTargetDate();
    const latestKeyPoint = summary?.key_points?.[0] || '还没有关键点。';
    const latestHighlight = summary?.highlights?.[0] || '还没有提炼出亮点。';
    const latestConcern = summary?.concerns?.[0] || '暂时没有明显需要关注的问题。';

    return `
        <div class="page">
            <div class="page-header">
                <div>
                    <h2 class="page-title">AI 总结</h2>
                    <div class="page-subtitle">平台只负责取数、模板和保存结果，本地 AI 负责真正生成总结。</div>
                </div>
                <div class="page-actions">
                    <button class="button-ghost" onclick="refreshSummary()">刷新</button>
                    <button class="button-secondary" onclick="prepareSummaryTask()">${loadingText}</button>
                </div>
            </div>
            <section class="section top-layout">
                <article class="card">
                    <div class="card-head">
                        <div class="card-title">
                            <div class="icon">✨</div>
                            <h3>总结视角</h3>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="focus-card summary-focus-card">
                            <div class="eyebrow">${escapeHtml(summaryTypeLabel)} · ${escapeHtml(formatSummaryPeriodLabel(period) || targetDate)}</div>
                            <h2>平台只负责取数和保存，本地 AI 负责真正生成提炼结果。</h2>
                            <p>${escapeHtml(summary?.overview || '先准备任务，再把结果回传平台，这页就会逐渐长成一张可回看的总结页。')}</p>
                        </div>
                        <div class="ai-list summary-ai-grid">
                            <div class="ai-block">
                                <h4>关键点</h4>
                                <p>${escapeHtml(latestKeyPoint)}</p>
                            </div>
                            <div class="ai-block">
                                <h4>亮点</h4>
                                <p>${escapeHtml(latestHighlight)}</p>
                            </div>
                        </div>
                    </div>
                </article>
                <article class="card">
                    <div class="card-head">
                        <div class="card-title">
                            <div class="icon">🧩</div>
                            <h3>当前状态</h3>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="evidence-list">
                            <div class="evidence">
                                <div class="dot blue"></div>
                                <div>
                                    <strong>来源节点</strong>
                                    <span>${escapeHtml(String(sourceStats?.entry_count ?? sourceStats?.entryCount ?? 0))} 条</span>
                                </div>
                            </div>
                            <div class="evidence">
                                <div class="dot"></div>
                                <div>
                                    <strong>来源天数</strong>
                                    <span>${escapeHtml(String(sourceStats?.day_count ?? sourceStats?.dayCount ?? 0))} 天</span>
                                </div>
                            </div>
                            <div class="evidence">
                                <div class="dot orange"></div>
                                <div>
                                    <strong>当前提醒</strong>
                                    <span>${escapeHtml(latestConcern)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </article>
            </section>
            <div class="summary-toolbar panel">
                <div class="summary-toolbar-left">
                    <div class="summary-type-tabs">
                        <button class="summary-type-tab ${state.summaryType === 'daily' ? 'active' : ''}" onclick="changeSummaryType('daily')">日总结</button>
                        <button class="summary-type-tab ${state.summaryType === 'weekly' ? 'active' : ''}" onclick="changeSummaryType('weekly')">周总结</button>
                        <button class="summary-type-tab ${state.summaryType === 'monthly' ? 'active' : ''}" onclick="changeSummaryType('monthly')">月总结</button>
                    </div>
                    <div class="field-help">当前查看：${escapeHtml(summaryTypeLabel)} · ${escapeHtml(formatSummaryPeriodLabel(period) || targetDate)}</div>
                    <div class="summary-inputs">
                        ${state.summaryType === 'monthly' ? `
                            <input type="month" value="${escapeHtml(state.summaryMonthKey || getMonthKey(state.summaryAnchorDate || state.selectedDate))}" onchange="changeSummaryMonth(this.value)">
                        ` : `
                            <input type="date" value="${escapeHtml(state.summaryAnchorDate || state.selectedDate || getToday())}" onchange="changeSummaryDate(this.value)">
                        `}
                    </div>
                </div>
                <div class="summary-toolbar-right">
                    <div class="summary-mini-meta">
                        <span>来源节点</span>
                        <strong>${escapeHtml(String(sourceStats?.entry_count ?? sourceStats?.entryCount ?? 0))}</strong>
                    </div>
                    <div class="summary-mini-meta">
                        <span>来源天数</span>
                        <strong>${escapeHtml(String(sourceStats?.day_count ?? sourceStats?.dayCount ?? 0))}</strong>
                    </div>
                </div>
            </div>
            ${renderSummaryDetails()}
            ${renderSummaryTaskPanel()}
            <div class="summary-grid">
                ${renderSummaryList('关键点', summary?.key_points, '还没有关键点。')}
                ${renderSummaryList('亮点', summary?.highlights, '还没有提炼出亮点。')}
                ${renderSummaryList('需要关注', summary?.concerns, '暂时没有明显需要关注的问题。')}
            </div>
            <div class="summary-list" style="margin-top: 18px;">
                <section class="panel">
                    <h3 class="section-title">情绪趋势</h3>
                    <div class="template-text">${escapeHtml(summary?.mood_trend || '暂无总结结果')}</div>
                </section>
                <section class="panel">
                    <h3 class="section-title">一句话总结</h3>
                    <div class="template-text">${escapeHtml(summary?.one_line || '点击准备任务后，本地 AI 生成的结果会显示在这里。')}</div>
                </section>
                <section class="panel">
                    <h3 class="section-title">原始文本</h3>
                    <div class="template-text">${escapeHtml(state.summaryData?.raw_text || '暂无原始文本。')}</div>
                </section>
            </div>
            <div class="footer-note">
                ${state.summaryError ? `当前有错误：${escapeHtml(state.summaryError)}` : '总结结果来自本地 AI 回传，平台不会在后端直接跑模型。'}
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
            <section class="section top-layout">
                <article class="card">
                    <div class="card-head">
                        <div class="card-title">
                            <div class="icon">⚙️</div>
                            <h3>本地 AI 配置</h3>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="focus-card settings-focus-card">
                            <div class="eyebrow">本地优先</div>
                            <h2>这里保存的是平台侧配置，不是云端托管状态。</h2>
                            <p>服务商、模型和模板都会写进本地数据库。后面换本地模型或 worker，也优先从这里读配置。</p>
                        </div>
                    </div>
                </article>
                <article class="card">
                    <div class="card-head">
                        <div class="card-title">
                            <div class="icon">🧰</div>
                            <h3>工作流提示</h3>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="route-list">
                            <button class="route" onclick="saveSettings()">
                                <div class="route-icon">💾</div>
                                <div>
                                    <strong>先保存配置</strong>
                                    <span>更新模型名、服务商和模板</span>
                                </div>
                                <div class="route-arrow">→</div>
                            </button>
                            <button class="route" onclick="setRoute('summaries')">
                                <div class="route-icon">✨</div>
                                <div>
                                    <strong>再去总结页验证</strong>
                                    <span>确认任务和回传结果是否符合预期</span>
                                </div>
                                <div class="route-arrow">→</div>
                            </button>
                            <button class="route" onclick="handleBackup()">
                                <div class="route-icon">📦</div>
                                <div>
                                    <strong>导出本地备份</strong>
                                    <span>配置和数据一起存档</span>
                                </div>
                                <div class="route-arrow">→</div>
                            </button>
                        </div>
                    </div>
                </article>
            </section>
            <div class="settings-grid">
                <section class="panel">
                    <div class="card-head timeline-panel-head">
                        <div class="card-title">
                            <div class="icon">🤖</div>
                            <h3>AI 配置</h3>
                        </div>
                    </div>
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
                    <div class="card-head timeline-panel-head">
                        <div class="card-title">
                            <div class="icon">📄</div>
                            <h3>模板配置</h3>
                        </div>
                    </div>
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

function matchesTimelineQuery(entry, query) {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery) {
        return true;
    }

    const text = [
        entry?.title,
        entry?.content,
        entry?.mood,
        entry?.entry_time,
        ...parseTags(entry?.tags || [])
    ]
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean)
        .join(' ');

    return text.includes(normalizedQuery);
}

function matchesTimelineFilter(entry, filter) {
    const activeFilter = String(filter || 'all');
    if (activeFilter === 'all') {
        return true;
    }

    if (activeFilter === 'images') {
        return (entry?.images || []).length > 0;
    }

    if (activeFilter === 'tags') {
        return parseTags(entry?.tags || []).length > 0;
    }

    if (activeFilter === 'filled') {
        return Boolean(String(entry?.content || entry?.title || '').trim());
    }

    if (activeFilter.startsWith('mood:')) {
        return String(entry?.mood || '').trim() === activeFilter.slice(5);
    }

    return true;
}

function getVisibleTimelineEntries(entries) {
    return (entries || []).filter((entry) => {
        return matchesTimelineQuery(entry, state.timelineQuery)
            && matchesTimelineFilter(entry, state.timelineFilter);
    });
}

function renderTimeline() {
    const entries = state.timelineEntries || [];
    const selectedMonth = state.selectedMonth || getMonthKey(state.selectedDate);
    const imageCount = entries.reduce((sum, entry) => sum + (Array.isArray(entry.images) ? entry.images.length : 0), 0);
    const moodCounts = countValues(entries, (entry) => entry.mood);
    const topMood = moodCounts[0]?.value || '未设置';
    const filledEntries = entries.filter((entry) => String(entry.content || entry.title || '').trim());
    const imageEntries = entries.filter((entry) => (entry.images || []).length > 0);
    const taggedEntries = entries.filter((entry) => parseTags(entry.tags || []).length > 0);
    const tagCount = entries.reduce((sum, entry) => sum + parseTags(entry.tags || []).length, 0);
    const topTags = countValues(
        entries.flatMap((entry) => parseTags(entry.tags || []))
            .map((tag) => ({ tag })),
        (item) => item.tag
    );
    const visibleEntries = getVisibleTimelineEntries(entries);
    const filterOptions = [
        { id: 'all', label: `全部 ${entries.length}` },
        { id: 'filled', label: `有内容 ${filledEntries.length}` },
        { id: 'images', label: `有图片 ${imageEntries.length}` },
        { id: 'tags', label: `有标签 ${taggedEntries.length}` }
    ];
    const moodOptions = moodCounts.slice(0, 2).map((item) => ({
        id: `mood:${item.value}`,
        label: `${item.value} ${item.count}`
    }));

    return `
        <div class="page">
            <div class="page-header">
                <div>
                    <h2 class="page-title">时间轴</h2>
                    <div class="page-subtitle">用月历快速定位日期，再查看当天的节点、标签、心情和图片缩略图。</div>
                </div>
                <div class="page-actions">
                    <input type="date" value="${escapeHtml(state.selectedDate)}" onchange="changeSelectedDate(this.value, true)">
                    <input type="month" value="${escapeHtml(selectedMonth)}" onchange="changeMonth(this.value)">
                </div>
            </div>
            <div class="timeline-shell">
                <aside class="timeline-sidebar">
                    ${renderTimelineCalendar()}
                </aside>
                <section class="timeline-main-stack">
                    <article class="card timeline-summary-hero">
                        <div class="timeline-summary-head">
                            <div>
                                <div class="eyebrow">${escapeHtml(state.selectedDate || getToday())}</div>
                                <h3 class="timeline-hero-title">原始记录是回看的底稿，AI 提炼结果留给总结页。</h3>
                                <p class="timeline-hero-copy">先按日期定位，再顺着事件节点回看时间、心情、标签和图片。这里聚焦事实，不替代总结。</p>
                                <div class="summary-meta">
                                    <span class="meta-chip green">${entries.length > 0 ? '已保存' : '无记录'}</span>
                                    <span class="meta-chip">${escapeHtml(String(entries.length))} 个事件节点</span>
                                    <span class="meta-chip">${escapeHtml(String(imageCount))} 张图片</span>
                                </div>
                            </div>
                            <div class="timeline-summary-actions">
                                <button class="button-secondary" onclick="prepareSummaryTask()">准备日总结</button>
                                <button class="button" onclick="setRoute('summaries')">查看 AI 提炼</button>
                            </div>
                        </div>
                    </article>
                    ${renderGlobalSearchPanel()}
                    <div class="timeline-wrap">
                        <section class="panel timeline-detail-panel">
                            <div class="timeline-head">
                                <div>
                                    <h3>当天事件节点</h3>
                                    <div class="field-help">当前日期：${escapeHtml(state.selectedDate || '--')}</div>
                                </div>
                                <div class="timeline-results-meta">
                                    <strong>${escapeHtml(String(visibleEntries.length))}</strong>
                                    <span>/ ${escapeHtml(String(entries.length))} 条</span>
                                </div>
                            </div>
                            <div class="timeline-search-strip">
                                <div class="timeline-search-row">
                                    <input
                                        class="timeline-search-input"
                                        type="search"
                                        value="${escapeHtml(state.timelineQuery)}"
                                        placeholder="搜索标题、正文、标签、心情"
                                        oninput="setTimelineQuery(this.value)"
                                        onkeydown="handleTimelineSearchKeydown(event)"
                                    >
                                    <button class="button-secondary" onclick="applyTimelineSearch()">筛选</button>
                                    <button class="mini-button" onclick="clearTimelineFilters()">清空</button>
                                </div>
                                <div class="timeline-filter-row">
                                    ${filterOptions.map((option) => `
                                        <button
                                            class="filter-chip ${state.timelineFilter === option.id ? 'active' : ''}"
                                            onclick="setTimelineFilter('${option.id}')"
                                        >${escapeHtml(option.label)}</button>
                                    `).join('')}
                                    ${moodOptions.map((option) => `
                                        <button
                                            class="filter-chip ${state.timelineFilter === option.id ? 'active' : ''}"
                                            onclick="setTimelineFilter('${escapeHtml(option.id)}')"
                                        >${escapeHtml(option.label)}</button>
                                    `).join('')}
                                </div>
                                <div class="field-help">支持按标题、正文、标签和心情查找当前日期的节点。</div>
                            </div>
                            <div class="timeline-list timeline-event-list">
                                ${entries.length === 0 ? `
                                    <div class="empty-state">
                                        <div class="section-title">当天还没有记录</div>
                                        <div class="empty-copy">切到“写记录”页新增节点后，这里会展示时间、正文和图片回显。</div>
                                    </div>
                                ` : visibleEntries.length === 0 ? `
                                    <div class="empty-state">
                                        <div class="section-title">没有匹配到结果</div>
                                        <div class="empty-copy">换一个关键词，或者清空筛选后再看看。</div>
                                    </div>
                                ` : visibleEntries.map((entry) => `
                                    <article class="timeline-item timeline-event">
                                        <div class="timeline-event-marker"></div>
                                        <div class="timeline-item-time timeline-time-box">
                                            <span class="timeline-time">${escapeHtml(entry.entry_time || '--:--')}</span>
                                            <span class="timeline-mood">${escapeHtml(entry.mood || '未设置')}</span>
                                        </div>
                                        <div class="timeline-event-body">
                                            <div class="timeline-item-title">${escapeHtml(entry.title || '未命名节点')}</div>
                                            <div class="timeline-item-copy">${escapeHtml(entry.content || '暂无正文')}</div>
                                            <div class="tag-row timeline-tags">
                                                ${parseTags(entry.tags || []).length > 0
                                                    ? parseTags(entry.tags || []).map((tag, index) => `<span class="tag ${index % 2 === 1 ? 'orange' : ''}">${escapeHtml(tag)}</span>`).join('')
                                                    : '<span class="tag">无标签</span>'}
                                            </div>
                                            ${renderTimelineImages(entry.images || [])}
                                        </div>
                                    </article>
                                `).join('')}
                            </div>
                        </section>
                        <aside class="timeline-insight-panel">
                            <article class="mini-card dark">
                                <h3>当天操作</h3>
                                <p>编辑原始节点后，可以重新准备总结任务，再让本地 AI 生成最新结果。</p>
                                <div class="ai-actions">
                                    <div class="action-row">
                                        <div class="action-icon">✍️</div>
                                        <div>
                                            <strong>修改事件节点</strong>
                                            <span>补全时间、图片和标签</span>
                                        </div>
                                    </div>
                                    <div class="action-row">
                                        <div class="action-icon">✨</div>
                                        <div>
                                            <strong>准备日总结</strong>
                                            <span>覆盖保存最新提炼</span>
                                        </div>
                                    </div>
                                </div>
                            </article>
                            <article class="mini-card">
                                <h3>当天概况</h3>
                                <p>这里只展示原始记录统计，不替代 AI 总结。</p>
                                <div class="stat-list">
                                    <div class="stat">
                                        <strong>事件节点</strong>
                                        <span>${escapeHtml(String(entries.length))}</span>
                                    </div>
                                    <div class="stat">
                                        <strong>标签数量</strong>
                                        <span>${escapeHtml(String(tagCount))}</span>
                                    </div>
                                    <div class="stat">
                                        <strong>心情状态</strong>
                                        <span>${escapeHtml(topMood)}</span>
                                    </div>
                                </div>
                            </article>
                            <article class="mini-card">
                                <h3>搜索结果提示</h3>
                                <p>${topTags[0]?.value ? `最近更常出现的标签是 ${topTags[0].value}。` : '输入关键词后，这里可以显示匹配的日期和事件。'}</p>
                                <div class="empty-note">后续支持按标题、正文和标签搜索时，这块会更像一个检索提示卡。</div>
                            </article>
                        </aside>
                    </div>
                </section>
            </div>
            <div class="footer-note">这页已经具备月历导航和单日回看能力。下一步可以继续做搜索和标签筛选。</div>
        </div>
    `;
}

function setTimelineQuery(value) {
    state.timelineQuery = String(value || '');
}

function applyTimelineSearch() {
    renderApp();
}

function handleTimelineSearchKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        applyTimelineSearch();
    }
}

function setTimelineFilter(value) {
    state.timelineFilter = String(value || 'all');
    renderApp();
}

function clearTimelineFilters() {
    state.timelineQuery = '';
    state.timelineFilter = 'all';
    renderApp();
}

function setGlobalSearchQuery(value) {
    state.globalSearchQuery = String(value || '');
    state.globalSearchError = '';
}

async function runGlobalSearch() {
    const query = String(state.globalSearchQuery || '').trim();
    state.globalSearchQuery = query;

    if (!query) {
        state.globalSearchResults = [];
        state.globalSearchMatchedDates = [];
        state.globalSearchError = '';
        state.activeDrawer = '';
        setRoute('timeline');
        renderApp();
        return;
    }

    state.globalSearchLoading = true;
    state.globalSearchError = '';
    state.activeDrawer = 'timeline-search';
    setRoute('timeline');
    renderApp();

    try {
        const result = await window.api.getSearchResults({
            query,
            limit: 24
        });

        if (!result.success) {
            throw new Error(result.error || '搜索失败');
        }

        state.globalSearchResults = Array.isArray(result.data?.results) ? result.data.results : [];
        state.globalSearchMatchedDates = Array.isArray(result.data?.matchedDates) ? result.data.matchedDates : [];
    } catch (error) {
        state.globalSearchResults = [];
        state.globalSearchMatchedDates = [];
        state.globalSearchError = error.message;
    } finally {
        state.globalSearchLoading = false;
        renderApp();
    }
}

function clearGlobalSearch() {
    state.globalSearchQuery = '';
    state.globalSearchResults = [];
    state.globalSearchMatchedDates = [];
    state.globalSearchError = '';
    state.globalSearchLoading = false;
    if (state.activeDrawer === 'timeline-search') {
        state.activeDrawer = '';
    }
    renderApp();
}

function handleGlobalSearchKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        runGlobalSearch();
    }
}

async function openSearchResult(recordDate, entryId) {
    state.selectedEntryId = entryId || null;
    state.activeDrawer = '';
    await changeSelectedDate(recordDate, true);
    setRoute('timeline');
}

function renderGlobalSearchPanel() {
    const query = String(state.globalSearchQuery || '').trim();
    const results = Array.isArray(state.globalSearchResults) ? state.globalSearchResults : [];
    const matchedDates = Array.isArray(state.globalSearchMatchedDates) ? state.globalSearchMatchedDates : [];

    return `
        <section class="panel global-search-panel">
            <div class="timeline-head">
                <div>
                    <h3>跨日期检索</h3>
                    <div class="field-help">搜索标题、正文、标签、心情，直接定位到对应日期和节点。</div>
                </div>
                ${query ? `
                    <div class="timeline-results-meta">
                        <strong>${escapeHtml(String(results.length))}</strong>
                        <span>/ ${escapeHtml(String(matchedDates.length))} 天</span>
                    </div>
                ` : ''}
            </div>
            <div class="timeline-search-strip global-search-strip">
                <div class="timeline-search-row">
                    <input
                        class="timeline-search-input"
                        type="search"
                        value="${escapeHtml(state.globalSearchQuery)}"
                        placeholder="搜索最近的标题、正文、标签、心情"
                        oninput="setGlobalSearchQuery(this.value)"
                        onkeydown="handleGlobalSearchKeydown(event)"
                    >
                    <button class="button-secondary" onclick="runGlobalSearch()">搜索</button>
                    <button class="mini-button" onclick="clearGlobalSearch()">清空</button>
                </div>
                ${state.globalSearchError ? `<div class="field-help">${escapeHtml(state.globalSearchError)}</div>` : ''}
                ${state.globalSearchLoading ? `
                    <div class="field-help">正在整理跨日期结果...</div>
                ` : query ? `
                    <div class="field-help">已覆盖 ${escapeHtml(String(matchedDates.length))} 个日期，点结果可直接跳到对应时间轴。</div>
                ` : `
                    <div class="field-help">适合找“那件事是哪天写的”“最近哪几天提到了这个标签”。</div>
                `}
            </div>
            ${!query ? '' : results.length === 0 && !state.globalSearchLoading ? `
                <div class="empty-state">
                    <div class="section-title">没有匹配到跨日期结果</div>
                    <div class="empty-copy">换个关键词试试，比如人物、地点、标签、心情，或者某个日期片段。</div>
                </div>
            ` : `
                <div class="search-result-list">
                    ${results.map((result) => `
                        <button class="search-result-card" onclick="openSearchResult('${result.recordDate}', '${result.id}')">
                            <div class="search-result-top">
                                <div>
                                    <strong>${escapeHtml(result.recordDate)} ${escapeHtml(result.entryTime || '')}</strong>
                                    <span>${escapeHtml(result.title || '未命名节点')}</span>
                                </div>
                                <div class="search-result-meta">
                                    <span>${escapeHtml(result.mood || '未设置')}</span>
                                    <span>${escapeHtml(String(result.imageCount || 0))} 图</span>
                                </div>
                            </div>
                            <div class="search-result-copy">${escapeHtml(truncateText(result.content || result.title || '暂无正文', 80))}</div>
                            <div class="tag-row">
                                ${parseTags(result.tags || []).length > 0
                                    ? parseTags(result.tags || []).slice(0, 4).map((tag, index) => `<span class="tag ${index % 2 === 1 ? 'orange' : ''}">${escapeHtml(tag)}</span>`).join('')
                                    : '<span class="tag">无标签</span>'}
                            </div>
                        </button>
                    `).join('')}
                </div>
            `}
        </section>
    `;
}

function renderTimelineInsightCards(entries, tagCount, topMood, topTags) {
    return `
        <div class="drawer-card-stack">
            <article class="mini-card dark">
                <h3>当天操作</h3>
                <p>这里保留原始节点，方便你补充细节后，再去准备新的总结任务。</p>
                <div class="ai-actions">
                    <div class="action-row">
                        <div class="action-icon">1</div>
                        <div>
                            <strong>先补节点</strong>
                            <span>把时间、图片、标签补全，再做提炼</span>
                        </div>
                    </div>
                    <div class="action-row">
                        <div class="action-icon">2</div>
                        <div>
                            <strong>再准备总结</strong>
                            <span>让本地 AI 读到的是最新版本</span>
                        </div>
                    </div>
                </div>
            </article>
            <article class="mini-card">
                <h3>当天概况</h3>
                <p>这一层只展示记录本身，不替代 AI 总结。</p>
                <div class="stat-list">
                    <div class="stat">
                        <strong>事件节点</strong>
                        <span>${escapeHtml(String(entries.length))}</span>
                    </div>
                    <div class="stat">
                        <strong>标签数量</strong>
                        <span>${escapeHtml(String(tagCount))}</span>
                    </div>
                    <div class="stat">
                        <strong>主要心情</strong>
                        <span>${escapeHtml(topMood)}</span>
                    </div>
                </div>
            </article>
            <article class="mini-card">
                <h3>搜索提示</h3>
                <p>${topTags[0]?.value ? `最近最常出现的标签是 ${escapeHtml(topTags[0].value)}，也可以直接从跨日期检索里找它。` : '当标签和心情慢慢积累起来，这里会变成你的快速回看提示。'}</p>
            </article>
        </div>
    `;
}

function renderWriteSupportCards(topMood, topTags) {
    return `
        <div class="drawer-card-stack">
            <section class="panel write-info-card">
                <h3>当天概况</h3>
                <p>保存后，本地 AI 会读取当天全部节点，为你生成日总结。</p>
                <div class="stat-list">
                    <div class="stat">
                        <strong>当前主情绪</strong>
                        <span>${escapeHtml(topMood)}</span>
                    </div>
                    <div class="stat">
                        <strong>高频标签</strong>
                        <span>${escapeHtml(topTags[0]?.value || '暂时没有')}</span>
                    </div>
                    <div class="stat">
                        <strong>推荐动作</strong>
                        <span>写完当前节点，再决定是否新增下一条</span>
                    </div>
                </div>
            </section>
            <section class="panel write-info-card">
                <h3>记录提示</h3>
                <p>每条记录只写一个场景，后面无论回看还是提炼都会更清楚。</p>
                <div class="prompt-list">
                    <div class="prompt-item">
                        <strong>补触发点</strong>
                        <span>写清楚这件事是怎么开始的。</span>
                    </div>
                    <div class="prompt-item">
                        <strong>带上身体感受</strong>
                        <span>疲惫、松弛、紧绷都值得被记下来。</span>
                    </div>
                    <div class="prompt-item">
                        <strong>沉淀可复用标签</strong>
                        <span>把有效做法收进标签，后面会更好搜索。</span>
                    </div>
                </div>
            </section>
        </div>
    `;
}

function renderSummarySupportCards(summary, latestHighlight, latestConcern, summaryTypeLabel, targetDate, period) {
    return `
        <div class="drawer-card-stack">
            <section class="panel write-info-card">
                <h3>分类提取</h3>
                <p>这里把本地 AI 回传的结果拆成亮点、做法、提醒和明日动作。</p>
                <div class="prompt-list">
                    <div class="prompt-item">
                        <strong>亮点提取</strong>
                        <span>${escapeHtml(latestHighlight)}</span>
                    </div>
                    <div class="prompt-item">
                        <strong>关注提醒</strong>
                        <span>${escapeHtml(latestConcern)}</span>
                    </div>
                    <div class="prompt-item">
                        <strong>明日动作</strong>
                        <span>${escapeHtml(summary?.one_line || '等待本地 AI 回传结果后显示')}</span>
                    </div>
                </div>
            </section>
            <section class="panel write-info-card">
                <h3>生成记录</h3>
                <p>总结会保存到本地 SQLite，再次生成会覆盖旧结果。</p>
                <div class="history-list">
                    <div class="history-row">
                        <span>总结类型</span>
                        <strong>${escapeHtml(summaryTypeLabel)}</strong>
                    </div>
                    <div class="history-row">
                        <span>目标日期</span>
                        <strong>${escapeHtml(formatSummaryPeriodLabel(period) || targetDate)}</strong>
                    </div>
                    <div class="history-row">
                        <span>保存状态</span>
                        <strong>${summary ? '已保存' : '待生成'}</strong>
                    </div>
                </div>
            </section>
        </div>
    `;
}

function renderActiveDrawer() {
    if (!state.activeDrawer) {
        return '';
    }

    const entries = state.timelineEntries || [];
    const topMood = countValues(state.dayEntries.length > 0 ? state.dayEntries : entries, (entry) => entry.mood)[0]?.value || '未设置';
    const topTags = countValues(
        (state.dayEntries.length > 0 ? state.dayEntries : entries)
            .flatMap((entry) => parseTags(entry.tags || []))
            .map((tag) => ({ tag })),
        (item) => item.tag
    );
    const tagCount = entries.reduce((sum, entry) => sum + parseTags(entry.tags || []).length, 0);
    const summary = state.summaryData?.content_json || null;
    const summaryTypeLabel = getSummaryTypeLabel(state.summaryType);
    const targetDate = getSummaryTargetDate();
    const period = state.summaryPeriod || null;
    const latestHighlight = summary?.highlights?.[0] || '还没有提炼出亮点。';
    const latestConcern = summary?.concerns?.[0] || '暂时没有明显需要关注的问题。';

    const drawerMap = {
        'timeline-search': {
            title: '跨日期检索',
            wide: true,
            body: renderGlobalSearchPanel()
        },
        'timeline-insights': {
            title: '时间轴侧边信息',
            body: renderTimelineInsightCards(entries, tagCount, topMood, topTags)
        },
        'write-support': {
            title: '写记录辅助信息',
            body: renderWriteSupportCards(topMood, topTags)
        },
        'summary-support': {
            title: '总结补充信息',
            body: renderSummarySupportCards(summary, latestHighlight, latestConcern, summaryTypeLabel, targetDate, period)
        },
        'summary-task': {
            title: '本地 AI 任务',
            wide: true,
            body: renderSummaryTaskPanel()
        }
    };

    const drawer = drawerMap[state.activeDrawer];
    if (!drawer) {
        return '';
    }

    return `
        <div class="drawer-backdrop" onclick="closeDrawer()">
            <aside class="drawer-panel ${drawer.wide ? 'wide' : ''}" onclick="event.stopPropagation()">
                <div class="drawer-header">
                    <div>
                        <div class="eyebrow">辅助面板</div>
                        <h3 class="drawer-title">${escapeHtml(drawer.title)}</h3>
                    </div>
                    <button class="drawer-close" type="button" aria-label="关闭抽屉" onclick="closeDrawer()">×</button>
                </div>
                <div class="drawer-body">
                    ${drawer.body}
                </div>
            </aside>
        </div>
    `;
}

function renderWrite() {
    const currentEntry = normalizeEntry(findSelectedEntry() || createEmptyEntry());
    const currentIndex = state.dayEntries.findIndex((entry) => entry.id === currentEntry.id);
    const totalImages = state.dayEntries.reduce((sum, entry) => sum + (entry.images?.length || 0) + (entry.pendingImages?.length || 0), 0);
    const pendingImages = state.dayEntries.reduce((sum, entry) => sum + (entry.pendingImages?.length || 0), 0);
    const topMood = countValues(state.dayEntries, (entry) => entry.mood)[0]?.value || '未设置';
    const topTags = countValues(
        state.dayEntries.flatMap((entry) => parseTags(entry.tags || []))
            .map((tag) => ({ tag })),
        (item) => item.tag
    );
    const writeHint = currentEntry.title || currentEntry.content
        ? '先把当前节点写完整，再考虑新增下一条。'
        : '先写时间、标题、两句话正文，保存后再补图片。';

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
            <section class="card write-hero">
                <div class="write-hero-head">
                    <div>
                        <div class="eyebrow">${escapeHtml(state.selectedDate || getToday())} · 今日记录</div>
                        <h3 class="write-hero-title">每个节点独立记录时间、心情、正文、图片和标签。</h3>
                        <p class="write-hero-copy">${escapeHtml(writeHint)}</p>
                    </div>
                    <div class="hero-pill">${currentEntry.title ? `当前：${escapeHtml(currentEntry.title)}` : '从一个具体场景开始'}</div>
                </div>
                <div class="quick-grid">
                    <div class="quick-item">
                        <strong>节点数量</strong>
                        <span>${escapeHtml(String(state.dayEntries.length))} 条</span>
                    </div>
                    <div class="quick-item">
                        <strong>图片总数</strong>
                        <span>${escapeHtml(String(totalImages))} 张</span>
                    </div>
                    <div class="quick-item">
                        <strong>待上传</strong>
                        <span>${escapeHtml(String(pendingImages))} 张</span>
                    </div>
                </div>
            </section>
            <div class="write-workspace">
                <section class="panel">
                    <div class="timeline-head">
                        <div>
                            <h3>事件节点</h3>
                            <div class="field-help">按时间排序，点击左侧节点后，在右边编辑。</div>
                        </div>
                        <button class="button-secondary" onclick="addEntry()">新增</button>
                    </div>
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
                <section class="panel write-editor-panel">
                    <div class="card-head timeline-panel-head">
                        <div class="card-title">
                            <div class="icon">📝</div>
                            <h3>当前节点编辑区</h3>
                        </div>
                        <div class="field-help">当前编辑：${escapeHtml(currentEntry.title || `节点 ${Math.max(currentIndex + 1, 1)}`)}</div>
                    </div>
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
                <aside class="write-side-panel">
                    <section class="panel write-info-card">
                        <h3>当天概况</h3>
                        <p>记录完成后，本地 AI 会读取当天全部节点生成日总结。</p>
                        <div class="stat-list">
                            <div class="stat">
                                <strong>事件节点</strong>
                                <span>${escapeHtml(String(state.dayEntries.length))}</span>
                            </div>
                            <div class="stat">
                                <strong>主要心情</strong>
                                <span>${escapeHtml(topMood)}</span>
                            </div>
                            <div class="stat">
                                <strong>高频标签</strong>
                                <span>${escapeHtml(topTags[0]?.value || '暂无')}</span>
                            </div>
                        </div>
                    </section>
                    <section class="panel write-info-card">
                        <h3>记录提示</h3>
                        <p>每条记录只写一个场景，方便后续回看和提炼。</p>
                        <div class="prompt-list">
                            <div class="prompt-item">
                                <strong>补充触发点</strong>
                                <span>把开始这件事的原因写清楚。</span>
                            </div>
                            <div class="prompt-item">
                                <strong>记录身体感受</strong>
                                <span>写下疲惫、放松或紧绷。</span>
                            </div>
                            <div class="prompt-item">
                                <strong>留下可复用标签</strong>
                                <span>把有效做法沉淀成标签，后续更好搜索。</span>
                            </div>
                        </div>
                    </section>
                </aside>
            </div>
            <div class="footer-note" id="writeSaveNote"></div>
        </div>
    `;
}

function renderSummaries() {
    const summary = state.summaryData?.content_json || null;
    const sourceStats = summary?.source_stats || state.summarySourceStats || null;
    const period = state.summaryPeriod || null;
    const summaryTypeLabel = getSummaryTypeLabel(state.summaryType);
    const loadingText = state.summaryLoading ? '准备中...' : '准备任务';
    const targetDate = getSummaryTargetDate();
    const latestKeyPoint = summary?.key_points?.[0] || '还没有关键点。';
    const latestHighlight = summary?.highlights?.[0] || '还没有提炼出亮点。';
    const latestConcern = summary?.concerns?.[0] || '暂时没有明显需要关注的问题。';
    const keywords = [
        ...(summary?.key_points || []),
        ...(summary?.highlights || []),
        summary?.one_line || ''
    ]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 5);

    return `
        <div class="page">
            <div class="page-header">
                <div>
                    <h2 class="page-title">AI 总结</h2>
                    <div class="page-subtitle">平台只负责取数、模板和保存结果，本地 AI 负责真正生成总结。</div>
                </div>
                <div class="page-actions">
                    <button class="button-ghost" onclick="refreshSummary()">刷新</button>
                    <button class="button-secondary" onclick="prepareSummaryTask()">${loadingText}</button>
                </div>
            </div>
            <section class="card summary-hero-card">
                <div class="write-hero-head">
                    <div>
                        <div class="eyebrow">${escapeHtml(summaryTypeLabel)} · ${escapeHtml(formatSummaryPeriodLabel(period) || targetDate)}</div>
                        <h3 class="write-hero-title">平台负责取数和保存，本地 AI 负责真正生成提炼结果。</h3>
                        <p class="write-hero-copy">${escapeHtml(summary?.overview || '先准备任务，再把结果回传平台，这页就会逐渐长成一张可回看的总结页。')}</p>
                    </div>
                    <div class="hero-pill">${summary ? '已保存本地数据库' : '等待回传结果'}</div>
                </div>
                <div class="quick-grid">
                    <div class="quick-item">
                        <strong>来源节点</strong>
                        <span>${escapeHtml(String(sourceStats?.entry_count ?? sourceStats?.entryCount ?? 0))} 条</span>
                    </div>
                    <div class="quick-item">
                        <strong>来源天数</strong>
                        <span>${escapeHtml(String(sourceStats?.day_count ?? sourceStats?.dayCount ?? 0))} 天</span>
                    </div>
                    <div class="quick-item">
                        <strong>图片路径</strong>
                        <span>${escapeHtml(String(sourceStats?.image_count ?? sourceStats?.imageCount ?? 0))} 张</span>
                    </div>
                </div>
            </section>
            <div class="summary-workspace">
                <aside class="panel summary-control-panel">
                    <div class="card-head timeline-panel-head">
                        <div class="card-title">
                            <div class="icon">🧭</div>
                            <h3>总结维度</h3>
                        </div>
                    </div>
                    <div class="summary-tab-stack">
                        <button class="summary-option ${state.summaryType === 'daily' ? 'active' : ''}" onclick="changeSummaryType('daily')">
                            <strong>日总结</strong>
                            <span>读取当天全部事件节点</span>
                        </button>
                        <button class="summary-option ${state.summaryType === 'weekly' ? 'active' : ''}" onclick="changeSummaryType('weekly')">
                            <strong>周总结</strong>
                            <span>聚合本周全部记录</span>
                        </button>
                        <button class="summary-option ${state.summaryType === 'monthly' ? 'active' : ''}" onclick="changeSummaryType('monthly')">
                            <strong>月总结</strong>
                            <span>汇总本月主题与趋势</span>
                        </button>
                    </div>
                    <div class="summary-inputs">
                        ${state.summaryType === 'monthly' ? `
                            <input type="month" value="${escapeHtml(state.summaryMonthKey || getMonthKey(state.summaryAnchorDate || state.selectedDate))}" onchange="changeSummaryMonth(this.value)">
                        ` : `
                            <input type="date" value="${escapeHtml(state.summaryAnchorDate || state.selectedDate || getToday())}" onchange="changeSummaryDate(this.value)">
                        `}
                    </div>
                    <div class="summary-source-box">
                        <h4>生成来源</h4>
                        <p>本次读取 ${escapeHtml(String(sourceStats?.entry_count ?? sourceStats?.entryCount ?? 0))} 个事件节点与 ${escapeHtml(String(sourceStats?.image_count ?? sourceStats?.imageCount ?? 0))} 张图片路径，图片不参与 AI 分析。</p>
                        <button class="button" onclick="prepareSummaryTask()" style="width:100%;">${loadingText}</button>
                    </div>
                </aside>
                <section class="panel summary-main-panel">
                    <div class="card-head timeline-panel-head">
                        <div class="card-title">
                            <div class="icon">✨</div>
                            <h3>${escapeHtml(formatSummaryPeriodLabel(period) || targetDate)} ${escapeHtml(summaryTypeLabel)}</h3>
                        </div>
                        <button class="button-ghost" onclick="copySummaryTask()">复制任务 JSON</button>
                    </div>
                    ${summary ? `
                        <div class="summary-stats-row">
                            <div class="summary-mini-meta">
                                <span>事件节点</span>
                                <strong>${escapeHtml(String(sourceStats?.entry_count ?? sourceStats?.entryCount ?? 0))}</strong>
                            </div>
                            <div class="summary-mini-meta">
                                <span>当前提醒</span>
                                <strong>${escapeHtml(latestConcern)}</strong>
                            </div>
                            <div class="summary-mini-meta">
                                <span>总结版本</span>
                                <strong>覆盖保存</strong>
                            </div>
                        </div>
                        <div class="summary-keywords">
                            ${keywords.length > 0
                                ? keywords.map((item, index) => `<span class="summary-keyword ${index === 0 ? 'active' : ''}">${escapeHtml(truncateText(item, 18))}</span>`).join('')
                                : '<span class="summary-keyword active">等待关键词</span>'}
                        </div>
                        <div class="summary-content-grid">
                            <article class="summary-rich-card full">
                                <h4>概览</h4>
                                <p>${escapeHtml(summary.overview || '暂无概览')}</p>
                            </article>
                            <article class="summary-rich-card">
                                <h4>正向证据</h4>
                                <p>${escapeHtml(latestHighlight)}</p>
                            </article>
                            <article class="summary-rich-card">
                                <h4>值得重复的做法</h4>
                                <p>${escapeHtml(latestKeyPoint)}</p>
                            </article>
                            <article class="summary-rich-card">
                                <h4>需要减少的消耗源</h4>
                                <p>${escapeHtml(latestConcern)}</p>
                            </article>
                            <article class="summary-rich-card">
                                <h4>情绪状态</h4>
                                <p>${escapeHtml(summary.mood_trend || '暂无情绪趋势')}</p>
                            </article>
                            <article class="summary-rich-card full">
                                <h4>一句话总结</h4>
                                <p>${escapeHtml(summary.one_line || '点击准备任务后，本地 AI 生成的结果会显示在这里。')}</p>
                            </article>
                        </div>
                    ` : `
                        <div class="empty-state">
                            <div class="section-title">还没有回传结果</div>
                            <div class="empty-copy">先准备本地 AI 任务，然后由你的本地模型处理后，把结果 POST 回平台即可。</div>
                        </div>
                    `}
                </section>
                <aside class="summary-side-panel">
                    <section class="panel write-info-card">
                        <h3>分类提取</h3>
                        <p>按固定模板拆分亮点、做法、消耗和明日动作。</p>
                        <div class="prompt-list">
                            <div class="prompt-item">
                                <strong>亮点提取</strong>
                                <span>${escapeHtml(latestHighlight)}</span>
                            </div>
                            <div class="prompt-item">
                                <strong>关注提醒</strong>
                                <span>${escapeHtml(latestConcern)}</span>
                            </div>
                            <div class="prompt-item">
                                <strong>明日动作</strong>
                                <span>${escapeHtml(summary?.one_line || '等待本地 AI 生成后显示')}</span>
                            </div>
                        </div>
                    </section>
                    <section class="panel write-info-card">
                        <h3>生成记录</h3>
                        <p>总结内容已保存到本地 SQLite，重新生成会覆盖旧结果。</p>
                        <div class="history-list">
                            <div class="history-row">
                                <span>总结类型</span>
                                <strong>${escapeHtml(summaryTypeLabel)}</strong>
                            </div>
                            <div class="history-row">
                                <span>目标日期</span>
                                <strong>${escapeHtml(formatSummaryPeriodLabel(period) || targetDate)}</strong>
                            </div>
                            <div class="history-row">
                                <span>保存状态</span>
                                <strong>${summary ? '已保存' : '待生成'}</strong>
                            </div>
                        </div>
                    </section>
                </aside>
            </div>
            ${renderSummaryTaskPanel()}
            <div class="footer-note">
                ${state.summaryError ? `当前有错误：${escapeHtml(state.summaryError)}` : '总结结果来自本地 AI 回传，平台不会在后端直接跑模型。'}
            </div>
        </div>
    `;
}

function renderTimeline() {
    const entries = state.timelineEntries || [];
    const selectedMonth = state.selectedMonth || getMonthKey(state.selectedDate);
    const imageCount = entries.reduce((sum, entry) => sum + (Array.isArray(entry.images) ? entry.images.length : 0), 0);
    const moodCounts = countValues(entries, (entry) => entry.mood);
    const topMood = moodCounts[0]?.value || '未设置';
    const filledEntries = entries.filter((entry) => String(entry.content || entry.title || '').trim());
    const imageEntries = entries.filter((entry) => (entry.images || []).length > 0);
    const taggedEntries = entries.filter((entry) => parseTags(entry.tags || []).length > 0);
    const topTags = countValues(
        entries.flatMap((entry) => parseTags(entry.tags || []))
            .map((tag) => ({ tag })),
        (item) => item.tag
    );
    const visibleEntries = getVisibleTimelineEntries(entries);
    const filterOptions = [
        { id: 'all', label: `全部 ${entries.length}` },
        { id: 'filled', label: `有内容 ${filledEntries.length}` },
        { id: 'images', label: `有图片 ${imageEntries.length}` },
        { id: 'tags', label: `有标签 ${taggedEntries.length}` }
    ];
    const moodOptions = moodCounts.slice(0, 2).map((item) => ({
        id: `mood:${item.value}`,
        label: `${item.value} ${item.count}`
    }));
    const query = String(state.globalSearchQuery || '').trim();
    const resultCount = Array.isArray(state.globalSearchResults) ? state.globalSearchResults.length : 0;

    return `
        <div class="page page-workbench timeline-page">
            <div class="page-header">
                <div>
                    <h2 class="page-title">时间轴</h2>
                    <div class="page-subtitle">用月历快速定位日期，再顺着节点回看当天。</div>
                </div>
                <div class="page-actions">
                    <input type="date" value="${escapeHtml(state.selectedDate)}" onchange="changeSelectedDate(this.value, true)">
                    <input type="month" value="${escapeHtml(selectedMonth)}" onchange="changeMonth(this.value)">
                </div>
            </div>
            <section class="card workbench-banner">
                <div class="workbench-banner-main">
                    <div>
                        <div class="eyebrow">${escapeHtml(state.selectedDate || getToday())}</div>
                        <h3 class="workbench-banner-title">主画面只留月历和节点，跨日期检索与侧边提示都收进抽屉里。</h3>
                        <p class="workbench-banner-copy">这样浏览时更像一张单屏工作台，不需要一直上下滚动。</p>
                    </div>
                    <div class="workbench-banner-actions">
                        <button class="button-secondary drawer-launch" onclick="openDrawer('timeline-search')">
                            跨日期检索
                            <span>${query ? `${resultCount} 条` : '打开'}</span>
                        </button>
                        <button class="button-secondary drawer-launch" onclick="openDrawer('timeline-insights')">
                            当天洞察
                            <span>${escapeHtml(topTags[0]?.value || topMood)}</span>
                        </button>
                        <button class="button" onclick="prepareSummaryTask()">准备日总结</button>
                    </div>
                </div>
                <div class="workbench-metrics">
                    <div class="quick-item compact">
                        <strong>节点</strong>
                        <span>${escapeHtml(String(entries.length))}</span>
                    </div>
                    <div class="quick-item compact">
                        <strong>图片</strong>
                        <span>${escapeHtml(String(imageCount))}</span>
                    </div>
                    <div class="quick-item compact">
                        <strong>心情</strong>
                        <span>${escapeHtml(topMood)}</span>
                    </div>
                    <div class="quick-item compact">
                        <strong>高频标签</strong>
                        <span>${escapeHtml(topTags[0]?.value || '暂无')}</span>
                    </div>
                </div>
            </section>
            <div class="timeline-shell workbench-grid">
                <aside class="timeline-sidebar">
                    ${renderTimelineCalendar()}
                </aside>
                <section class="panel timeline-detail-panel scroll-panel">
                    <div class="timeline-head">
                        <div>
                            <h3>当天事件节点</h3>
                            <div class="field-help">当前日期：${escapeHtml(state.selectedDate || '--')}</div>
                        </div>
                        <div class="timeline-results-meta">
                            <strong>${escapeHtml(String(visibleEntries.length))}</strong>
                            <span>/ ${escapeHtml(String(entries.length))} 条</span>
                        </div>
                    </div>
                    <div class="timeline-search-strip compact-strip">
                        <div class="timeline-search-row">
                            <input
                                class="timeline-search-input"
                                type="search"
                                value="${escapeHtml(state.timelineQuery)}"
                                placeholder="搜索当前日期的标题、正文、标签、心情"
                                oninput="setTimelineQuery(this.value)"
                                onkeydown="handleTimelineSearchKeydown(event)"
                            >
                            <button class="button-secondary" onclick="applyTimelineSearch()">筛选</button>
                            <button class="mini-button" onclick="clearTimelineFilters()">清空</button>
                        </div>
                        <div class="timeline-filter-row">
                            ${filterOptions.map((option) => `
                                <button
                                    class="filter-chip ${state.timelineFilter === option.id ? 'active' : ''}"
                                    onclick="setTimelineFilter('${option.id}')"
                                >${escapeHtml(option.label)}</button>
                            `).join('')}
                            ${moodOptions.map((option) => `
                                <button
                                    class="filter-chip ${state.timelineFilter === option.id ? 'active' : ''}"
                                    onclick="setTimelineFilter('${escapeHtml(option.id)}')"
                                >${escapeHtml(option.label)}</button>
                            `).join('')}
                        </div>
                    </div>
                    <div class="timeline-list timeline-event-list">
                        ${entries.length === 0 ? `
                            <div class="empty-state">
                                <div class="section-title">当天还没有记录</div>
                                <div class="empty-copy">切到“写记录”新增节点后，这里会回显时间、正文和图片。</div>
                            </div>
                        ` : visibleEntries.length === 0 ? `
                            <div class="empty-state">
                                <div class="section-title">没有匹配结果</div>
                                <div class="empty-copy">换个关键词，或者清空筛选后再看。</div>
                            </div>
                        ` : visibleEntries.map((entry) => `
                            <article class="timeline-item timeline-event ${state.selectedEntryId === entry.id ? 'active' : ''}">
                                <div class="timeline-event-marker"></div>
                                <div class="timeline-item-time timeline-time-box">
                                    <span class="timeline-time">${escapeHtml(entry.entry_time || '--:--')}</span>
                                    <span class="timeline-mood">${escapeHtml(entry.mood || '未设置')}</span>
                                </div>
                                <div class="timeline-event-body">
                                    <div class="timeline-item-title">${escapeHtml(entry.title || '未命名节点')}</div>
                                    <div class="timeline-item-copy">${escapeHtml(entry.content || '暂无正文')}</div>
                                    <div class="tag-row timeline-tags">
                                        ${parseTags(entry.tags || []).length > 0
                                            ? parseTags(entry.tags || []).map((tag, index) => `<span class="tag ${index % 2 === 1 ? 'orange' : ''}">${escapeHtml(tag)}</span>`).join('')
                                            : '<span class="tag">无标签</span>'}
                                    </div>
                                    ${renderTimelineImages(entry.images || [])}
                                </div>
                            </article>
                        `).join('')}
                    </div>
                </section>
            </div>
        </div>
    `;
}

function renderWrite() {
    const currentEntry = normalizeEntry(findSelectedEntry() || createEmptyEntry());
    const currentIndex = state.dayEntries.findIndex((entry) => entry.id === currentEntry.id);
    const totalImages = state.dayEntries.reduce((sum, entry) => sum + (entry.images?.length || 0) + (entry.pendingImages?.length || 0), 0);
    const pendingImages = state.dayEntries.reduce((sum, entry) => sum + (entry.pendingImages?.length || 0), 0);
    const topMood = countValues(state.dayEntries, (entry) => entry.mood)[0]?.value || '未设置';
    const topTags = countValues(
        state.dayEntries.flatMap((entry) => parseTags(entry.tags || []))
            .map((tag) => ({ tag })),
        (item) => item.tag
    );
    const writeHint = currentEntry.title || currentEntry.content
        ? '先把当前节点写完整，再考虑新增下一条。'
        : '先写时间、标题和两三句正文，保存后再补图片。';

    return `
        <div class="page page-workbench write-page">
            <div class="page-header">
                <div>
                    <h2 class="page-title">写记录</h2>
                    <div class="page-subtitle">一个节点只写一个场景，后面回看会更清楚。</div>
                </div>
                <div class="page-actions">
                    <input type="date" value="${escapeHtml(state.selectedDate)}" onchange="changeSelectedDate(this.value, false)">
                    <button class="button-ghost" onclick="addEntry()">新增节点</button>
                    <button class="button" onclick="saveDayEntries()">保存全部</button>
                </div>
            </div>
            <section class="card workbench-banner">
                <div class="workbench-banner-main">
                    <div>
                        <div class="eyebrow">${escapeHtml(state.selectedDate || getToday())} · 今日记录</div>
                        <h3 class="workbench-banner-title">写记录页压成两栏，概况和提示改到抽屉里。</h3>
                        <p class="workbench-banner-copy">${escapeHtml(writeHint)}</p>
                    </div>
                    <div class="workbench-banner-actions">
                        <button class="button-secondary drawer-launch" onclick="openDrawer('write-support')">
                            今日概况与提示
                            <span>${escapeHtml(topTags[0]?.value || topMood)}</span>
                        </button>
                        <button class="button-secondary" onclick="setRoute('timeline')">查看时间轴</button>
                    </div>
                </div>
                <div class="workbench-metrics">
                    <div class="quick-item compact">
                        <strong>节点</strong>
                        <span>${escapeHtml(String(state.dayEntries.length))}</span>
                    </div>
                    <div class="quick-item compact">
                        <strong>图片</strong>
                        <span>${escapeHtml(String(totalImages))}</span>
                    </div>
                    <div class="quick-item compact">
                        <strong>待上传</strong>
                        <span>${escapeHtml(String(pendingImages))}</span>
                    </div>
                    <div class="quick-item compact">
                        <strong>当前节点</strong>
                        <span>${escapeHtml(currentEntry.title || `节点 ${Math.max(currentIndex + 1, 1)}`)}</span>
                    </div>
                </div>
            </section>
            <div class="write-workspace compact-write-grid workbench-grid">
                <section class="panel write-list-panel scroll-panel">
                    <div class="timeline-head">
                        <div>
                            <h3>事件节点</h3>
                            <div class="field-help">左侧选节点，右侧编辑。</div>
                        </div>
                        <button class="button-secondary" onclick="addEntry()">新增</button>
                    </div>
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
                                <div class="empty-copy">${escapeHtml(entry.content || '点开后编辑当前节点内容')}</div>
                            </article>
                        `).join('')}
                    </div>
                </section>
                <section class="panel write-editor-panel scroll-panel">
                    <div class="card-head timeline-panel-head">
                        <div class="card-title">
                            <div class="icon">●</div>
                            <h3>当前节点编辑区</h3>
                        </div>
                        <div class="field-help">当前编辑：${escapeHtml(currentEntry.title || `节点 ${Math.max(currentIndex + 1, 1)}`)}</div>
                    </div>
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
                            <div class="field-help">支持多张图片，本地预览后会自动上传并回显。</div>
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
            <div class="footer-note compact-note" id="writeSaveNote"></div>
        </div>
    `;
}

function renderSummaries() {
    const summary = state.summaryData?.content_json || null;
    const sourceStats = summary?.source_stats || state.summarySourceStats || null;
    const period = state.summaryPeriod || null;
    const summaryTypeLabel = getSummaryTypeLabel(state.summaryType);
    const loadingText = state.summaryLoading ? '准备中...' : '准备任务';
    const targetDate = getSummaryTargetDate();
    const latestKeyPoint = summary?.key_points?.[0] || '还没有关键点。';
    const latestHighlight = summary?.highlights?.[0] || '还没有提炼出亮点。';
    const latestConcern = summary?.concerns?.[0] || '暂时没有明显需要关注的问题。';
    const keywords = [
        ...(summary?.key_points || []),
        ...(summary?.highlights || []),
        summary?.one_line || ''
    ]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 5);

    return `
        <div class="page page-workbench summary-page">
            <div class="page-header">
                <div>
                    <h2 class="page-title">AI 总结</h2>
                    <div class="page-subtitle">平台负责取数和保存，本地 AI 负责真正生成总结。</div>
                </div>
                <div class="page-actions">
                    <button class="button-ghost" onclick="refreshSummary()">刷新</button>
                    <button class="button-secondary" onclick="openDrawer('summary-task')">任务 JSON</button>
                    <button class="button" onclick="prepareSummaryTask()">${loadingText}</button>
                </div>
            </div>
            <section class="card workbench-banner">
                <div class="workbench-banner-main">
                    <div>
                        <div class="eyebrow">${escapeHtml(summaryTypeLabel)} · ${escapeHtml(formatSummaryPeriodLabel(period) || targetDate)}</div>
                        <h3 class="workbench-banner-title">控制条压进首屏，长说明和历史信息改到抽屉里。</h3>
                        <p class="workbench-banner-copy">${escapeHtml(summary?.overview || '先准备任务，再让本地 AI 跑完后把结果回传平台。')}</p>
                    </div>
                    <div class="workbench-banner-actions">
                        <button class="button-secondary drawer-launch" onclick="openDrawer('summary-support')">
                            提取与记录
                            <span>${escapeHtml(summary ? '已保存' : '待生成')}</span>
                        </button>
                        <button class="button-secondary" onclick="copySummaryTask()">复制任务</button>
                    </div>
                </div>
                <div class="summary-inline-toolbar">
                    <div class="summary-tab-stack compact-tabs">
                        <button class="summary-option ${state.summaryType === 'daily' ? 'active' : ''}" onclick="changeSummaryType('daily')">
                            <strong>日总结</strong>
                            <span>读取当天全部节点</span>
                        </button>
                        <button class="summary-option ${state.summaryType === 'weekly' ? 'active' : ''}" onclick="changeSummaryType('weekly')">
                            <strong>周总结</strong>
                            <span>聚合本周记录</span>
                        </button>
                        <button class="summary-option ${state.summaryType === 'monthly' ? 'active' : ''}" onclick="changeSummaryType('monthly')">
                            <strong>月总结</strong>
                            <span>汇总本月趋势</span>
                        </button>
                    </div>
                    <div class="summary-inline-actions">
                        <div class="summary-inputs compact-inputs">
                            ${state.summaryType === 'monthly' ? `
                                <input type="month" value="${escapeHtml(state.summaryMonthKey || getMonthKey(state.summaryAnchorDate || state.selectedDate))}" onchange="changeSummaryMonth(this.value)">
                            ` : `
                                <input type="date" value="${escapeHtml(state.summaryAnchorDate || state.selectedDate || getToday())}" onchange="changeSummaryDate(this.value)">
                            `}
                        </div>
                        <div class="workbench-metrics summary-mini-strip">
                            <div class="quick-item compact">
                                <strong>节点</strong>
                                <span>${escapeHtml(String(sourceStats?.entry_count ?? sourceStats?.entryCount ?? 0))}</span>
                            </div>
                            <div class="quick-item compact">
                                <strong>天数</strong>
                                <span>${escapeHtml(String(sourceStats?.day_count ?? sourceStats?.dayCount ?? 0))}</span>
                            </div>
                            <div class="quick-item compact">
                                <strong>图片路径</strong>
                                <span>${escapeHtml(String(sourceStats?.image_count ?? sourceStats?.imageCount ?? 0))}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <section class="panel summary-main-panel scroll-panel">
                <div class="card-head timeline-panel-head">
                    <div class="card-title">
                        <div class="icon">✓</div>
                        <h3>${escapeHtml(formatSummaryPeriodLabel(period) || targetDate)} ${escapeHtml(summaryTypeLabel)}</h3>
                    </div>
                    <div class="field-help">图片路径会带进任务，但不会直接参与分析。</div>
                </div>
                ${summary ? `
                    <div class="summary-stats-row">
                        <div class="summary-mini-meta">
                            <span>当前提醒</span>
                            <strong>${escapeHtml(latestConcern)}</strong>
                        </div>
                        <div class="summary-mini-meta">
                            <span>值得复用</span>
                            <strong>${escapeHtml(latestKeyPoint)}</strong>
                        </div>
                        <div class="summary-mini-meta">
                            <span>状态</span>
                            <strong>覆盖保存</strong>
                        </div>
                    </div>
                    <div class="summary-keywords">
                        ${keywords.length > 0
                            ? keywords.map((item, index) => `<span class="summary-keyword ${index === 0 ? 'active' : ''}">${escapeHtml(truncateText(item, 18))}</span>`).join('')
                            : '<span class="summary-keyword active">等待关键词</span>'}
                    </div>
                    <div class="summary-content-grid">
                        <article class="summary-rich-card full">
                            <h4>概览</h4>
                            <p>${escapeHtml(summary.overview || '暂无概览')}</p>
                        </article>
                        <article class="summary-rich-card">
                            <h4>正向证据</h4>
                            <p>${escapeHtml(latestHighlight)}</p>
                        </article>
                        <article class="summary-rich-card">
                            <h4>值得重复的做法</h4>
                            <p>${escapeHtml(latestKeyPoint)}</p>
                        </article>
                        <article class="summary-rich-card">
                            <h4>需要减少的消耗</h4>
                            <p>${escapeHtml(latestConcern)}</p>
                        </article>
                        <article class="summary-rich-card">
                            <h4>情绪状态</h4>
                            <p>${escapeHtml(summary.mood_trend || '暂无情绪趋势')}</p>
                        </article>
                        <article class="summary-rich-card full">
                            <h4>一句话总结</h4>
                            <p>${escapeHtml(summary.one_line || '点击准备任务后，本地 AI 生成的结果会显示在这里。')}</p>
                        </article>
                    </div>
                ` : `
                    <div class="empty-state">
                        <div class="section-title">还没有回传结果</div>
                        <div class="empty-copy">先准备本地 AI 任务，然后由你的本地模型处理完成后再 POST 回平台。</div>
                    </div>
                `}
            </section>
            <div class="footer-note compact-note">
                ${state.summaryError ? `当前有错误：${escapeHtml(state.summaryError)}` : '总结结果来自本地 AI 回传，平台不会直接在后端跑模型。'}
            </div>
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

    const dashboard = state.bootstrap?.data || {};
    const currentDate = dashboard.currentDate || getToday();
    const topbarDate = `${currentDate} ${getWeekdayLabel(currentDate)}`.trim();

    app.innerHTML = `
        <div class="shell">
            <header class="topbar">
                <div class="brand">
                    <div class="logo">记</div>
                    <div>
                        <h1 class="brand-title">日记记录平台</h1>
                        <div class="brand-subtitle">本地记录 · AI 总结 · 时间轴回看</div>
                    </div>
                </div>
                <div class="topbar-right">
                    <div class="top-actions">
                        <div class="date-chip">${escapeHtml(topbarDate)}</div>
                        <div class="top-search">
                            <input
                                class="top-search-input"
                                type="search"
                                value="${escapeHtml(state.globalSearchQuery)}"
                                placeholder="搜索记录、标签、心情"
                                oninput="setGlobalSearchQuery(this.value)"
                                onkeydown="handleGlobalSearchKeydown(event)"
                            >
                            <button class="button secondary" onclick="runGlobalSearch()">搜索</button>
                        </div>
                        <button class="button" onclick="openTodayWrite()">写今日记录</button>
                    </div>
                    <div class="topbar-status">${renderStatus()}</div>
                </div>
            </header>
            <nav class="tabs">
                ${renderTabs()}
            </nav>
            ${renderPage()}
            ${renderActiveDrawer()}
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
        await loadMonthData(state.selectedMonth || getMonthKey(state.selectedDate), { silent: true });
        if (state.route === 'summaries') {
            syncSummaryDraftState();
            await loadSummaryData({ silent: true });
        }
    } catch (error) {
        state.health = {
            success: false,
            error: error.message
        };
    }

    renderApp();
}

function renderApp() {
    const app = document.getElementById('app');
    if (!app) {
        return;
    }

    const dashboard = state.bootstrap?.data || {};
    const currentDate = dashboard.currentDate || getToday();
    const topbarDate = `${currentDate} ${getWeekdayLabel(currentDate)}`.trim();

    if (state.route === 'write') {
        app.innerHTML = `
            <div class="write-prototype-app">
                <div class="app">
                <header class="topbar">
                    <div class="brand">
                        <div class="logo">写</div>
                        <div>
                            <h1 class="brand-title">日记记录平台</h1>
                            <div class="brand-subtitle">本地记录 · AI 总结 · 时间轴回看</div>
                        </div>
                    </div>
                    <nav class="tabs">
                        ${renderTabs()}
                    </nav>

                    <div class="top-actions">
                        <button class="button secondary" onclick="setRoute('timeline')">返回时间轴</button>
                        <button class="button" onclick="saveDayEntries()">保存全部</button>
                    </div>
                </header>

                ${renderPage()}
                </div>
            </div>
        `;
        return;
    }

    app.innerHTML = `
        <div class="shell">
            <header class="topbar topbar-compact">
                <div class="brand">
                    <div class="logo">记</div>
                    <div class="brand-copy">
                        <h1 class="brand-title">日记记录平台</h1>
                        <div class="brand-subtitle">本地记录 · AI 总结 · 时间轴回看</div>
                    </div>
                </div>
                <nav class="tabs tabs-inline topbar-nav">
                    ${renderTabs()}
                </nav>
                <div class="topbar-tools">
                    <div class="date-chip">${escapeHtml(topbarDate)}</div>
                    <div class="top-search">
                        <input
                            class="top-search-input"
                            type="search"
                            value="${escapeHtml(state.globalSearchQuery)}"
                            placeholder="搜索记录、标签、心情"
                            oninput="setGlobalSearchQuery(this.value)"
                            onkeydown="handleGlobalSearchKeydown(event)"
                        >
                        <button class="button secondary" onclick="runGlobalSearch()">搜索</button>
                    </div>
                    <button class="button topbar-write" onclick="openTodayWrite()">写今日记录</button>
                    <div class="topbar-status">${renderStatus()}</div>
                </div>
            </header>
            ${renderPage()}
            ${renderActiveDrawer()}
        </div>
    `;
}

function renderWrite() {
    const currentEntry = normalizeEntry(findSelectedEntry() || createEmptyEntry());
    const currentIndex = state.dayEntries.findIndex((entry) => entry.id === currentEntry.id);
    const currentEntrySummary = `${String(currentEntry.entry_time || '--:--').trim()}${currentEntry.title ? ` ${String(currentEntry.title).trim()}` : ''}`.trim() || `节点 ${Math.max(currentIndex + 1, 1)}`;
    const imageItems = [
        ...(currentEntry.images || []).map((image) => ({ ...image, kind: 'saved' })),
        ...(currentEntry.pendingImages || []).map((image) => ({ ...image, kind: 'pending' }))
    ];
    const tagChips = (Array.isArray(currentEntry.tags) && currentEntry.tags.length > 0)
        ? currentEntry.tags
        : ['开心', '成就', '能源来源', '复盘', '完成感'];
    const previewEntries = [...state.dayEntries.slice(0, 3)];
    while (previewEntries.length < 3) {
        previewEntries.push(null);
    }

    return `
        <div class="page write-prototype">
            <section class="hero">
                <div class="title-block">
                    <h1>写记录</h1>
                    <p class="subtitle">按事件节点录入</p>
                </div>

                <div class="conclusion">
                    <p>今天已记录 ${escapeHtml(String(state.dayEntries.length))} 个节点，当前编辑 ${escapeHtml(currentEntrySummary)}。先写事实，再补心情、标签和图片。</p>
                </div>

                <div class="actions">
                    <div class="action"><strong>新增</strong>一个独立事件节点。</div>
                    <div class="action"><strong>填写</strong>时间标题和正文。</div>
                    <div class="action"><strong>上传</strong>节点相关图片。</div>
                    <div class="action"><strong>保存</strong>后生成当天总结。</div>
                </div>
            </section>

            <section class="workspace">
                <aside class="panel">
                    <div class="panel-head">
                        <div>
                            <div class="panel-title">事件节点</div>
                            <div class="panel-sub">按当天顺序排列</div>
                        </div>
                        <button class="btn btn-primary" onclick="addEntry()">新增</button>
                    </div>

                    <div class="node-body">
                        <div class="date-pill">
                            <strong>${escapeHtml(state.selectedDate || getToday())}</strong>
                            <span>${escapeHtml(String(state.dayEntries.length))}条记录</span>
                        </div>

                        <div class="node-list">
                            ${previewEntries.map((entry, index) => {
                                if (!entry) {
                                    return `
                                        <article class="node placeholder" onclick="addEntry()">
                                            <div class="node-time">＋</div>
                                            <div class="node-main">
                                                <strong>待记录</strong>
                                                <span>继续补充今天的片段。</span>
                                            </div>
                                        </article>
                                    `;
                                }

                                return `
                                    <article class="node ${currentEntry.id === entry.id ? 'active' : ''}" onclick="selectEntry('${entry.id}')">
                                        <div class="node-time">${escapeHtml(entry.entry_time || '--:--')}</div>
                                        <div class="node-main">
                                            <strong>${escapeHtml(entry.title || `节点 ${index + 1}`)}</strong>
                                            <span>${escapeHtml(entry.content || '点开后继续编辑。')}</span>
                                        </div>
                                    </article>
                                `;
                            }).join('')}
                            <article class="node">
                                <div class="node-time">＋</div>
                                <div class="node-main">
                                    <strong>新增下一条</strong>
                                    <span>补录遗漏片段。</span>
                                </div>
                            </article>
                        </div>

                        <div class="node-tools">
                            <button class="btn btn-secondary" onclick="moveEntry('${currentEntry.id}', -1)" ${currentIndex <= 0 ? 'disabled' : ''}>上移</button>
                            <button class="btn btn-secondary" onclick="moveEntry('${currentEntry.id}', 1)" ${currentIndex < 0 || currentIndex >= state.dayEntries.length - 1 ? 'disabled' : ''}>下移</button>
                            <button class="btn btn-danger" onclick="removeSelectedEntry()">删除</button>
                        </div>
                    </div>
                </aside>

                <section class="panel">
                    <div class="panel-head">
                        <div>
                            <div class="panel-title">当前节点编辑</div>
                            <div class="panel-sub">纯文本与图片上传</div>
                        </div>
                        <button class="btn btn-secondary">保存状态：已保存</button>
                    </div>

                    <div class="editor-body">
                        <div class="form-grid">
                            <div class="field">
                                <label>时间</label>
                                <input class="input" type="time" value="${escapeHtml(currentEntry.entry_time || '')}" oninput="updateSelectedEntryField('entry_time', this.value)">
                            </div>
                            <div class="field">
                                <label>心情</label>
                                <select class="input" oninput="updateSelectedEntryField('mood', this.value)">
                                    <option value="" ${currentEntry.mood ? '' : 'selected'}>未设置</option>
                                    <option value="平静" ${currentEntry.mood === '平静' ? 'selected' : ''}>平静</option>
                                    <option value="开心" ${currentEntry.mood === '开心' ? 'selected' : ''}>开心</option>
                                    <option value="疲惫" ${currentEntry.mood === '疲惫' ? 'selected' : ''}>疲惫</option>
                                    <option value="专注" ${currentEntry.mood === '专注' ? 'selected' : ''}>专注</option>
                                </select>
                            </div>
                            <div class="field">
                                <label>标题</label>
                                <input class="input" type="text" value="${escapeHtml(currentEntry.title || '')}" oninput="updateSelectedEntryField('title', this.value)">
                            </div>
                        </div>

                        <div class="text-area-wrap">
                            <div class="text-head">
                                <label>正文</label>
                                <span>建议写事实、感受、原因</span>
                            </div>
                            <textarea class="textarea" oninput="updateSelectedEntryField('content', this.value)">${escapeHtml(currentEntry.content || '')}</textarea>
                        </div>

                        <div class="asset-row">
                            <div class="upload">上传图片</div>
                            <div class="thumbs">
                                ${imageItems.length > 0 ? imageItems.slice(0, 4).map((image) => `
                                    <div class="thumb">
                                        <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.file_name || '图片')}" />
                                    </div>
                                `).join('') : `
                                    <div class="thumb empty">缩略图</div>
                                    <div class="thumb empty">缩略图</div>
                                    <div class="thumb empty">待添加</div>
                                    <div class="thumb empty">待添加</div>
                                `}
                            </div>
                        </div>

                        <div class="tag-row">
                            <div class="chips">
                                ${tagChips.map((tag, index) => `
                                    <span class="chip ${index === 0 || index === 4 ? 'green' : index === 2 ? 'orange' : ''}">${escapeHtml(tag)}</span>
                                `).join('')}
                            </div>
                            <div class="save-box">
                                <button class="btn btn-secondary" onclick="saveDayEntries()">保存节点</button>
                                <button class="btn btn-primary" onclick="addEntry()">新增下一条</button>
                            </div>
                        </div>
                    </div>
                </section>

                <aside class="panel">
                    <div class="panel-head">
                        <div>
                            <div class="panel-title">辅助录入</div>
                            <div class="panel-sub">分类、检查与进度</div>
                        </div>
                    </div>

                    <div class="assist-body">
                        <section class="assist-card">
                            <h2>事件分类</h2>
                            <p>给节点打标，后续AI按类别提炼。</p>
                            <div class="quick-tags">
                                ${['开心', '成就', '消耗', '能源来源', '被照顾', '复盘'].map((tag, index) => `
                                    <div class="quick-tag ${index === 0 ? 'green' : index === 1 || index === 5 ? 'active' : index === 3 ? 'orange' : ''}">${escapeHtml(tag)}</div>
                                `).join('')}
                            </div>
                        </section>

                        <section class="assist-card">
                            <h2>记录检查</h2>
                            <p>保存前确认关键字段完整。</p>
                            <div class="check-list">
                                <div class="check">
                                    <i>✓</i>
                                    <span>填写时间与标题。</span>
                                </div>
                                <div class="check">
                                    <i>✓</i>
                                    <span>正文包含事实和感受。</span>
                                </div>
                                <div class="check">
                                    <i>✓</i>
                                    <span>已选择心情和标签。</span>
                                </div>
                            </div>
                            <div class="progress" style="margin-top:10px;">
                                <div class="progress-item">
                                    <span>完整度</span>
                                    <div class="bar"><i style="width:${currentEntry.title || currentEntry.content ? '92%' : '55%'};"></i></div>
                                    <strong>${currentEntry.title || currentEntry.content ? '92%' : '55%'}</strong>
                                </div>
                                <div class="progress-item">
                                    <span>节点数</span>
                                    <div class="bar"><i style="width:${Math.min(Math.max(state.dayEntries.length * 20, 20), 100)}%;"></i></div>
                                    <strong>${escapeHtml(String(state.dayEntries.length))}条</strong>
                                </div>
                            </div>
                        </section>
                    </div>
                </aside>
            </section>
        </div>
    `;
}

async function loadDayData(recordDate, options = {}) {
    const targetDate = recordDate || state.selectedDate || getToday();
    state.selectedDate = targetDate;
    state.selectedMonth = getMonthKey(targetDate);

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

        if (!options.silent) {
            renderApp();
        }
    }
}

async function loadMonthData(monthKey, options = {}) {
    const targetMonth = monthKey || state.selectedMonth || getMonthKey(state.selectedDate);
    state.selectedMonth = targetMonth;

    try {
        const result = await api.getMonthDays(targetMonth);
        applyMonthData(result);
    } catch (error) {
        state.monthOverview = {
            success: false,
            error: error.message,
            data: {
                month: targetMonth,
                recordedDayCount: 0,
                totalEntries: 0,
                days: []
            }
        };
    }

    if (!options.silent) {
        renderApp();
    }
}

async function loadSummaryData(options = {}) {
    const targetDate = getSummaryTargetDate();
    const summaryType = state.summaryType || 'daily';

    state.summaryLoading = true;
    state.summaryError = '';

    try {
        const result = await api.getSummary({
            summaryType,
            targetDate
        });

        applySummaryData(result);
    } catch (error) {
        state.summaryLoading = false;
        state.summaryError = error.message;
        state.summaryData = null;
        state.summaryTask = null;
        state.summarySourceStats = null;
        state.summaryPeriod = null;
    }

    if (!options.silent) {
        renderApp();
    }
}

async function refreshSummary() {
    await loadSummaryData({ silent: false });
}

async function prepareSummaryTask() {
    const targetDate = getSummaryTargetDate();
    const summaryType = state.summaryType || 'daily';

    state.summaryLoading = true;
    state.summaryError = '';
    renderApp();

    try {
        const result = await api.getSummaryTask({
            summaryType,
            targetDate
        });
        applySummaryData(result);
        if (state.route === 'summaries') {
            state.activeDrawer = 'summary-task';
        }
        renderApp();
    } catch (error) {
        state.summaryLoading = false;
        state.summaryError = error.message;
        renderApp();
    }
}

async function copySummaryTask() {
    const task = state.summaryTask;
    if (!task) {
        return;
    }

    try {
        await navigator.clipboard.writeText(JSON.stringify(task, null, 2));
        state.summaryError = '';
        renderApp();
    } catch (error) {
        state.summaryError = `复制失败：${error.message}`;
        renderApp();
    }
}

async function changeSummaryType(summaryType) {
    state.summaryType = summaryType;
    state.summaryAnchorDate = state.selectedDate || state.summaryAnchorDate || getToday();
    state.summaryMonthKey = getMonthKey(state.summaryAnchorDate);
    await loadSummaryData({ silent: false });
}

async function changeSummaryDate(value) {
    state.summaryAnchorDate = value || getToday();
    state.summaryMonthKey = getMonthKey(state.summaryAnchorDate);
    await loadSummaryData({ silent: false });
}

async function changeSummaryMonth(value) {
    state.summaryMonthKey = value || getMonthKey(state.summaryAnchorDate || state.selectedDate);
    const targetDate = `${state.summaryMonthKey}-01`;
    state.summaryAnchorDate = targetDate;
    await loadSummaryData({ silent: false });
}

async function changeSelectedDate(value, timelineOnly) {
    const targetDate = value || getToday();
    const targetMonth = getMonthKey(targetDate);
    const monthChanged = targetMonth !== state.selectedMonth;

    state.selectedDate = targetDate;
    state.selectedMonth = targetMonth;

    await Promise.all([
        loadDayData(targetDate, { silent: true }),
        monthChanged ? loadMonthData(targetMonth, { silent: true }) : Promise.resolve()
    ]);

    renderApp();

    if (timelineOnly && state.route !== 'timeline') {
        setRoute('timeline');
    }
}

async function changeMonth(monthKey) {
    const targetMonth = monthKey || getMonthKey(state.selectedDate);
    const maxDay = getDaysInMonth(targetMonth);
    const preferredDay = Number(String(state.selectedDate || '').slice(8, 10)) || 1;
    const targetDay = Math.min(Math.max(preferredDay, 1), Math.max(maxDay, 1));
    const targetDate = `${targetMonth}-${String(targetDay).padStart(2, '0')}`;

    state.selectedMonth = targetMonth;
    state.selectedDate = targetDate;

    await Promise.all([
        loadMonthData(targetMonth, { silent: true }),
        loadDayData(targetDate, { silent: true })
    ]);

    renderApp();
}

async function shiftMonth(offset) {
    const [year, month] = state.selectedMonth.split('-').map((item) => Number(item));
    if (!year || !month) {
        return;
    }

    const next = new Date(year, month - 1 + offset, 1);
    const nextMonthKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    await changeMonth(nextMonthKey);
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
window.openTodayWrite = openTodayWrite;
window.openTodayTimeline = openTodayTimeline;
window.openTodaySummary = openTodaySummary;
window.saveSettings = saveSettings;
window.handleBackup = handleBackup;
window.changeSelectedDate = changeSelectedDate;
window.refreshSummary = refreshSummary;
window.prepareSummaryTask = prepareSummaryTask;
window.copySummaryTask = copySummaryTask;
window.setTimelineQuery = setTimelineQuery;
window.applyTimelineSearch = applyTimelineSearch;
window.handleTimelineSearchKeydown = handleTimelineSearchKeydown;
window.setTimelineFilter = setTimelineFilter;
window.clearTimelineFilters = clearTimelineFilters;
window.setGlobalSearchQuery = setGlobalSearchQuery;
window.runGlobalSearch = runGlobalSearch;
window.clearGlobalSearch = clearGlobalSearch;
window.handleGlobalSearchKeydown = handleGlobalSearchKeydown;
window.openSearchResult = openSearchResult;
window.rotateHomepageMoment = rotateHomepageMoment;
window.copyHomepageAdvice = copyHomepageAdvice;
window.changeSummaryType = changeSummaryType;
window.changeSummaryDate = changeSummaryDate;
window.changeSummaryMonth = changeSummaryMonth;
window.selectEntry = selectEntry;
window.addEntry = addEntry;
window.moveEntry = moveEntry;
window.removeSelectedEntry = removeSelectedEntry;
window.updateSelectedEntryField = updateSelectedEntryField;
window.saveDayEntries = saveDayEntries;
window.handleImageInput = handleImageInput;
window.deleteImageFromEntry = deleteImageFromEntry;
window.changeMonth = changeMonth;
window.shiftMonth = shiftMonth;
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;

window.addEventListener('hashchange', () => {
    state.route = getCurrentRoute();
    if (!(state.route === 'timeline' && state.activeDrawer === 'timeline-search')) {
        state.activeDrawer = '';
    }
    if (state.route === 'summaries') {
        syncSummaryDraftState();
        loadSummaryData({ silent: true }).then(() => renderApp());
        return;
    }
    renderApp();
});

state.route = getCurrentRoute();
state.selectedDate = getToday();
state.selectedMonth = getMonthKey(state.selectedDate);
state.summaryAnchorDate = state.selectedDate;
state.summaryMonthKey = state.selectedMonth;

(async () => {
    await refreshApp();
    await loadDayData(state.selectedDate, { silent: true });
    if (state.route === 'summaries') {
        await loadSummaryData({ silent: true });
    }
    renderApp();
})();
