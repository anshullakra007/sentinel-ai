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

function formatImpact(level) {
    if (!level) return { text: 'UNKNOWN', dot: 'bg-zinc-500', classes: 'border-zinc-700 text-zinc-400 bg-surface/50' };
    const l = level.toLowerCase();
    if (l === 'high') return { text: 'HIGH SEVERITY', dot: 'bg-danger', classes: 'border-zinc-700 text-zinc-200 bg-surface/50' };
    if (l === 'medium') return { text: 'MEDIUM SEVERITY', dot: 'bg-warning', classes: 'border-zinc-700 text-zinc-200 bg-surface/50' };
    return { text: 'LOW SEVERITY', dot: 'bg-accent', classes: 'border-zinc-700 text-zinc-200 bg-surface/50' };
}

function renderFeed() {
    if (incidents.length === 0) {
        incidentFeed.innerHTML = '<div class="text-center text-zinc-500 text-xs py-10 font-mono">No incidents detected yet...</div>';
        return;
    }

    let html = '';
    incidents.slice().reverse().forEach((incident, revIdx) => {
        // Correct index relative to original array
        const origIdx = incidents.length - 1 - revIdx;
        const isSelected = origIdx === selectedIncidentIdx;
        const impactInfo = formatImpact(incident.diagnostic?.impact_level);
        
        html += `
            <div onclick="selectIncident(${origIdx})" class="cursor-pointer transition-all duration-200 rounded-md p-3 border ${isSelected ? 'bg-zinc-800 border-zinc-600' : 'bg-surface/30 border-border hover:bg-surface/80 hover:border-zinc-700'}">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-[10px] font-mono px-1.5 py-0.5 rounded border ${impactInfo.classes} flex items-center gap-1.5">
                        <div class="h-1.5 w-1.5 rounded-full ${impactInfo.dot}"></div>
                        ${impactInfo.text}
                    </span>
                    <span class="text-[10px] text-zinc-500 font-mono">${new Date().toLocaleTimeString()}</span>
                </div>
                <h3 class="text-xs font-semibold text-zinc-200 truncate" title="${incident.exception}">${incident.exception || 'Unknown Error'}</h3>
                <p class="text-[10px] text-zinc-500 mt-1 truncate font-mono">in <span class="text-zinc-400">${incident.parsed_file || 'unknown file'}</span></p>
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
    elImpact.className = `px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded border flex items-center gap-1.5 ${impactInfo.classes}`;
    elImpact.innerHTML = `<div class="h-1.5 w-1.5 rounded-full ${impactInfo.dot}"></div> ${impactInfo.text}`;
    
    elService.textContent = inc.service_name || 'unknown-service';
    elTime.textContent = 'Reported just now';
    
    elException.textContent = inc.exception || 'Exception occurred';
    
    // If we have AI diagnosis
    if (inc.diagnostic) {
        elRootCause.innerHTML = inc.diagnostic.root_cause ? inc.diagnostic.root_cause.replace(/\\n/g, '<br>') : 'No root cause identified.';
        elPatch.textContent = inc.diagnostic.suggested_patch || 'No patch suggested.';
    } else {
        elRootCause.textContent = 'Diagnostic pending or failed.';
        elPatch.textContent = 'N/A';
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
