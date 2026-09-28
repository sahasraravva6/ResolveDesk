const state = { page: "overview", tickets: [], customers: [], memories: [], selectedTicket: null, selectedCustomer: null, memoryFilter: "All", ticketFilter: "All", customerFilter: "All", profileTab: "Overview", settingsTab: "Workspace", bootstrap: {} };
const content = document.querySelector("#page-content");
const modalLayer = document.querySelector("#modal-layer");

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const initials = name => (name || "RD").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
const fmtTime = value => { const date = new Date(value); if (Number.isNaN(date.valueOf())) return "Recently"; const minutes = Math.max(0, Math.floor((Date.now() - date) / 60000)); return minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : date.toLocaleDateString("en", { month: "short", day: "numeric" }); };
const fmtDate = value => new Date(value).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
const statusClass = value => `status-${(value || "open").toLowerCase().replaceAll(" ", "-")}`;
const priorityClass = value => `priority-${(value || "medium").toLowerCase()}`;
const avatar = (name, extra = "") => `<span class="avatar ${extra}">${escapeHtml(initials(name))}</span>`;
const pageNames = { overview: "Overview", inbox: "Support Inbox", customers: "Customers", tickets: "Tickets", memory: "Customer Memory", insights: "Insights", settings: "Settings", team: "Team" };

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That request could not be completed.");
  return data;
}
function toast(message, type = "") { const node = document.createElement("div"); node.className = `toast ${type}`; node.textContent = message; document.querySelector("#toast-region").append(node); setTimeout(() => node.remove(), 3400); }
function setLoading(message = "Loading your workspace") { content.innerHTML = `<div class="loading-state"><span class="spinner"></span>${escapeHtml(message)}</div>`; }
function pageHeader(title, description, action = "") { return `<div class="page-heading"><div><div class="eyebrow">${escapeHtml(pageNames[state.page] || "Workspace")}</div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${action}</div></div>`; }
function button(label, action, primary = false, icon = "") { return `<button class="button ${primary ? "button-primary" : ""}" data-action="${action}">${icon ? `<span class="button-icon">${icon}</span>` : ""}${label}</button>`; }
function ticketRow(ticket, active = false) { const latest = ticket.messages?.at(-1)?.body || ticket.subject; return `<button class="ticket-row ${active ? "active" : ""}" data-ticket-id="${ticket.id}"><div class="ticket-row-head"><strong>${escapeHtml(ticket.customer)}</strong><time>${fmtTime(ticket.updated_at)}</time></div><div class="ticket-row-subject">${escapeHtml(ticket.subject)}</div><div class="ticket-row-preview">${escapeHtml(latest)}</div><div class="ticket-row-foot"><span class="priority ${priorityClass(ticket.priority)}">${escapeHtml(ticket.priority)}</span><span class="status-pill ${statusClass(ticket.status)}">${escapeHtml(ticket.status)}</span></div></button>`; }
function memoryCard(memory) { return `<article class="memory-item"><div class="memory-item-top"><strong>${escapeHtml(memory.category)}</strong><span class="tag">${memory.confidence ?? 92}% context</span></div><p>${escapeHtml(memory.content)}</p><div class="memory-source"><span>${escapeHtml(memory.source || "Support interaction")}</span><span>${memory.created_at ? fmtDate(memory.created_at) : "Recently"}</span></div></article>`; }
function customerLine(customer) { return `<div class="customer-cell">${avatar(customer.name)}<span><span class="cell-primary">${escapeHtml(customer.name)}</span><span class="cell-secondary">${escapeHtml(customer.company)}</span></span></div>`; }

async function initialize() {
  try {
    state.bootstrap = await api("/api/bootstrap");
    document.querySelector("#user-name").textContent = state.bootstrap.user.name;
    document.querySelector("#memory-status-title").textContent = state.bootstrap.memory_mode;
    document.querySelector("#memory-status-subtitle").textContent = "Customer context is ready";
    await navigate("overview");
  } catch (error) { content.innerHTML = `<div class="error-banner">${escapeHtml(error.message)} Reload the page to try again.</div>`; }
}
async function navigate(page) {
  state.page = page;
  document.querySelectorAll("[data-page]").forEach(item => item.classList.toggle("active", item.dataset.page === page));
  document.querySelector("#breadcrumb-current").textContent = pageNames[page] || "Workspace";
  document.querySelector("#sidebar").classList.remove("open");
  document.querySelector("#mobile-backdrop").classList.remove("visible");
  setLoading();
  try {
    if (page === "overview") await renderDashboard();
    else if (page === "customers") await renderCustomers();
    else if (page === "inbox" || page === "tickets") await renderInbox();
    else if (page === "memory") await renderMemory();
    else if (page === "insights") await renderInsights();
    else if (page === "settings") await renderSettings();
    else if (page === "team") renderTeam();
  } catch (error) { content.innerHTML = `<div class="error-banner">${escapeHtml(error.message)}</div>`; }
}

