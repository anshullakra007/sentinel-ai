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
window.showDemoToast = function(message = "Feature locked in Demo Mode. Deployed for interview demonstration purposes.") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast-animate bg-neutral-900 border border-neutral-700 text-neutral-200 px-4 py-3 rounded-md shadow-lg flex items-center gap-3 text-sm font-mono pointer-events-auto';
    toast.innerHTML = `
        <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        ${message}
    `;
    
    container.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(100%)';
        toast.style.transition = 'all 0.3s ease-in';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Prompt 1: Pill Badges logic
function formatImpact(level) {
    if (!level) return { text: 'UNKNOWN', classes: 'bg-neutral-800 text-neutral-400 px-2 py-1 text-xs font-bold rounded-full border border-neutral-700' };
    const l = level.toLowerCase();
    if (l === 'high') return { text: 'CRITICAL', classes: 'bg-red-900/30 text-red-400 px-2 py-1 text-xs font-bold rounded-full border border-red-800' };
    if (l === 'medium') return { text: 'WARNING', classes: 'bg-amber-900/30 text-amber-400 px-2 py-1 text-xs font-bold rounded-full border border-amber-800' };
    return { text: 'LOW', classes: 'bg-green-900/30 text-green-400 px-2 py-1 text-xs font-bold rounded-full border border-green-800' };
}

// Prompt 2: The JS Parser
function renderDiff(patchText) {
    if (!patchText) return 'No patch suggested.';
    
    const lines = patchText.split('\n');
    let diffHtml = '';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const escapedLine = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        if (line.startsWith('+')) {
            diffHtml += `<span class="text-green-400 bg-green-900/30 w-full block px-2">${escapedLine}</span>\n`;
        } else if (line.startsWith('-')) {
            diffHtml += `<span class="text-red-400 bg-red-900/30 w-full block px-2">${escapedLine}</span>\n`;
        } else {
            diffHtml += `<span class="text-neutral-400 w-full block px-2">${escapedLine}</span>\n`;
        }
    }
    
    return diffHtml;
}

function renderFeed() {
    if (incidents.length === 0) {
        incidentFeed.innerHTML = `
            <div class="text-center py-12 flex flex-col items-center justify-center space-y-4">
                <span class="relative flex h-3 w-3">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                </span>
                <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Listening for telemetry...</span>
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
            ? `<span class="px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-400 border border-blue-800/50 text-[9px] font-bold animate-pulse">x${incident.occurrence_count}</span>` 
            : '';
        
        html += `
            <div onclick="selectIncident(${origIdx})" class="cursor-pointer transition-all duration-200 rounded-md p-4 bg-neutral-900/50 border ${isSelected ? 'border-neutral-500 shadow-md' : 'border-neutral-800 hover:border-neutral-600 hover:bg-neutral-800/50'}">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                        <span class="${impactInfo.classes}">${impactInfo.text}</span>
                        ${occurrenceBadge}
                    </div>
                    <span class="text-[10px] text-neutral-500 font-mono">${new Date().toLocaleTimeString()}</span>
                </div>
                <h3 class="text-sm font-semibold text-neutral-200 truncate" title="${incident.exception}">${incident.exception || 'Unknown Error'}</h3>
                <p class="text-[11px] text-neutral-500 mt-1 truncate font-mono">in <span class="text-neutral-400">${incident.parsed_file || 'unknown file'}</span></p>
            </div>
        `;
    });
    incidentFeed.innerHTML = html;
}

window.selectIncident = function(idx) {
    selectedIncidentIdx = idx;
    renderFeed(); // update selection styling
    
    // Reset Deployment State UI
    document.getElementById('diag-status').className = 'px-2 py-1 text-[10px] font-bold rounded-full border border-red-900/50 bg-red-950/30 text-red-400 flex items-center gap-1.5 transition-all duration-200 uppercase tracking-wider';
    document.getElementById('diag-status').innerHTML = '🚨 Incident Active';
    document.getElementById('btn-deploy').classList.remove('hidden');
    document.getElementById('btn-rollback').classList.add('hidden');

    const inc = incidents[idx];
    
    emptyState.classList.add('hidden');
    diagnosisContent.classList.remove('hidden');
    
    const impactInfo = formatImpact(inc.diagnostic?.impact_level);
    elImpact.className = `px-2 py-1 text-xs font-bold rounded-full border flex items-center gap-1.5 transition-all duration-200 ${impactInfo.classes}`;
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
        const res = await fetch(`${window.location.origin}/api/incidents`);
        const data = await res.json();
        
        if (data.incidents && data.incidents.length > seenIncidentCount) {
            incidents = data.incidents;
            
            if (selectedIncidentIdx === -1) {
                selectedIncidentIdx = 0;
                selectIncident(0);
            }
            
            seenIncidentCount = incidents.length;
            renderFeed();
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
    showDemoToast("Deploying patch and restarting containers...");
    
    // Toggle Status Banner
    const statusBanner = document.getElementById('diag-status');
    statusBanner.className = 'px-2 py-1 text-[10px] font-bold rounded-full border border-green-900/50 bg-green-950/30 text-green-400 flex items-center gap-1.5 transition-all duration-200 uppercase tracking-wider';
    statusBanner.innerHTML = '🟢 Patch Deployed & Monitoring';
    
    // Toggle Buttons
    document.getElementById('btn-deploy').classList.add('hidden');
    document.getElementById('btn-rollback').classList.remove('hidden');
}

window.rollbackPatch = function() {
    console.log("[SYSTEM] Manual rollback initiated by operator.");
    showDemoToast("Rollback executed. Cluster reverting to previous state.");
    
    // Revert Status Banner
    const statusBanner = document.getElementById('diag-status');
    statusBanner.className = 'px-2 py-1 text-[10px] font-bold rounded-full border border-red-900/50 bg-red-950/30 text-red-400 flex items-center gap-1.5 transition-all duration-200 uppercase tracking-wider';
    statusBanner.innerHTML = '🚨 Incident Active';
    
    // Toggle Buttons
    document.getElementById('btn-deploy').classList.remove('hidden');
    document.getElementById('btn-rollback').classList.add('hidden');
}

// Updated Chaos Trigger for Cloud Compatibility
const btnChaos = document.getElementById('btn-chaos');
if (btnChaos) {
    btnChaos.addEventListener('click', async () => {
        const originalText = btnChaos.innerHTML;
        btnChaos.innerHTML = '⚠️ CRASHING SERVER...';
        btnChaos.disabled = true;
        btnChaos.classList.add('opacity-50', 'cursor-not-allowed');

        try {
            // Hits the internal simulation endpoint using dynamic host resolution
            const targetUrl = `${window.location.origin}/api/simulate-crash`;
            const response = await fetch(targetUrl);
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`);
            }
            showDemoToast("Crash payload successfully injected into telemetry stream.");
        } catch (e) {
            console.error("Failed to trigger simulation:", e);
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = 'toast-animate bg-red-950 border border-red-800 text-red-200 px-4 py-3 rounded-md shadow-lg flex items-center gap-3 text-sm font-mono pointer-events-auto';
            toast.innerHTML = `
                <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Failed to trigger chaos: ${e.message}
            `;
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(100%)';
                toast.style.transition = 'all 0.3s ease-in';
                setTimeout(() => toast.remove(), 300);
            }, 4000);
        } finally {
            setTimeout(() => {
                btnChaos.innerHTML = originalText;
                btnChaos.disabled = false;
                btnChaos.classList.remove('opacity-50', 'cursor-not-allowed');
            }, 2000);
        }
    });
}
