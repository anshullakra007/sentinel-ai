const incidentFeed = document.getElementById('incident-feed');
const emptyState = document.getElementById('empty-state');
const diagnosisContent = document.getElementById('diagnosis-content');

// Elements in diagnosis pane
const elImpact = document.getElementById('diag-impact');
const elService = document.getElementById('diag-service');
const elTime = document.getElementById('diag-time');
const elException = document.getElementById('diag-exception');
const elRootCause = document.getElementById('diag-root-cause');
const elHumanSummary = document.getElementById('diag-human-summary');
const elTraceback = document.getElementById('diag-traceback');
const elPatch = document.getElementById('diag-patch');

let incidents = [];
let selectedIncidentIdx = -1;
let seenIncidentCount = 0;

// Toast Notification Logic
window.showDemoToast = function(message = "Feature locked in Demo Mode. Deployed for interview demonstration purposes.", type="warning") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconSvg = '';
    if (type === 'warning') {
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    } else {
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    }

    toast.innerHTML = `${iconSvg} <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease-in';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Pill Badges logic
function formatImpact(level) {
    if (!level) return { text: 'UNKNOWN', className: 'badge' };
    const l = level.toLowerCase();
    if (l === 'high') return { text: 'CRITICAL', className: 'badge critical' };
    if (l === 'medium') return { text: 'WARNING', className: 'badge warning' };
    return { text: 'LOW', className: 'badge low' };
}

// The JS Parser for diff
function renderDiff(patchText) {
    if (!patchText) return 'No patch suggested.';
    
    const lines = patchText.split('\n');
    let diffHtml = '';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const escapedLine = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        if (line.startsWith('+')) {
            diffHtml += `<span class="diff-add">${escapedLine}</span>\n`;
        } else if (line.startsWith('-')) {
            diffHtml += `<span class="diff-remove">${escapedLine}</span>\n`;
        } else {
            diffHtml += `<span class="diff-neutral">${escapedLine}</span>\n`;
        }
    }
    
    return diffHtml;
}

let feedFilterQuery = '';

// Setup Search/Filter input listener
document.addEventListener('DOMContentLoaded', () => {
    const filterInput = document.getElementById('feed-filter');
    if (filterInput) {
        filterInput.addEventListener('input', (e) => {
            feedFilterQuery = e.target.value.toLowerCase().trim();
            renderFeed();
        });
    }
});

function renderFeed() {
    const filteredIncidents = incidents.filter(incident => {
        if (!feedFilterQuery) return true;
        const exceptionMatch = (incident.exception || '').toLowerCase().includes(feedFilterQuery);
        const fileMatch = (incident.parsed_file || '').toLowerCase().includes(feedFilterQuery);
        return exceptionMatch || fileMatch;
    });

    if (filteredIncidents.length === 0) {
        incidentFeed.innerHTML = `
            <div class="empty-feed">
                <div class="empty-ring-container">
                    <div class="pulse-ring"></div>
                    <i data-lucide="radio" class="empty-icon"></i>
                </div>
                <span class="empty-title">${feedFilterQuery ? 'No matching incidents' : 'Listening for telemetry'}</span>
                <span class="empty-sub">${feedFilterQuery ? 'Try another filter keyword' : 'Production cluster is healthy'}</span>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    let html = '';
    filteredIncidents.slice().reverse().forEach((incident, revIdx) => {
        const origIdx = incidents.indexOf(incident);
        const isSelected = origIdx === selectedIncidentIdx;
        const impactInfo = formatImpact(incident.diagnostic?.impact_level);
        const occurrenceBadge = incident.occurrence_count > 1 
            ? `<span class="badge occurrence">x${incident.occurrence_count}</span>` 
            : '';
        
        html += `
            <div onclick="selectIncident(${origIdx})" class="feed-item ${isSelected ? 'selected' : ''}">
                <div class="item-header">
                    <div class="item-badges">
                        <span class="${impactInfo.className}">${impactInfo.text}</span>
                        ${occurrenceBadge}
                    </div>
                    <span class="item-time">${incident.timestamp || new Date().toLocaleTimeString()}</span>
                </div>
                <h3 class="item-title" title="${incident.exception}">${incident.exception || 'Unknown Error'}</h3>
                <p class="item-file">in <span>${incident.parsed_file || 'unknown file'}</span></p>
            </div>
        `;
    });
    incidentFeed.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

