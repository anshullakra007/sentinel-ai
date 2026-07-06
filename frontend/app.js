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
    if (!level) return { text: 'UNKNOWN', classes: 'bg-gray-500/20 text-gray-500' };
    const l = level.toLowerCase();
    if (l === 'high') return { text: 'HIGH SEVERITY', classes: 'bg-danger/20 text-danger border border-danger/30' };
    if (l === 'medium') return { text: 'MEDIUM SEVERITY', classes: 'bg-warning/20 text-warning border border-warning/30' };
    return { text: 'LOW SEVERITY', classes: 'bg-primary/20 text-primary border border-primary/30' };
}

function renderFeed() {
    if (incidents.length === 0) {
        incidentFeed.innerHTML = '<div class="text-center text-gray-500 py-10 italic">No incidents detected yet...</div>';
        return;
    }

    let html = '';
    incidents.slice().reverse().forEach((incident, revIdx) => {
        // Correct index relative to original array
        const origIdx = incidents.length - 1 - revIdx;
        const isSelected = origIdx === selectedIncidentIdx;
        const impactInfo = formatImpact(incident.diagnostic?.impact_level);
        
        html += `
            <div onclick="selectIncident(${origIdx})" class="cursor-pointer transition-all duration-200 rounded-xl p-4 border ${isSelected ? 'bg-surface border-primary/50 shadow-[0_0_15px_rgba(79,70,229,0.15)]' : 'bg-surface/50 border-border hover:bg-surface hover:border-gray-600'}">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-mono px-2 py-0.5 rounded ${impactInfo.classes}">${impactInfo.text}</span>
                    <span class="text-xs text-gray-500">${new Date().toLocaleTimeString()}</span>
                </div>
                <h3 class="text-sm font-semibold text-gray-200 truncate" title="${incident.exception}">${incident.exception || 'Unknown Error'}</h3>
                <p class="text-xs text-gray-400 mt-1 truncate">in <span class="text-gray-300 font-mono">${incident.parsed_file || 'unknown file'}</span></p>
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
    elImpact.className = `px-2.5 py-1 text-xs font-bold uppercase rounded-md ${impactInfo.classes}`;
    elImpact.textContent = impactInfo.text;
    
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
