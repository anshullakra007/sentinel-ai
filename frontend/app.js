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

// Prompt 1: Pill Badges logic
function formatImpact(level) {
    if (!level) return { text: 'UNKNOWN', classes: 'bg-neutral-800 text-neutral-400 px-2 py-1 text-xs font-bold rounded-full border border-neutral-700' };
    const l = level.toLowerCase();
    if (l === 'high') return { text: 'CRITICAL', classes: 'bg-red-900/30 text-red-400 px-2 py-1 text-xs font-bold rounded-full border border-red-800' };
    if (l === 'medium') return { text: 'WARNING', classes: 'bg-amber-900/30 text-amber-400 px-2 py-1 text-xs font-bold rounded-full border border-amber-800' };
    return { text: 'LOW', classes: 'bg-green-900/30 text-green-400 px-2 py-1 text-xs font-bold rounded-full border border-green-800' };
}

// Prompt 2: The JS Parser
// Write a short, easy-to-understand JavaScript function called renderDiff(patchText)
function renderDiff(patchText) {
    if (!patchText) return 'No patch suggested.';
    
    // Split the text by newlines (\n)
    const lines = patchText.split('\n');
    let diffHtml = '';
    
    // Loop through each line and apply conditional styling
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Escape HTML tags to prevent broken rendering
        const escapedLine = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Conditional Styling based on diff prefixes
        if (line.startsWith('+')) {
            // Green for added lines
            diffHtml += `<span class="text-green-400 bg-green-900/30 w-full block px-2">${escapedLine}</span>\n`;
        } else if (line.startsWith('-')) {
            // Red for removed lines
            diffHtml += `<span class="text-red-400 bg-red-900/30 w-full block px-2">${escapedLine}</span>\n`;
        } else {
            // Standard gray for unchanged lines
            diffHtml += `<span class="text-neutral-400 w-full block px-2">${escapedLine}</span>\n`;
        }
    }
    
    return diffHtml;
}

function renderFeed() {
    if (incidents.length === 0) {
        incidentFeed.innerHTML = '<div class="text-center text-neutral-500 text-xs py-10 font-mono">No incidents detected yet...</div>';
        return;
    }

    let html = '';
    incidents.slice().reverse().forEach((incident, revIdx) => {
        // Correct index relative to original array
        const origIdx = incidents.length - 1 - revIdx;
        const isSelected = origIdx === selectedIncidentIdx;
        const impactInfo = formatImpact(incident.diagnostic?.impact_level);
        
        html += `
            <div onclick="selectIncident(${origIdx})" class="cursor-pointer transition-colors duration-200 rounded-md p-4 bg-neutral-900 border ${isSelected ? 'border-neutral-500' : 'border-neutral-800 hover:border-neutral-600'}">
                <div class="flex items-center justify-between mb-3">
                    <span class="${impactInfo.classes}">${impactInfo.text}</span>
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
    
    const inc = incidents[idx];
    
    // Hide empty state, show content
    emptyState.classList.add('hidden');
    diagnosisContent.classList.remove('hidden');
    
    // Populate data
    const impactInfo = formatImpact(inc.diagnostic?.impact_level);
    elImpact.className = impactInfo.classes;
    elImpact.textContent = impactInfo.text;
    
    elService.textContent = inc.service_name || 'unknown-service';
    elTime.textContent = 'Reported just now';
    
    elException.textContent = inc.exception || 'Exception occurred';
    
    // If we have AI diagnosis
    if (inc.diagnostic) {
        elRootCause.innerHTML = inc.diagnostic.root_cause ? inc.diagnostic.root_cause.replace(/\\n/g, '<br>') : 'No root cause identified.';
        
        // Inject the parsed diff into the patch element
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
        
        if (data.incidents && data.incidents.length > seenIncidentCount) {
            incidents = data.incidents;
            
            // Auto-select the first incident if none selected
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

// Prompt 3: Trigger Chaos Button Logic
const btnChaos = document.getElementById('btn-chaos');
if (btnChaos) {
    btnChaos.addEventListener('click', async () => {
        // Change text and disable
        const originalText = btnChaos.innerHTML;
        btnChaos.innerHTML = '⚠️ Crashing Server...';
        btnChaos.disabled = true;
        btnChaos.classList.add('opacity-50', 'cursor-not-allowed');

        console.log("Crash payload sent to telemetry server.");

        try {
            await fetch('http://localhost:8001/crash');
        } catch (e) {
            console.error("Failed to reach vulnerable app:", e);
        }

        // Re-enable after 2 seconds
        setTimeout(() => {
            btnChaos.innerHTML = originalText;
            btnChaos.disabled = false;
            btnChaos.classList.remove('opacity-50', 'cursor-not-allowed');
        }, 2000);
    });
}