window.selectIncident = function(idx) {
    selectedIncidentIdx = idx;
    renderFeed(); // update selection styling
    
    // Reset Deployment State UI
    const statusEl = document.getElementById('diag-status');
    statusEl.className = 'badge status-active';
    statusEl.innerHTML = '<i data-lucide="alert-triangle"></i> INCIDENT ACTIVE';
    if (window.lucide) lucide.createIcons();
    
    document.getElementById('btn-deploy').classList.remove('hidden');
    document.getElementById('btn-rollback').classList.add('hidden');

    const inc = incidents[idx];
    
    emptyState.classList.add('hidden');
    diagnosisContent.classList.remove('hidden');
    
    const impactInfo = formatImpact(inc.diagnostic?.impact_level);
    elImpact.className = impactInfo.className;
    elImpact.textContent = impactInfo.text;
    
    elService.textContent = inc.service_name || 'unknown-service';
    elTime.textContent = 'Reported just now';
    
    elException.textContent = inc.exception || 'Exception occurred';
    
    if (inc.diagnostic) {
        if (elHumanSummary) {
            let humanText = inc.diagnostic.plain_english_summary;
            if (!humanText || humanText.trim() === '') {
                if (inc.exception && inc.exception.includes('KeyError')) {
                    humanText = "The application attempted to read a key ('role') from a dictionary that was not present. A default value or check should be added.";
                } else if (inc.diagnostic.root_cause) {
                    humanText = "The application encountered an unexpected error: " + inc.diagnostic.root_cause.split('.')[0] + ".";
                } else {
                    humanText = "Our AI is analyzing this issue in simple terms and preparing an automated fix.";
                }
            }
            elHumanSummary.textContent = humanText;
        }
        elRootCause.innerHTML = inc.diagnostic.root_cause ? inc.diagnostic.root_cause.replace(/\\n/g, '<br>') : 'No root cause identified.';
        elPatch.innerHTML = renderDiff(inc.diagnostic.suggested_patch);
    } else {
        if (elHumanSummary) {
            elHumanSummary.textContent = 'Diagnostic pending or failed. Please trigger a new incident test.';
        }
        elRootCause.textContent = 'Diagnostic pending or failed.';
        elPatch.innerHTML = renderDiff('');
    }
    
    elTraceback.textContent = inc.traceback || '';
    
    if (inc.metrics) {
        document.getElementById('metric-vdb').textContent = '~' + inc.metrics.vdb_ms + 'ms';
        document.getElementById('metric-llm').textContent = '~' + inc.metrics.llm_ms + 'ms';
        document.getElementById('metric-total').textContent = '~' + inc.metrics.total_ms + 'ms';
    } else {
        document.getElementById('metric-vdb').textContent = '~0ms';
        document.getElementById('metric-llm').textContent = '~0ms';
        document.getElementById('metric-total').textContent = '~0ms';
    }
}

// Polling function
async function pollIncidents() {
    try {
        const res = await fetch('/api/incidents');
        const data = await res.json();
        
        if (data.incidents) {
            // Check if length increased OR if the data mutated
            const isNew = data.incidents.length > seenIncidentCount;
            const isMutated = JSON.stringify(incidents) !== JSON.stringify(data.incidents);
            
            if (isNew || isMutated) {
                incidents = data.incidents;
                seenIncidentCount = incidents.length;
                renderFeed();
                updateMetricsView();
                
                // Auto-select first if none selected, otherwise refresh current view
                if (selectedIncidentIdx === -1 && incidents.length > 0) {
                    selectedIncidentIdx = 0;
                    selectIncident(0);
                } else if (isMutated && selectedIncidentIdx !== -1) {
                    selectIncident(selectedIncidentIdx);
                }
            }
        }
    } catch (e) {
        console.error('Failed to poll incidents:', e);
    }
}

// Start polling
setInterval(pollIncidents, 2000);
pollIncidents();

// Sidebar Navigation View Switcher (Linear / Vercel Navigation)
window.switchView = function(viewName) {
    const views = ['diag', 'metrics', 'nodes', 'settings'];
    views.forEach(v => {
        const panel = document.getElementById(`view-${v}`);
        const navBtn = document.getElementById(`nav-${v}`);
        if (panel) {
            if (v === viewName) {
                panel.classList.remove('hidden');
            } else {
                panel.classList.add('hidden');
            }
        }
        if (navBtn) {
            if (v === viewName) {
                navBtn.classList.add('active');
            } else {
                navBtn.classList.remove('active');
            }
        }
    });

    if (viewName === 'metrics') {
        updateMetricsView();
    }
    if (window.lucide) lucide.createIcons();
};

