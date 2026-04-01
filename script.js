// Theme Toggling Logic
const themeToggleBtn = document.getElementById('theme-toggle');
const root = document.documentElement;
const moonIcon = document.querySelector('.moon-icon');
const sunIcon = document.querySelector('.sun-icon');

// Check for saved theme preference or system preference
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
    
    // Optional: Refresh map tiles for dark mode if using a dark tile layer 
    // Here we're using a single standard tile layer, but this hook allows dynamic tile switching.
});


// Map Data Mapping (Original Nodes -> NY Coordinates)
const nodes = {
    "City Hall": { lat: 40.7128, lng: -74.0060 },
    "Central Park": { lat: 40.7851, lng: -73.9682 },
    "Main Library": { lat: 40.7532, lng: -73.9822 },
    "Grand Station": { lat: 40.7527, lng: -73.9772 },
    "Museum": { lat: 40.7794, lng: -73.9632 },
    "Airport": { lat: 40.6413, lng: -73.7781 },
    "School": { lat: 40.8075, lng: -73.9626 }
};

// Original Graph Edges
const edges = [
    { source: "City Hall", target: "Main Library", weight: 4.5 },
    { source: "City Hall", target: "Central Park", weight: 2.8 },
    { source: "City Hall", target: "School", weight: 6.0 },
    { source: "Central Park", target: "Grand Station", weight: 3.1 },
    { source: "Central Park", target: "Museum", weight: 2.0 },
    { source: "Main Library", target: "Museum", weight: 1.5 },
    { source: "Grand Station", target: "Airport", weight: 5.2 },
    { source: "Grand Station", target: "Museum", weight: 2.5 }
];

// Build Adjacency List for Dijkstra
const adjacencyList = {};
Object.keys(nodes).forEach(node => {
    adjacencyList[node] = [];
});

edges.forEach(edge => {
    // Undirected graph
    adjacencyList[edge.source].push({ node: edge.target, weight: edge.weight });
    adjacencyList[edge.target].push({ node: edge.source, weight: edge.weight });
});

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
    dequeue() {
        let value = this.collection.shift();
        return value;
    }
    isEmpty() {
        return (this.collection.length === 0);
    }
}

// Dijkstra's Algorithm implementation
function findShortestPath(startNode, endNode) {
    let distances = {};
    let backtrace = {};
    let pq = new PriorityQueue();

    // Initialization
    Object.keys(adjacencyList).forEach(node => {
        distances[node] = Infinity;
        backtrace[node] = null;
    });

    distances[startNode] = 0;
    pq.enqueue([startNode, 0]);

    while (!pq.isEmpty()) {
        let shortestStep = pq.dequeue();
        let currentNode = shortestStep[0];
        let currentWeight = shortestStep[1];

        // Process neighbors
        adjacencyList[currentNode].forEach(neighbor => {
            let candidateWeight = distances[currentNode] + neighbor.weight;
            
            if (candidateWeight < distances[neighbor.node]) {
                distances[neighbor.node] = candidateWeight;
                backtrace[neighbor.node] = currentNode;
                pq.enqueue([neighbor.node, candidateWeight]);
            }
        });
    }

    // Path reconstruction
    let path = [endNode];
    let lastStep = endNode;

    while (lastStep !== startNode) {
        // If there's no path
        if (!backtrace[lastStep]) {
            return { path: null, distance: Infinity };
        }
        path.unshift(backtrace[lastStep]);
        lastStep = backtrace[lastStep];
    }

    return { path: path, distance: distances[endNode] };
}

// Initialize Leaflet Map
const map = L.map('map-container').setView([40.75, -73.97], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// Add Markers and populate Select Dropdowns
const startSelect = document.getElementById('start-node');
const endSelect = document.getElementById('end-node');
const markers = {};

Object.keys(nodes).forEach(nodeName => {
    // Add marker
    const marker = L.marker([nodes[nodeName].lat, nodes[nodeName].lng])
        .bindPopup(`<b>${nodeName}</b>`)
        .addTo(map);
    markers[nodeName] = marker;

    // Add options to dropdowns
    const option1 = document.createElement('option');
    option1.value = nodeName;
    option1.textContent = nodeName;
    startSelect.appendChild(option1);

    const option2 = document.createElement('option');
    option2.value = nodeName;
    option2.textContent = nodeName;
    endSelect.appendChild(option2);
});

// Draw Static Edges
const staticEdgeLayers = [];
edges.forEach(edge => {
    const p1 = [nodes[edge.source].lat, nodes[edge.source].lng];
    const p2 = [nodes[edge.target].lat, nodes[edge.target].lng];
    
    // Draw polyline
    const polyline = L.polyline([p1, p2], {
        color: '#9ca3af', // gray
        weight: 3,
        opacity: 0.6,
        dashArray: '5, 10'
    }).addTo(map);
    
    staticEdgeLayers.push(polyline);
    
    // Calculate midpoint to place distance label
    const midLat = (p1[0] + p2[0]) / 2;
    const midLng = (p1[1] + p2[1]) / 2;
    
    // Add small text label for weight
    L.tooltip({
        permanent: true,
        direction: 'center',
        className: 'label-tooltip',
        opacity: 0.8
    })
    .setContent(edge.weight.toString())
    .setLatLng([midLat, midLng])
    .addTo(map);
});

// Interactivity logic
let highlightedRoute = null;

const findRouteBtn = document.getElementById('find-path-btn');
const clearRouteBtn = document.getElementById('clear-path-btn');
const statusText = document.getElementById('status-text');
const pathResult = document.getElementById('path-result');

function clearMap() {
    if (highlightedRoute) {
        map.removeLayer(highlightedRoute);
        highlightedRoute = null;
    }
    startSelect.value = '';
    endSelect.value = '';
    statusText.textContent = 'Status: Ready.';
    pathResult.innerHTML = '';
    map.setView([40.75, -73.97], 11);
}

findRouteBtn.addEventListener('click', () => {
    const start = startSelect.value;
    const end = endSelect.value;

    if (!start || !end) {
        statusText.textContent = 'Status: Error';
        pathResult.innerHTML = '<span style="color: red;">Please select both start and destination locations.</span>';
        return;
    }

    if (start === end) {
        statusText.textContent = 'Status: Info';
        pathResult.innerHTML = `<span>Start and destination are the same (${start}).</span>`;
        return;
    }

    // Remove previous route if exists
    if (highlightedRoute) {
        map.removeLayer(highlightedRoute);
    }

    const result = findShortestPath(start, end);

    if (result.path) {
        statusText.textContent = `Status: Success (Total Distance: ${result.distance.toFixed(1)})`;
        pathResult.innerHTML = `<strong>Path:</strong> <br/> ${result.path.join(' ➔ ')}`;

        // Draw new route
        const latlngs = result.path.map(node => [nodes[node].lat, nodes[node].lng]);
        
        // CSS custom property retrieval for route color
        const computedStyle = getComputedStyle(document.documentElement);
        let routeColor = computedStyle.getPropertyValue('--map-route-color').trim() || '#ef4444';
        
        highlightedRoute = L.polyline(latlngs, {
            color: routeColor,
            weight: 6,
            opacity: 0.9,
            lineJoin: 'round'
        }).addTo(map);

        // Fit map bounds to show full route with some padding
        map.fitBounds(highlightedRoute.getBounds(), { padding: [50, 50] });

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
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 10px;
        padding: 2px 4px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    [data-theme="dark"] .label-tooltip {
        background: rgba(31, 41, 55, 0.9);
        border-color: #4b5563;
        color: #f9fafb;
    }
`;
document.head.appendChild(style);
