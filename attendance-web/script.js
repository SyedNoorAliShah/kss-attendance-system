// =====================================================
// WORKER ATTENDANCE SYSTEM
// =====================================================

const BACKEND_URL = "https://noorali61.pythonanywhere.com";

const MODEL_URL =
    "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js/weights";

const workerNames = [
    "ali",
    "taqi",
    "alam",
    "zaman",
    "anas",
    "irfan"
];

let labeledDescriptors = [];
let faceMatcher = null;
let markedToday = new Set();
let attendanceRecords = {};
let recognitionRunning = false;
let attendanceClosed = false;
let systemStarted = false;


async function loadModels() {
    console.log("Loading face recognition models...");
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        console.log("Models loaded successfully ✅");
    } catch (error) {
        console.error("Model loading error ❌", error);
        alert("Face recognition models could not be loaded.");
        throw error;
    }
}


async function registerWorkers() {
    console.log("Registering workers...");
    labeledDescriptors = [];

    for (const name of workerNames) {
        try {
            const img = await faceapi.fetchImage(`./workers/${name}.jpg`);
            const detection = await faceapi
                .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) {
                console.warn(`No face found in ${name}.jpg`);
                continue;
            }

            labeledDescriptors.push(
                new faceapi.LabeledFaceDescriptors(name, [detection.descriptor])
            );

            console.log(`${name} registered successfully ✅`);
        } catch (error) {
            console.warn(`Could not load ${name}.jpg`);
        }
    }

    if (labeledDescriptors.length === 0) {
        console.warn("No worker photos are available yet.");
        return;
    }

    faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.5);
    console.log("Available workers for recognition:", labeledDescriptors.map(w => w.label));
}


async function startCamera() {
    const video = document.getElementById("camera");
    if (!video) {
        console.error("Camera element not found ❌");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        document.getElementById("cameraMessage").innerText = "Camera is ON";
        console.log("Camera started successfully ✅");
    } catch (error) {
        console.error("Camera error ❌", error);
        alert("Camera could not be started. Please allow camera permission.");
        throw error;
    }
}


function getStatus() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    if (hours < 9 || (hours === 9 && minutes <= 15)) return "Present";
    return "Late";
}


function getLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({ latitude: null, longitude: null });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                });
            },
            () => {
                resolve({ latitude: null, longitude: null });
            }
        );
    });
}


async function markAttendance(name) {
    if (markedToday.has(name)) {
        return;
    }

    markedToday.add(name);
    const status = getStatus();
    const location = await getLocation();

    try {
        const response = await fetch(`${BACKEND_URL}/attendance`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                worker_name: name,
                status: status,
                latitude: location.latitude,
                longitude: location.longitude
            })
        });

        const result = await response.json();
        console.log(result.message, result);

        attendanceRecords[name] = {
            status: result.status || status,
            time: result.time || new Date().toLocaleTimeString(),
            latitude: result.latitude ?? location.latitude,
            longitude: result.longitude ?? location.longitude
        };
    } catch (error) {
        console.error("Backend error ❌", error);
        attendanceRecords[name] = {
            status: status,
            time: new Date().toLocaleTimeString(),
            latitude: location.latitude,
            longitude: location.longitude
        };
    }

    updateAttendanceTable();
    updateDashboard();
}


function closeAttendance() {
    if (attendanceClosed) return;
    attendanceClosed = true;

    workerNames.forEach(name => {
        if (!attendanceRecords[name]) {
            attendanceRecords[name] = { status: "Absent", time: "-", latitude: null, longitude: null };
        }
    });

    updateAttendanceTable();
    updateDashboard();

    const message = document.getElementById("cameraMessage");
    if (message) message.innerText = "Attendance is closed";
    console.log("Attendance closed 🔴");
}


function updateAttendanceTable() {
    const table = document.getElementById("attendanceTable");
    if (!table) return;

    table.innerHTML = "";

    workerNames.forEach(name => {
        const record = attendanceRecords[name];
        let status = "Not Marked";
        let time = "-";
        let latitude = null;
        let longitude = null;

        if (record) {
            status = record.status;
            time = record.time;
            latitude = record.latitude ?? null;
            longitude = record.longitude ?? null;
        }

        const row = document.createElement("tr");
        const nameCell = document.createElement("td");
        nameCell.innerText = capitalize(name);

        const statusCell = document.createElement("td");
        statusCell.innerText = status;

        const timeCell = document.createElement("td");
        timeCell.innerText = time;

        const locationCell = document.createElement("td");
        if (latitude != null && longitude != null) {
            locationCell.innerHTML = `<a href="https://www.google.com/maps?q=${latitude},${longitude}" target="_blank" rel="noopener">📍 View</a>`;
        } else {
            locationCell.innerText = "-";
        }

        if (status === "Present") {
            statusCell.style.color = "green";
            statusCell.style.fontWeight = "bold";
        } else if (status === "Late") {
            statusCell.style.color = "orange";
            statusCell.style.fontWeight = "bold";
        } else if (status === "Absent") {
            statusCell.style.color = "red";
            statusCell.style.fontWeight = "bold";
        }

        row.appendChild(nameCell);
        row.appendChild(statusCell);
        row.appendChild(timeCell);
        row.appendChild(locationCell);
        table.appendChild(row);
    });
}