async function renderDashboard() {
  const data = await api("/api/dashboard");
  state.tickets = data.tickets;
  content.innerHTML = `${pageHeader("Good morning, Alex", "Here's what's happening across your support workspace.", button("New ticket", "new-ticket", true, "+"))}
    <section class="kpi-grid" aria-label="Support metrics">
      ${kpi("Open tickets", data.stats.open, "Across your team", "▣")}${kpi("Waiting for customer", data.stats.waiting, "Follow-ups to keep moving", "◷")}${kpi("Resolved today", data.stats.resolved_today, "Closed since midnight", "✓")}${kpi("Returning customers", `${data.stats.returning_rate}%`, "Profiles with prior context", "↺")}
    </section>
    <div class="dashboard-grid"><section class="panel"><div class="panel-header"><div><h2>Recent tickets</h2><p>The latest conversations across your team</p></div><button class="text-button" data-page="inbox">View inbox →</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Customer</th><th>Issue</th><th>Priority</th><th>Status</th><th>Updated</th><th>Assigned</th></tr></thead><tbody>${data.tickets.map(ticket => `<tr data-ticket-id="${ticket.id}"><td>${customerLine({ name: ticket.customer, company: ticket.company })}</td><td>${escapeHtml(ticket.subject)}</td><td><span class="priority ${priorityClass(ticket.priority)}">${escapeHtml(ticket.priority)}</span></td><td><span class="status-pill ${statusClass(ticket.status)}">${escapeHtml(ticket.status)}</span></td><td>${fmtTime(ticket.updated_at)}</td><td>${escapeHtml(ticket.assignee)}</td></tr>`).join("")}</tbody></table></div></section>
    <section class="panel"><div class="panel-header"><div><h2>Recent customer context</h2><p>Details retained from support interactions</p></div><button class="text-button" data-page="memory">Memory →</button></div><div class="activity-list">${data.memories.slice(0, 3).map(item => `<div class="activity-item"><span class="activity-avatar">${escapeHtml(initials(item.customer))}</span><div class="activity-copy"><strong>${escapeHtml(item.customer)}</strong><br>${escapeHtml(item.category)} · ${escapeHtml(item.content)}<small>${escapeHtml(item.source)} · ${fmtTime(item.created_at)}</small></div></div>`).join("") || `<div class="no-data">New interaction context will appear here.</div>`}</div><div class="context-strip"><span class="context-mark">↺</span><p><strong>Context carries forward.</strong><br>Previous attempts stay visible when a customer returns.</p></div></section></div>`;
}
function kpi(label, value, foot, icon) { return `<article class="kpi-card"><div class="kpi-label">${label}<span class="kpi-icon">${icon}</span></div><div class="kpi-value">${value}</div><div class="kpi-foot"><span class="positive">●</span> ${foot}</div></article>`; }

