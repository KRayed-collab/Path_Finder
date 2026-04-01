// Theme Toggling Logic
const themeToggleBtn = document.getElementById('theme-toggle');
const root = document.documentElement;
const moonIcon = document.querySelector('.moon-icon');
const sunIcon = document.querySelector('.sun-icon');

const savedTheme = localStorage.getItem('theme');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
    root.setAttribute('data-theme', 'dark');
    moonIcon.style.display = 'none';
    sunIcon.style.display = 'block';
}

themeToggleBtn.addEventListener('click', () => {
    const isDark = root.getAttribute('data-theme') === 'dark';
    if (isDark) {
        root.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        moonIcon.style.display = 'block';
        sunIcon.style.display = 'none';
    } else {
        root.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        moonIcon.style.display = 'none';
        sunIcon.style.display = 'block';
    }
});

// Dynamic Graph State
let nodes = {
    "CSMT": { lat: 18.9398, lng: 72.8354 },
    "Hanging Gardens": { lat: 18.9566, lng: 72.8049 },
    "Crawford Market": { lat: 18.9458, lng: 72.8336 },
    "Colaba Causeway": { lat: 18.9189, lng: 72.8286 },
    "Gateway of India": { lat: 18.9220, lng: 72.8347 },
    "Marine Drive": { lat: 18.9440, lng: 72.8228 },
    "Bandra Link": { lat: 19.0354, lng: 72.8176 }
};

// Instead of hardcoded weights, we just store what connects to what,
// and the routes array stores the fetched OSRM physical road metadata.
let edgesList = [
    { source: "CSMT", target: "Crawford Market" },
    { source: "CSMT", target: "Hanging Gardens" },
    { source: "CSMT", target: "Bandra Link" },
    { source: "Hanging Gardens", target: "Colaba Causeway" },
    { source: "Hanging Gardens", target: "Gateway of India" },
    { source: "Crawford Market", target: "Gateway of India" },
    { source: "Colaba Causeway", target: "Marine Drive" },
    { source: "Colaba Causeway", target: "Gateway of India" }
];

let globalEdges = [];
let adjacencyList = {};