function updateDashboard() {
    const total = workerNames.length;
    let present = 0, late = 0, absent = 0;

    workerNames.forEach(name => {
        const record = attendanceRecords[name];
        if (!record) return;
        if (record.status === "Present") present++;
        else if (record.status === "Late") late++;
        else if (record.status === "Absent") absent++;
    });

    const totalElement = document.getElementById("totalWorkers");
    if (totalElement) totalElement.innerText = total;

    const presentElement = document.getElementById("presentWorkers");
    if (presentElement) presentElement.innerText = present;

    const lateElement = document.getElementById("lateWorkers");
    if (lateElement) lateElement.innerText = late;

    const absentElement = document.getElementById("absentWorkers");
    if (absentElement) absentElement.innerText = absent;
}


function recognizeLoop() {
    if (recognitionRunning) return;
    recognitionRunning = true;

    const video = document.getElementById("camera");
    console.log("Face recognition started ✅");

    setInterval(async () => {
        if (!faceMatcher) return;
        if (video.readyState < 2) return;

        try {
            const detection = await faceapi
                .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) return;

            const match = faceMatcher.findBestMatch(detection.descriptor);

            if (match.label !== "unknown") {
                if (!markedToday.has(match.label)) {
                    markAttendance(match.label);
                }
            }
        } catch (error) {
            console.error("Face recognition error ❌", error);
        }
    }, 2000);
}


function capitalize(name) {
    if (!name) return "";
    return name.charAt(0).toUpperCase() + name.slice(1);
}


const startButton = document.getElementById("startCamera");

if (startButton) {
    startButton.addEventListener("click", async () => {
        if (systemStarted) {
            console.log("System already running, ignoring click.");
            return;
        }

        systemStarted = true;
        startButton.disabled = true;
        startButton.innerText = "Camera Running...";

        try {
            await loadModels();
            await registerWorkers();
            await startCamera();
            recognizeLoop();
            startButton.innerText = "Camera Running ✅";
        } catch (error) {
            console.error("System startup error ❌", error);
            systemStarted = false;
            startButton.disabled = false;
            startButton.innerText = "Start Camera";
        }
    });
}


const closeButton = document.getElementById("closeAttendance");
if (closeButton) {
    closeButton.addEventListener("click", closeAttendance);
}


function loadHistoryByDate() {
    const dateInput = document.getElementById("historyDate");
    const historyTable = document.getElementById("historyTable");

    if (!dateInput || !dateInput.value) {
        alert("Please select a date first.");
        return;
    }

    fetch(`${BACKEND_URL}/attendance/date/${dateInput.value}`)
        .then(response => response.json())
        .then(records => {
            historyTable.innerHTML = "";

            if (records.length === 0) {
                historyTable.innerHTML = "<tr><td colspan='4'>No records found for this date.</td></tr>";
                return;
            }

            records.forEach(record => {
                const row = document.createElement("tr");

                const nameCell = document.createElement("td");
                nameCell.innerText = capitalize(record.worker_name);

                const statusCell = document.createElement("td");
                statusCell.innerText = record.status;

                const timeCell = document.createElement("td");
                timeCell.innerText = record.attendance_time;

                const locationCell = document.createElement("td");
                if (record.latitude != null && record.longitude != null) {
                    locationCell.innerHTML = `<a href="https://www.google.com/maps?q=${record.latitude},${record.longitude}" target="_blank" rel="noopener">📍 View</a>`;
                } else {
                    locationCell.innerText = "-";
                }

                row.appendChild(nameCell);
                row.appendChild(statusCell);
                row.appendChild(timeCell);
                row.appendChild(locationCell);
                historyTable.appendChild(row);
            });
        })
        .catch(error => {
            console.error("Could not load history ❌", error);
            historyTable.innerHTML = "<tr><td colspan='4'>Error loading history. Is the backend running?</td></tr>";
        });
}

const historyBtn = document.getElementById("loadHistory");
if (historyBtn) {
    historyBtn.addEventListener("click", loadHistoryByDate);
}


updateAttendanceTable();
updateDashboard();