async function renderCustomers(query = "") {
  const data = await api(`/api/customers?q=${encodeURIComponent(query)}&status=${encodeURIComponent(state.customerFilter)}`);
  state.customers = data.customers;
  content.innerHTML = `${pageHeader("Customers", "View customer history and support context.", button("Add customer", "new-customer", true, "+"))}
    <div class="toolbar"><label class="search-field"><span>⌕</span><input id="customer-search" type="search" placeholder="Search customers..." value="${escapeHtml(query)}"></label><div class="segmented" id="customer-filters">${["All", "Active", "Returning"].map(item => `<button data-customer-filter="${item}" class="${state.customerFilter === item ? "active" : ""}">${item}</button>`).join("")}</div></div>
    <section class="panel"><div class="panel-header"><div><h2>${data.customers.length} customer profiles</h2><p>Customer records with linked tickets and remembered context</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Open tickets</th><th>Last contact</th><th>Customer since</th><th>Status</th></tr></thead><tbody>${data.customers.map(customer => `<tr data-customer-id="${customer.id}"><td>${customerLine(customer)}</td><td>${escapeHtml(customer.email)}</td><td>${customer.open_tickets}</td><td>${customer.last_contact ? fmtTime(customer.last_contact) : "—"}</td><td>${escapeHtml(customer.customer_since)}</td><td><span class="status-pill ${customer.status === "Returning" ? "status-in-progress" : "status-resolved"}">${escapeHtml(customer.status)}</span></td></tr>`).join("") || `<tr><td colspan="6" class="no-data">No customers match this search.</td></tr>`}</tbody></table></div></section>`;
  const input = document.querySelector("#customer-search"); let timer; input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => renderCustomers(input.value), 180); });
}
async function openCustomer(id) {
  const data = await api(`/api/customers/${id}`); state.selectedCustomer = data; state.profileTab = "Overview";
  content.innerHTML = `${pageHeader("Customer profile", "A complete view of the relationship and past support.", `<button class="button" data-page="customers">← Customers</button>`)}<div class="panel"><div class="customer-profile-head">${avatar(data.customer.name, "avatar-wine")}<div style="flex:1"><h2>${escapeHtml(data.customer.name)}</h2><p>${escapeHtml(data.customer.company)} · ${escapeHtml(data.customer.email)}</p></div><span class="status-pill status-in-progress">${escapeHtml(data.customer.status)} customer</span></div><div class="profile-facts"><div class="profile-fact"><small>Customer since</small><strong>${escapeHtml(data.customer.customer_since)}</strong></div><div class="profile-fact"><small>Total tickets</small><strong>${data.customer.ticket_count}</strong></div><div class="profile-fact"><small>Open tickets</small><strong>${data.customer.open_tickets}</strong></div><div class="profile-fact"><small>Last interaction</small><strong>${data.customer.last_contact ? fmtTime(data.customer.last_contact) : "No interactions yet"}</strong></div></div><div class="panel-header" id="profile-tabs">${["Overview", "Tickets", "Conversations", "Memory", "Activity"].map(tab => `<button class="text-button ${state.profileTab === tab ? "active" : ""}" data-profile-tab="${tab}">${tab}</button>`).join("")}</div><div class="timeline-wrap" id="profile-body"></div></div>`;
  renderProfileTab();
}
function renderProfileTab() {
  const data = state.selectedCustomer; if (!data) return;
  const body = document.querySelector("#profile-body"); if (!body) return;
  if (state.profileTab === "Memory") body.innerHTML = data.memories.length ? data.memories.map(memoryCard).join("") : `<div class="no-data">No customer context has been retained yet.</div>`;
  else if (state.profileTab === "Tickets" || state.profileTab === "Conversations") body.innerHTML = data.tickets.map(ticket => `<div class="activity-item"><span class="activity-avatar">${escapeHtml(ticket.reference.slice(-2))}</span><div class="activity-copy"><strong>${escapeHtml(ticket.reference)} · ${escapeHtml(ticket.subject)}</strong><br><span class="status-pill ${statusClass(ticket.status)}">${escapeHtml(ticket.status)}</span><small>${fmtTime(ticket.updated_at)} · ${escapeHtml(ticket.assignee)}</small></div></div>`).join("") || `<div class="no-data">No tickets on this profile yet.</div>`;
  else body.innerHTML = `<div class="dashboard-grid"><div><div class="eyebrow">Relationship summary</div><p style="font-size:11px;line-height:1.7;color:#625d56">${escapeHtml(data.customer.name)} has ${data.customer.ticket_count} support interactions on record. Relevant preferences, previous attempts, and outcomes are available in customer context.</p>${data.memories.slice(0, 3).map(memoryCard).join("")}</div><div><div class="eyebrow">Recent activity</div>${data.tickets.map(ticket => `<div class="activity-item"><span class="activity-avatar">${escapeHtml(ticket.reference.slice(-2))}</span><div class="activity-copy"><strong>${escapeHtml(ticket.reference)}</strong><br>${escapeHtml(ticket.subject)}<small>${fmtTime(ticket.updated_at)}</small></div></div>`).join("")}</div></div>`;
}

