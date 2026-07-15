const incidentFeed = document.getElementById('incident-feed');
const emptyState = document.getElementById('empty-state');
const diagnosisContent = document.getElementById('diagnosis-content');

// Elements in diagnosis pane
const elImpact = document.getElementById('diag-impact');
const elService = document.getElementById('diag-service');
const elTime = document.getElementById('diag-time');
const elException = document.getElementById('diag-exception');
const elRootCause = document.getElementById('diag-root-cause');
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

function renderFeed() {
    if (incidents.length === 0) {
        incidentFeed.innerHTML = `
            <div class="empty-feed">
                <div class="pulse-ring"></div>
                <span>Listening for telemetry...</span>
            </div>
        `;
        return;
    }

    let html = '';
    incidents.slice().reverse().forEach((incident, revIdx) => {
        const origIdx = incidents.length - 1 - revIdx;
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
                    <span class="item-time">${new Date().toLocaleTimeString()}</span>
                </div>
                <h3 class="item-title" title="${incident.exception}">${incident.exception || 'Unknown Error'}</h3>
                <p class="item-file">in <span>${incident.parsed_file || 'unknown file'}</span></p>
            </div>
        `;
    });
    incidentFeed.innerHTML = html;
}

window.selectIncident = function(idx) {
    selectedIncidentIdx = idx;
    renderFeed(); // update selection styling
    
    // Reset Deployment State UI
    const statusEl = document.getElementById('diag-status');
    statusEl.className = 'badge status-active';
    statusEl.innerHTML = '🚨 Incident Active';
    
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
        elRootCause.innerHTML = inc.diagnostic.root_cause ? inc.diagnostic.root_cause.replace(/\\n/g, '<br>') : 'No root cause identified.';
        elPatch.innerHTML = renderDiff(inc.diagnostic.suggested_patch);
    } else {
        elRootCause.textContent = 'Diagnostic pending or failed.';
        elPatch.innerHTML = renderDiff('');
    }
    
    elTraceback.textContent = inc.traceback || '';
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

// Feature B: One-Click Rollback Logic
window.deployPatch = function() {
    console.log("[SYSTEM] Deploying suggested patch to production cluster...");
    showDemoToast("Deploying patch and restarting containers...", "warning");
    
    // Toggle Status Banner
    const statusBanner = document.getElementById('diag-status');
    statusBanner.className = 'badge status-resolved';
    statusBanner.innerHTML = '🟢 Patch Deployed & Monitoring';
    
    // Toggle Buttons
    document.getElementById('btn-deploy').classList.add('hidden');
    document.getElementById('btn-rollback').classList.remove('hidden');
}

window.rollbackPatch = function() {
    console.log("[SYSTEM] Manual rollback initiated by operator.");
    showDemoToast("Rollback executed. Cluster reverting to previous state.", "warning");
    
    // Revert Status Banner
    const statusBanner = document.getElementById('diag-status');
    statusBanner.className = 'badge status-active';
    statusBanner.innerHTML = '🚨 Incident Active';
    
    // Toggle Buttons
    document.getElementById('btn-deploy').classList.remove('hidden');
    document.getElementById('btn-rollback').classList.add('hidden');
}

// Updated Chaos Trigger for Cloud Compatibility
const btnChaos = document.getElementById('btn-chaos');
if (btnChaos) {
    btnChaos.addEventListener('click', async () => {
        const originalHTML = btnChaos.innerHTML;
        btnChaos.innerHTML = '<span class="icon">⚠️</span><span class="text">CRASHING SERVER...</span>';
        btnChaos.disabled = true;
        btnChaos.classList.add('crashing');

        try {
            const response = await fetch('/api/simulate-crash');
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`);
            }
            showDemoToast("Crash payload successfully injected into telemetry stream.", "warning");
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