const map = L.map('map-container').setView([18.95, 72.82], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

let markers = {};
let edgeLayers = [];
let highlightedRouteLayers = [];

// DOM Elements
const startSelect = document.getElementById('start-node');
const endSelect = document.getElementById('end-node');
const roadStart = document.getElementById('road-start');
const roadEnd = document.getElementById('road-end');
const removeNodeSelect = document.getElementById('remove-node-select');
const statusText = document.getElementById('status-text');
const pathResult = document.getElementById('path-result');

function refreshDropdowns() {
    [startSelect, endSelect, roadStart, roadEnd, removeNodeSelect].forEach(select => {
        const currentVal = select.value;
        const firstOption = select.options[0].cloneNode(true);
        select.innerHTML = '';
        select.appendChild(firstOption);
        
        Object.keys(nodes).forEach(nodeName => {
            const opt = document.createElement('option');
            opt.value = nodeName;
            opt.textContent = nodeName;
            select.appendChild(opt);
        });
        
        if (nodes[currentVal]) {
            select.value = currentVal;
        } else {
            select.value = "";
        }
    });
}

function rebuildAdjacencyList() {
    adjacencyList = {};
    Object.keys(nodes).forEach(node => {
        adjacencyList[node] = [];
    });
    globalEdges.forEach(e => {
        if(adjacencyList[e.source] && adjacencyList[e.target]) {
            adjacencyList[e.source].push({ node: e.target, weight: e.weight, geometry: e.geometry, id: e.id });
            adjacencyList[e.target].push({ node: e.source, weight: e.weight, geometry: [...e.geometry].reverse(), id: e.id });
        }
    });
}

// Draw a single node
function drawNode(name) {
    if (markers[name]) map.removeLayer(markers[name]);
    const marker = L.marker([nodes[name].lat, nodes[name].lng])
        .bindPopup(`<b>${name}</b>`)
        .addTo(map);
    markers[name] = marker;
}

// Fetch OSRM Route
async function fetchRoute(source, target) {
    const lat1 = nodes[source].lat, lng1 = nodes[source].lng;
    const lat2 = nodes[target].lat, lng2 = nodes[target].lng;
    
    const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?geometries=geojson&overview=full`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.code === 'Ok') {
            const route = data.routes[0];
            // distance in kilometers
            const distance = route.distance / 1000;
            const geojsonCoords = route.geometry.coordinates; // [lng, lat]
            const latlngs = geojsonCoords.map(coord => [coord[1], coord[0]]);
            return { distance, latlngs };
        }
    } catch (err) {
        console.error("Route fetch error:", err);
    }
    // Fallback: straight line
    console.warn("Using straight line fallback for", source, target);
    const dist = getDistanceFromLatLonInKm(lat1, lng1, lat2, lng2);
    return { distance: dist, latlngs: [[lat1, lng1], [lat2, lng2]] };
}

// Math util for fallback
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = (lat2 - lat1) * (Math.PI/180);
    var dLon = (lon2 - lon1) * (Math.PI/180); 
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    var d = R * c; 
    return d;
}

function drawEdge(edgeObj) {
    const polyline = L.polyline(edgeObj.geometry, {
        color: '#9ca3af', // gray
        weight: 3,
        opacity: 0.6,
        dashArray: '5, 10'
    }).addTo(map);
    
    // Middle point for label
    const midPointIndex = Math.floor(edgeObj.geometry.length / 2);
    const midLatLng = edgeObj.geometry[midPointIndex];
    
    const tooltip = L.tooltip({
        permanent: true,
        direction: 'center',
        className: 'label-tooltip',
        opacity: 0.8
    })
    .setContent(`${edgeObj.weight.toFixed(1)} km`)
    .setLatLng(midLatLng)
    .addTo(map);
    
    edgeLayers.push({ id: edgeObj.id, polyline, tooltip });
}

// Initialize system
async function initGraph() {
    refreshDropdowns();
    Object.keys(nodes).forEach(n => drawNode(n));

    statusText.textContent = "Status: Loading road geometries from OSRM...";
    let edgeIdCounter = 0;

    for (const edge of edgesList) {
        if (!nodes[edge.source] || !nodes[edge.target]) continue;
        const res = await fetchRoute(edge.source, edge.target);
        const fullEdge = {
            id: ++edgeIdCounter,
            source: edge.source,
            target: edge.target,
            weight: res.distance,
            geometry: res.latlngs
        };
        globalEdges.push(fullEdge);
        drawEdge(fullEdge);
    }
    rebuildAdjacencyList();
    statusText.textContent = "Status: Ready.";
}

initGraph();


// Priority Queue for Dijkstra
class PriorityQueue {
    constructor() {
        this.collection = [];
    }
    enqueue(element) {
        if (this.isEmpty()) {
            this.collection.push(element);
        } else {
            let added = false;
            for (let i = 1; i <= this.collection.length; i++) {
                if (element[1] < this.collection[i - 1][1]) {
                    this.collection.splice(i - 1, 0, element);
                    added = true;
                    break;
                }
            }
            if (!added) {
                this.collection.push(element);
            }
        }
    }
    dequeue() { return this.collection.shift(); }
    isEmpty() { return this.collection.length === 0; }
}

function findShortestPath(startNode, endNode) {
    let distances = {};
    let backtrace = {};
    let geometries = {}; 
    let pq = new PriorityQueue();

    Object.keys(adjacencyList).forEach(node => {
        distances[node] = Infinity;
        backtrace[node] = null;
        geometries[node] = null;
    });

    distances[startNode] = 0;
    pq.enqueue([startNode, 0]);

    while (!pq.isEmpty()) {
        let shortestStep = pq.dequeue();
        let currentNode = shortestStep[0];

        adjacencyList[currentNode].forEach(neighbor => {
            let candidateWeight = distances[currentNode] + neighbor.weight;
            if (candidateWeight < distances[neighbor.node]) {
                distances[neighbor.node] = candidateWeight;
                backtrace[neighbor.node] = currentNode;
                geometries[neighbor.node] = neighbor.geometry; // store path geometry
                pq.enqueue([neighbor.node, candidateWeight]);
            }
        });
    }

    let pathNodes = [endNode];
    let pathGeometries = [];
    let lastStep = endNode;

    while (lastStep !== startNode) {
        if (!backtrace[lastStep]) return { path: null, distance: Infinity };
        pathGeometries.unshift(geometries[lastStep]);
        lastStep = backtrace[lastStep];
        pathNodes.unshift(lastStep);
    }

    // Collapse all tiny geometries into one fluid line
    const fullPathLatLngs = [];
    pathGeometries.forEach(geom => {
        fullPathLatLngs.push(...geom);
    });

    return { path: pathNodes, distance: distances[endNode], fullGeometry: fullPathLatLngs };
}

// ----------------- UX Interactions -----------------
let addPointMode = false;
const toggleAddPointBtn = document.getElementById('toggle-add-point-btn');

toggleAddPointBtn.addEventListener('click', () => {
    addPointMode = !addPointMode;
    if (addPointMode) {
        toggleAddPointBtn.classList.add('active-btn');
        toggleAddPointBtn.textContent = '📍 Add Point mode: ON (Click map)';
        document.getElementById('map-container').style.cursor = 'crosshair';
    } else {
        toggleAddPointBtn.classList.remove('active-btn');
        toggleAddPointBtn.textContent = '📍 Add Point mode: OFF';
        document.getElementById('map-container').style.cursor = '';
    }
});

map.on('click', (e) => {
    if (!addPointMode) return;
    const name = prompt("Enter a name for this new location:");
    if (!name || name.trim() === '') {
        alert("Location name cannot be empty.");
        return;
    }
    if (nodes[name]) {
        alert("A location with this name already exists.");
        return;
    }
    
    nodes[name] = { lat: e.latlng.lat, lng: e.latlng.lng };
    drawNode(name);
    refreshDropdowns();
    rebuildAdjacencyList();
    
    // turn off mode automatically
    toggleAddPointBtn.click();
    statusText.textContent = `Status: Added node '${name}'.`;
});

document.getElementById('add-road-btn').addEventListener('click', async () => {
    const s = roadStart.value;
    const t = roadEnd.value;
    if(!s || !t) return alert("Select From and To nodes for the new road.");
    if(s === t) return alert("Cannot connect a node to itself.");
    
    // check if exists
    if (globalEdges.find(e => (e.source === s && e.target === t) || (e.source === t && e.target === s))) {
        return alert("Road already exists between these points.");
    }
    
    document.getElementById('add-road-btn').disabled = true;
    statusText.textContent = "Status: Fetching actual road path from OSRM...";
    
    const res = await fetchRoute(s, t);
    const newEdge = { id: Date.now(), source: s, target: t, weight: res.distance, geometry: res.latlngs };
    
    globalEdges.push(newEdge);
    drawEdge(newEdge);
    rebuildAdjacencyList();
    
    statusText.textContent = `Status: Added road ${s} <-> ${t} (${res.distance.toFixed(2)} km).`;
    document.getElementById('add-road-btn').disabled = false;
});

document.getElementById('remove-node-btn').addEventListener('click', () => {
    const removeMe = removeNodeSelect.value;
    if (!removeMe) return;
    
    if(!confirm(`Are you sure you want to delete ${removeMe}? All connected roads will vanish.`)) return;

    // Remove node
    delete nodes[removeMe];
    if (markers[removeMe]) {
        map.removeLayer(markers[removeMe]);
        delete markers[removeMe];
    }
    
    // Remove edges connected
    const toKeep = [];
    globalEdges.forEach(e => {
        if (e.source === removeMe || e.target === removeMe) {
            // Find in edgelayers and remove visual
            const idx = edgeLayers.findIndex(el => el.id === e.id);
            if(idx > -1) {
                map.removeLayer(edgeLayers[idx].polyline);
                map.removeLayer(edgeLayers[idx].tooltip);
                edgeLayers.splice(idx, 1);
            }
        } else {
            toKeep.push(e);
        }
    });
    globalEdges = toKeep;
    
    clearMap(); 
    refreshDropdowns();
    rebuildAdjacencyList();
    statusText.textContent = `Status: Removed node '${removeMe}'.`;
});


// ----------------- Path Finding ----------------------
const findRouteBtn = document.getElementById('find-path-btn');
const clearRouteBtn = document.getElementById('clear-path-btn');

function clearMap() {
    highlightedRouteLayers.forEach(l => map.removeLayer(l));
    highlightedRouteLayers = [];
    startSelect.value = '';
    endSelect.value = '';
    statusText.textContent = 'Status: Ready.';
    pathResult.innerHTML = '';
}

findRouteBtn.addEventListener('click', () => {
    const start = startSelect.value;
    const end = endSelect.value;

    if (!start || !end) {
        statusText.textContent = 'Status: Error';
        pathResult.innerHTML = '<span style="color: red;">Please select both start and destination locations.</span>';
        return;
    }
    if (start === end) return;

    // Clear previous
    highlightedRouteLayers.forEach(l => map.removeLayer(l));
    highlightedRouteLayers = [];

    const result = findShortestPath(start, end);

    if (result.path) {
        statusText.textContent = `Status: Success (Total Route: ${result.distance.toFixed(2)} km)`;
        pathResult.innerHTML = `<strong>Path:</strong> <br/> ${result.path.join(' ➔ ')}`;

        const computedStyle = getComputedStyle(document.documentElement);
        let routeColor = computedStyle.getPropertyValue('--map-route-color').trim() || '#ef4444';
        
        const boldLine = L.polyline(result.fullGeometry, {
            color: routeColor,
            weight: 7,
            opacity: 0.9,
            lineJoin: 'round'
        }).addTo(map);

        highlightedRouteLayers.push(boldLine);
        map.fitBounds(boldLine.getBounds(), { padding: [50, 50] });

    } else {
        statusText.textContent = 'Status: Error';
        pathResult.innerHTML = `<span style="color: red;">No path found between ${start} and ${end}.</span>`;
    }
});

clearRouteBtn.addEventListener('click', clearMap);

// Injected CSS for tooltips
const style = document.createElement('style');
style.innerHTML = `
    .label-tooltip {
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        font-size: 10px;
        padding: 2px 4px;
        color: #000;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
`;
document.head.appendChild(style);