async function renderInbox() {
  const data = await api(`/api/tickets?status=${encodeURIComponent(state.ticketFilter)}`); state.tickets = data.tickets;
  if (!state.selectedTicket || !state.tickets.some(ticket => ticket.id === state.selectedTicket.id)) state.selectedTicket = state.tickets[0] || null;
  content.innerHTML = `${pageHeader(state.page === "inbox" ? "Support inbox" : "Tickets", "Work through customer conversations with the history close at hand.", button("New ticket", "new-ticket", true, "+"))}<div class="split-layout"><section class="panel ticket-queue"><div class="queue-top"><label class="search-field"><span>⌕</span><input id="ticket-search" type="search" placeholder="Search tickets..."></label><div class="queue-filters">${["All", "Open", "In progress", "Waiting on customer", "Resolved"].map(filter => `<button data-ticket-filter="${filter}" class="${state.ticketFilter === filter ? "active" : ""}">${filter === "Waiting on customer" ? "Waiting" : filter}</button>`).join("")}</div></div><div id="ticket-rows">${state.tickets.map(ticket => ticketRow(ticket, ticket.id === state.selectedTicket?.id)).join("") || `<div class="no-data">No tickets found. Create a ticket to get started.</div>`}</div></section><section class="panel ticket-main" id="ticket-detail">${state.selectedTicket ? ticketDetailMarkup(state.selectedTicket) : `<div class="empty-state">Choose a ticket to view its conversation.</div>`}</section><section class="panel context-panel" id="context-panel">${contextMarkup(state.selectedTicket, state.selectedTicket?.customer_memories || [])}</section></div>`;
  if (state.selectedTicket) loadContext(state.selectedTicket);
}
function ticketDetailMarkup(ticket) {
  const messages = ticket.messages || [];
  return `<div class="ticket-detail-head"><div><div class="ticket-ref">${escapeHtml(ticket.reference)} · ${escapeHtml(ticket.customer)}</div><h2>${escapeHtml(ticket.subject)}</h2><div class="ticket-detail-meta"><span class="priority ${priorityClass(ticket.priority)}">${escapeHtml(ticket.priority)} priority</span><span class="status-pill ${statusClass(ticket.status)}">${escapeHtml(ticket.status)}</span><span class="cell-secondary">Assigned to ${escapeHtml(ticket.assignee)}</span></div></div><select class="filter-select" id="ticket-status" aria-label="Update ticket status">${["Open", "In progress", "Waiting on customer", "Resolved"].map(item => `<option ${ticket.status === item ? "selected" : ""}>${item}</option>`).join("")}</select></div><div class="ticket-conversation" id="conversation"><div class="conversation-date">${fmtDate(ticket.created_at)}</div>${messages.map(messageMarkup).join("")}</div><form class="reply-panel" id="reply-form"><div class="reply-toolbar"><span>Reply to ${escapeHtml(ticket.customer)}</span><button type="button" class="text-button" data-action="draft-reply">✦ Draft with context</button></div><textarea class="reply-area" id="reply-input" placeholder="Write a response..." aria-label="Write a response"></textarea><div class="reply-actions"><div class="reply-actions-left"><button class="button" type="button" data-action="use-context">↺ Use customer context</button></div><div class="reply-actions-right"><button class="button" type="button" data-action="save-draft">Save draft</button><button class="button button-primary" type="submit">Send reply <span>↗</span></button></div></div></form>`;
}
function messageMarkup(message) { const agent = message.sender === "agent"; return `<div class="message ${agent ? "agent" : ""}">${avatar(agent ? "Alex Morgan" : state.selectedTicket?.customer || "Customer", agent ? "avatar-wine" : "") }<div><div class="message-body">${escapeHtml(message.body)}</div><div class="message-meta">${agent ? "Alex Morgan" : escapeHtml(state.selectedTicket?.customer || "Customer")} · ${fmtTime(message.created_at)}</div></div></div>`; }
function contextMarkup(ticket, memories, loading = false) {
  if (!ticket) return `<div class="panel-header"><h2>Customer context</h2></div><div class="context-panel-body"><div class="memory-empty">Select a conversation to review customer history.</div></div>`;
  return `<div class="panel-header"><div><h2>Customer context</h2><p>Relevant details from previous interactions</p></div><button class="text-button" data-action="open-customer" data-customer-id="${ticket.customer_id}">Profile →</button></div><div class="context-panel-body">${loading ? `<div class="memory-empty"><span class="spinner"></span> Reviewing previous customer context...</div>` : memories.length ? `<div class="context-found">✓ Context recalled <span class="context-count">${memories.length} relevant ${memories.length === 1 ? "memory" : "memories"}</span></div>${memories.map(memoryCard).join("")}` : `<div class="memory-empty">No relevant context found for this message yet. Send a reply to retain useful details.</div>`}</div><div class="memory-panel-footer"><span class="memory-badge">${state.bootstrap.memory_mode || "Demo memory"}</span></div>`;
}
async function loadContext(ticket) {
  const panel = document.querySelector("#context-panel"); if (!panel) return;
  panel.innerHTML = contextMarkup(ticket, [], true);
  try {
    const result = await api("/api/memories/recall", { method: "POST", body: JSON.stringify({ customer_id: ticket.customer_id, query: `${ticket.subject} ${ticket.messages?.at(-1)?.body || ""}` }) });
    if (state.selectedTicket?.id === ticket.id) panel.innerHTML = contextMarkup(ticket, result.results || []);
  } catch (error) { panel.innerHTML = contextMarkup(ticket, []); toast("Customer context is temporarily unavailable.", "error"); }
}
async function selectTicket(id) {
  const item = await api("/api/tickets"); state.tickets = item.tickets;
  state.selectedTicket = item.tickets.find(ticket => ticket.id === Number(id)) || null;
  await renderInbox();
}
async function renderMemory(filter = state.memoryFilter) {
  state.memoryFilter = filter;
  const data = await api(`/api/memories?category=${encodeURIComponent(filter)}`); state.memories = data.memories;
  const categories = ["All", "Previous issue", "Attempted solution", "Outcome", "Customer preference", "Important context", "Resolution", "Interaction"];
  content.innerHTML = `${pageHeader("Customer memory", "Important context captured across previous interactions.", `<span class="memory-badge">${state.bootstrap.memory_mode || "Demo memory"}</span>`)}<div class="toolbar"><div class="segmented">${categories.map(category => `<button data-memory-filter="${category}" class="${filter === category ? "active" : ""}">${category === "Customer preference" ? "Preferences" : category === "Previous issue" || category === "Attempted solution" || category === "Important context" ? category.replace("Previous ", "").replace("Attempted ", "").replace("Important ", "") : category}</button>`).join("")}</div></div><section class="panel"><div class="panel-header"><div><h2>Memory timeline</h2><p>${data.memories.length} context items across your customer base</p></div></div><div class="timeline-wrap">${renderTimeline(data.memories)}</div></section>`;
}
function renderTimeline(memories) {
  if (!memories.length) return `<div class="no-data">No context captured for this filter.</div>`;
  const groups = memories.reduce((acc, memory) => { const day = fmtDate(memory.created_at); (acc[day] ||= []).push(memory); return acc; }, {});
  return Object.entries(groups).map(([day, entries]) => `<div class="timeline-group"><h3 class="timeline-date">${day}</h3><div class="timeline">${entries.map(memory => `<article class="timeline-item"><time>${escapeHtml(memory.customer)} · ${escapeHtml(memory.source)}</time><strong>${escapeHtml(memory.category)} <span class="tag">${memory.confidence}% context</span></strong><p>${escapeHtml(memory.content)}</p></article>`).join("")}</div></div>`).join("");
}
async function renderInsights() {
  const data = await api("/api/insights");
  content.innerHTML = `${pageHeader("Support insights", "A clearer view of resolution quality and recurring customer issues.", `<select class="filter-select" id="insight-period"><option>Last 30 days</option><option>Last 7 days</option><option>This quarter</option></select>`)}<div class="insight-grid">${kpi("Resolution rate", `${data.metrics.resolution_rate}%`, "Tickets resolved", "✓")}${kpi("Average response", data.metrics.avg_response, "Across active tickets", "◷")}${kpi("Returning customers", data.metrics.returning, "Known customer profiles", "↺")}${kpi("Repeated issue groups", data.metrics.repeat_issues, "Across current ticket topics", "▧")}</div><div class="insight-layout"><section class="panel"><div class="panel-header"><div><h2>Ticket volume</h2><p>New and resolved tickets over the last week</p></div><div class="chart-legend"><span><i class="legend-dot"></i>Created</span><span><i class="legend-dot" style="background:#b85c4a"></i>Resolved</span></div></div><div class="chart-area"><svg class="chart-svg" viewBox="0 0 600 180" role="img" aria-label="Ticket volume trend chart"><defs><linearGradient id="chartShade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7a2430" stop-opacity=".15"/><stop offset="1" stop-color="#7a2430" stop-opacity="0"/></linearGradient></defs>${[25,65,105,145].map(y => `<line class="grid-line" x1="35" x2="590" y1="${y}" y2="${y}"/>`).join("")}<path class="chart-fill" d="M40 125 C90 109 105 92 130 100 S185 133 220 104 S278 71 315 83 S370 60 405 77 S467 112 500 72 S550 45 585 54 L585 150 L40 150 Z"/><path class="chart-path" d="M40 125 C90 109 105 92 130 100 S185 133 220 104 S278 71 315 83 S370 60 405 77 S467 112 500 72 S550 45 585 54"/>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => `<text class="chart-label" x="${40 + i * 90}" y="171">${day}</text>`).join("")}<circle class="chart-dot" cx="500" cy="72" r="4"/></svg></div></section><section class="panel"><div class="panel-header"><div><h2>Common issue categories</h2><p>Recurring themes in recent tickets</p></div></div><div class="bar-list">${(data.categories.length ? data.categories : [{ name: "Payment integration", count: 18 }, { name: "API authentication", count: 11 }, { name: "Invoice sync", count: 8 }]).map(item => `<div class="bar-row"><div class="bar-row-label"><span>${escapeHtml(item.name)}</span><span>${item.count} cases</span></div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, item.count * 5)}%"></div></div></div>`).join("")}</div><div class="insight-note"><strong>Context-driven insight</strong><p>${escapeHtml(data.insight)}</p></div></section></div>`;
}
async function renderSettings() {
  const data = await api("/api/settings");
  content.innerHTML = `${pageHeader("Settings", "Manage your workspace connections and support defaults.", "")}<div class="settings-layout"><nav class="panel settings-nav">${["Workspace", "Integrations", "Team", "Security"].map(tab => `<button class="${state.settingsTab === tab ? "active" : ""}" data-settings-tab="${tab}">${tab}</button>`).join("")}</nav><section class="panel settings-section"><h2>${state.settingsTab} settings</h2><p>Connection health and current configuration for this workspace.</p>${state.settingsTab === "Integrations" ? `<div class="setting-row"><div><strong>Hindsight memory</strong><p>Persistent customer recall and interaction retention</p></div><span class="status-connection">${data.memory_mode === "hindsight" ? "Connected" : "Demo mode"}</span></div><div class="setting-row"><div><strong>Memory bank</strong><p>Customer context is scoped to the configured bank</p></div><span class="setting-value">${escapeHtml(data.bank_id)}</span></div><div class="setting-row"><div><strong>Response generation</strong><p>Drafts stay in review until an agent sends them</p></div><span class="status-connection">${data.llm_mode === "connected" ? "API connected" : "Demo fallback"}</span></div><div class="setting-row"><div><strong>Application database</strong><p>Business records and ticket conversations</p></div><span class="setting-value">${escapeHtml(data.database_mode.toUpperCase())}</span></div>` : state.settingsTab === "Team" ? `<div class="setting-row"><div><strong>Alex Morgan</strong><p>Workspace administrator · Support Specialist</p></div><span class="setting-value">Active</span></div><div class="setting-row"><div><strong>Maya Chen</strong><p>Support Specialist</p></div><span class="setting-value">Active</span></div>` : state.settingsTab === "Security" ? `<div class="setting-row"><div><strong>Agent confirmation</strong><p>Generated content is never sent automatically.</p></div><span class="status-connection">Required</span></div><div class="setting-row"><div><strong>Secret storage</strong><p>Credentials are read from environment variables.</p></div><span class="status-connection">Environment</span></div>` : `<div class="setting-row"><div><strong>Workspace name</strong><p>Your team's support workspace</p></div><span class="setting-value">ResolveDesk</span></div><div class="setting-row"><div><strong>Data storage</strong><p>Business records are separate from agent memory.</p></div><span class="setting-value">${escapeHtml(data.database_mode.toUpperCase())}</span></div>`}</section></div>`;
}
function renderTeam() { content.innerHTML = `${pageHeader("Team", "Support teammates in this workspace.", "")}<section class="panel"><div class="panel-header"><div><h2>Workspace members</h2><p>Assigned agents currently handling tickets</p></div></div><div class="activity-list"><div class="activity-item">${avatar("Alex Morgan", "avatar-wine")}<div class="activity-copy"><strong>Alex Morgan</strong><br>Support Specialist<small>Workspace administrator · Available</small></div><span class="status-connection">Online</span></div><div class="activity-item">${avatar("Maya Chen")}<div class="activity-copy"><strong>Maya Chen</strong><br>Support Specialist<small>Available</small></div><span class="status-connection">Online</span></div></div></section>`; }