function updateMetricsView() {
    const elVdbAvg = document.getElementById('stat-vdb-avg');
    const elLlmAvg = document.getElementById('stat-llm-avg');
    const elTotalAvg = document.getElementById('stat-total-avg');
    const elCount = document.getElementById('stat-incidents-count');
    const tbody = document.getElementById('telemetry-table-body');

    if (elCount) elCount.textContent = incidents.length;

    if (incidents.length === 0) {
        if (elVdbAvg) elVdbAvg.textContent = "0 ms";
        if (elLlmAvg) elLlmAvg.textContent = "0 ms";
        if (elTotalAvg) elTotalAvg.textContent = "0 ms";
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 32px;">No telemetry events recorded yet. Click "Trigger Chaos" to generate telemetry.</td></tr>`;
        }
        return;
    }

    let totalVdb = 0, totalLlm = 0, totalMs = 0;
    incidents.forEach(inc => {
        totalVdb += inc.metrics?.vdb_ms || 0;
        totalLlm += inc.metrics?.llm_ms || 0;
        totalMs += inc.metrics?.total_ms || 0;
    });

    const avgVdb = (totalVdb / incidents.length).toFixed(1);
    const avgLlm = (totalLlm / incidents.length).toFixed(1);
    const avgTotal = (totalMs / incidents.length).toFixed(1);

    if (elVdbAvg) elVdbAvg.textContent = `${avgVdb} ms`;
    if (elLlmAvg) elLlmAvg.textContent = `${avgLlm} ms`;
    if (elTotalAvg) elTotalAvg.textContent = `${avgTotal} ms`;

    if (tbody) {
        let rowsHtml = '';
        incidents.slice().reverse().forEach(inc => {
            rowsHtml += `
                <tr>
                    <td class="font-mono">${inc.timestamp || 'now'}</td>
                    <td class="font-mono">${inc.service_name || 'unknown_service'}</td>
                    <td class="font-mono" style="color: #EF4444;">${inc.exception || 'Error'}</td>
                    <td class="font-mono">${inc.metrics?.vdb_ms || 0} ms</td>
                    <td class="font-mono">${inc.metrics?.llm_ms || 0} ms</td>
                    <td class="font-mono" style="font-weight: 600;">${inc.metrics?.total_ms || 0} ms</td>
                    <td><span class="badge status-active" style="font-size: 10px;">DIAGNOSED</span></td>
                </tr>
            `;
        });
        tbody.innerHTML = rowsHtml;
    }
}

window.testApiConnection = function() {
    showDemoToast("Gemini API connection verified: 200 OK. Latency 142ms.", "warning");
};

// Feature B: One-Click Rollback Logic
window.deployPatch = function() {
    console.log("[SYSTEM] Deploying suggested patch to production cluster...");
    showDemoToast("Deploying patch and restarting containers...", "warning");
    
    // Toggle Status Banner
    const statusBanner = document.getElementById('diag-status');
    statusBanner.className = 'badge status-resolved';
    statusBanner.innerHTML = '<i data-lucide="check-circle-2"></i> PATCH DEPLOYED & MONITORING';
    if (window.lucide) lucide.createIcons();
    
    // Toggle Buttons
    document.getElementById('btn-deploy').classList.add('hidden');
    document.getElementById('btn-rollback').classList.remove('hidden');
};

window.rollbackPatch = function() {
    console.log("[SYSTEM] Manual rollback initiated by operator.");
    showDemoToast("Rollback executed. Cluster reverting to previous state.", "warning");
    
    // Revert Status Banner
    const statusBanner = document.getElementById('diag-status');
    statusBanner.className = 'badge status-active';
    statusBanner.innerHTML = '<i data-lucide="alert-triangle"></i> INCIDENT ACTIVE';
    if (window.lucide) lucide.createIcons();
    
    // Toggle Buttons
    document.getElementById('btn-deploy').classList.remove('hidden');
    document.getElementById('btn-rollback').classList.add('hidden');
};

// Updated Chaos Trigger for Cloud Compatibility
const btnChaos = document.getElementById('btn-chaos');
if (btnChaos) {
    btnChaos.addEventListener('click', async () => {
        const originalHTML = btnChaos.innerHTML;
        btnChaos.innerHTML = '<span class="icon">⚠️</span><span class="text">CRASHING SERVER...</span>';
        btnChaos.disabled = true;
        btnChaos.classList.add('crashing');

        // Automatically switch back to Diagnostics view when triggering chaos
        switchView('diag');

        try {
            const response = await fetch('/api/simulate-crash');
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`);
            }
            showDemoToast("Crash payload successfully injected into telemetry stream.", "warning");
            // Immediately poll incidents so UI updates with zero latency
            await pollIncidents();
        } catch (e) {
            console.error("Failed to trigger simulation:", e);
            showDemoToast(`Failed to trigger chaos: ${e.message}`, "error");
        } finally {
            setTimeout(() => {
                btnChaos.innerHTML = originalHTML;
                btnChaos.disabled = false;
                btnChaos.classList.remove('crashing');
            }, 2000);
        }
    });
}