function openModal(title, body, onSubmit) {
  modalLayer.hidden = false;
  modalLayer.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title">${title}</h2><button class="close-button" data-action="close-modal" aria-label="Close dialog">×</button></div><form id="modal-form"><div class="modal-body">${body}</div><div class="modal-footer"><button type="button" class="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">Save</button></div></form></section>`;
  modalLayer.querySelector("#modal-form").addEventListener("submit", async event => { event.preventDefault(); try { await onSubmit(new FormData(event.currentTarget)); } catch (error) { toast(error.message, "error"); } });
  modalLayer.addEventListener("click", event => { if (event.target === modalLayer) closeModal(); }, { once: true });
}
function closeModal() { modalLayer.hidden = true; modalLayer.innerHTML = ""; }
function newCustomer() {
  openModal("Add customer", `<div class="form-grid"><div class="form-field"><label for="customer-name">Full name</label><input id="customer-name" name="name" required autocomplete="name"></div><div class="form-field"><label for="customer-email">Work email</label><input id="customer-email" name="email" type="email" required autocomplete="email"></div><div class="form-field full"><label for="customer-company">Company</label><input id="customer-company" name="company" autocomplete="organization"></div></div>`, async form => { await api("/api/customers", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) }); closeModal(); toast("Customer profile created."); await renderCustomers(); });
}
async function newTicket() {
  const customers = await api("/api/customers");
  openModal("Create ticket", `<div class="form-grid"><div class="form-field full"><label for="ticket-customer">Customer</label><select id="ticket-customer" name="customer_id" required>${customers.customers.map(customer => `<option value="${customer.id}">${escapeHtml(customer.name)} · ${escapeHtml(customer.company)}</option>`).join("")}</select></div><div class="form-field full"><label for="ticket-subject">Issue</label><input id="ticket-subject" name="subject" required placeholder="Briefly describe the issue"></div><div class="form-field"><label for="ticket-priority">Priority</label><select name="priority" id="ticket-priority"><option>Medium</option><option>Low</option><option>High</option><option>Urgent</option></select></div><div class="form-field full"><label for="ticket-message">Customer message</label><textarea name="message" id="ticket-message" placeholder="Add the customer's first message"></textarea></div></div>`, async form => { const result = await api("/api/tickets", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) }); closeModal(); state.selectedTicket = result.ticket; state.ticketFilter = "All"; toast(`${result.ticket.reference} created.`); await navigate("inbox"); });
}
function openSignup() {
  openModal("Create your account", `<div class="form-grid"><div class="form-field full"><label for="signup-name">Full name</label><input name="name" id="signup-name" required autocomplete="name"></div><div class="form-field full"><label for="signup-email">Work email</label><input name="email" id="signup-email" type="email" required autocomplete="email"></div><div class="form-field full"><label for="signup-password">Password</label><input name="password" id="signup-password" type="password" minlength="8" required autocomplete="new-password"></div></div><p class="cell-secondary">Already have an account? <button class="text-button" type="button" data-action="open-signin">Sign in</button></p>`, async form => { const result = await api("/api/auth/signup", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) }); document.querySelector("#user-name").textContent = result.user.name; closeModal(); toast(`Welcome to ResolveDesk, ${result.user.name}.`); });
}
function openSignin() {
  openModal("Sign in", `<div class="form-grid"><div class="form-field full"><label for="login-email">Work email</label><input name="email" id="login-email" type="email" required value="alex@resolvedesk.demo" autocomplete="email"></div><div class="form-field full"><label for="login-password">Password</label><input name="password" id="login-password" type="password" required value="resolvedesk" autocomplete="current-password"></div></div><p class="cell-secondary">Demo account: alex@resolvedesk.demo · resolvedesk</p><p class="cell-secondary">New to ResolveDesk? <button class="text-button" type="button" data-action="open-signup">Create an account</button></p>`, async form => { const result = await api("/api/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) }); document.querySelector("#user-name").textContent = result.user.name; closeModal(); toast(`Signed in as ${result.user.name}.`); });
}
async function generateDraft() {
  if (!state.selectedTicket) return;
  const control = document.querySelector('[data-action="draft-reply"]'); if (control) { control.disabled = true; control.textContent = "Reviewing context..."; }
  try {
    const result = await api(`/api/tickets/${state.selectedTicket.id}/draft`, { method: "POST", body: JSON.stringify({ message: state.selectedTicket.messages?.at(-1)?.body || state.selectedTicket.subject }) });
    const field = document.querySelector("#reply-input"); if (field) { field.value = result.reply; field.focus(); }
    const memories = result.memories || [];
    const panel = document.querySelector("#context-panel"); if (panel) panel.innerHTML = contextMarkup(state.selectedTicket, memories);
    toast(memories.length ? `${memories.length} relevant memories found. Review the suggested reply.` : "Draft ready. No previous context was found.");
  } catch (error) { toast(error.message, "error"); }
  finally { if (control) { control.disabled = false; control.textContent = "✦ Draft with context"; } }
}
async function sendReply(event) {
  event.preventDefault(); const field = document.querySelector("#reply-input"); const body = field.value.trim();
  if (!body || !state.selectedTicket) { toast("Write a reply before sending.", "error"); return; }
  try { const result = await api(`/api/tickets/${state.selectedTicket.id}/messages`, { method: "POST", body: JSON.stringify({ body, sender: "agent" }) }); state.selectedTicket = result.ticket; toast(result.retained ? "Reply sent and context retained." : "Reply sent."); await renderInbox(); }
  catch (error) { toast(error.message, "error"); }
}
async function recallContext() {
  if (!state.selectedTicket) return;
  const panel = document.querySelector("#context-panel"); panel.innerHTML = contextMarkup(state.selectedTicket, [], true);
  try { const result = await api("/api/memories/recall", { method: "POST", body: JSON.stringify({ customer_id: state.selectedTicket.customer_id, query: `${state.selectedTicket.subject} ${state.selectedTicket.messages?.at(-1)?.body || ""}` }) }); panel.innerHTML = contextMarkup(state.selectedTicket, result.results || []); toast(`${result.results?.length || 0} relevant memories found.`); }
  catch (error) { toast(error.message, "error"); }
}

content.addEventListener("click", async event => {
  const nav = event.target.closest("[data-page]"); if (nav && !nav.dataset.action) { await navigate(nav.dataset.page); return; }
  const customerRow = event.target.closest("[data-customer-id]"); if (customerRow && !customerRow.dataset.action) { await openCustomer(customerRow.dataset.customerId); return; }
  const ticketRowNode = event.target.closest("[data-ticket-id]"); if (ticketRowNode) { await selectTicket(ticketRowNode.dataset.ticketId); return; }
  const filter = event.target.closest("[data-customer-filter]"); if (filter) { state.customerFilter = filter.dataset.customerFilter; await renderCustomers(document.querySelector("#customer-search")?.value || ""); return; }
  const memoryFilter = event.target.closest("[data-memory-filter]"); if (memoryFilter) { await renderMemory(memoryFilter.dataset.memoryFilter); return; }
  const ticketFilter = event.target.closest("[data-ticket-filter]"); if (ticketFilter) { state.ticketFilter = ticketFilter.dataset.ticketFilter; state.selectedTicket = null; await renderInbox(); return; }
  const profileTab = event.target.closest("[data-profile-tab]"); if (profileTab) { state.profileTab = profileTab.dataset.profileTab; document.querySelectorAll("[data-profile-tab]").forEach(node => node.classList.toggle("active", node === profileTab)); renderProfileTab(); return; }
  const settingsTab = event.target.closest("[data-settings-tab]"); if (settingsTab) { state.settingsTab = settingsTab.dataset.settingsTab; await renderSettings(); return; }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "new-ticket") await newTicket();
  else if (action === "new-customer") newCustomer();
  else if (action === "draft-reply") await generateDraft();
  else if (action === "use-context") await recallContext();
  else if (action === "open-customer") await openCustomer(event.target.closest("[data-customer-id]").dataset.customerId);
  else if (action === "save-draft") { const value = document.querySelector("#reply-input")?.value || ""; sessionStorage.setItem(`draft-${state.selectedTicket?.id}`, value); toast("Draft saved in this browser."); }
  else if (action === "close-modal") closeModal();
  else if (action === "open-signup") openSignup();
  else if (action === "open-signin") openSignin();
});
content.addEventListener("submit", event => { if (event.target.id === "reply-form") sendReply(event); });
content.addEventListener("change", async event => { if (event.target.id === "ticket-status" && state.selectedTicket) { try { const result = await api(`/api/tickets/${state.selectedTicket.id}`, { method: "PATCH", body: JSON.stringify({ status: event.target.value }) }); state.selectedTicket = result.ticket; toast("Ticket status updated."); await renderInbox(); } catch (error) { toast(error.message, "error"); } } });
content.addEventListener("input", event => { if (event.target.id === "ticket-search") { const q = event.target.value.toLowerCase(); document.querySelectorAll(".ticket-row").forEach(row => row.hidden = !row.textContent.toLowerCase().includes(q)); } });
modalLayer.addEventListener("click", event => { const action = event.target.closest("[data-action]")?.dataset.action; if (action === "open-signup") openSignup(); else if (action === "open-signin") openSignin(); });
document.querySelector("#sidebar").addEventListener("click", event => { const target = event.target.closest("[data-page]"); if (target) navigate(target.dataset.page); });
document.querySelector("#menu-toggle").addEventListener("click", () => { document.querySelector("#sidebar").classList.add("open"); document.querySelector("#mobile-backdrop").classList.add("visible"); });
document.querySelector("#mobile-backdrop").addEventListener("click", () => { document.querySelector("#sidebar").classList.remove("open"); document.querySelector("#mobile-backdrop").classList.remove("visible"); });
document.querySelector("#global-search").addEventListener("keydown", event => { if (event.key === "Enter") { state.page = "inbox"; navigate("inbox").then(() => { const input = document.querySelector("#ticket-search"); if (input) { input.value = event.target.value; input.dispatchEvent(new Event("input", { bubbles: true })); } }); } });
document.querySelector("#notifications").addEventListener("click", () => toast("You're all caught up."));
document.querySelector("#profile-menu").addEventListener("click", openSignin);
document.querySelector("#top-avatar").addEventListener("click", () => document.querySelector("#profile-menu").click());
document.querySelector("#memory-status-help").addEventListener("click", () => { navigate("settings").then(() => { state.settingsTab = "Integrations"; renderSettings(); }); });
document.addEventListener("keydown", event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); document.querySelector("#global-search").focus(); } if (event.key === "Escape") closeModal(); });
initialize();
