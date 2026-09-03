// =====================================================
// WORKER ATTENDANCE SYSTEM
// FACE RECOGNITION + ATTENDANCE DASHBOARD
// =====================================================


// =====================================================
// 1. FACE API MODEL LOCATION
// =====================================================

const MODEL_URL = "./models";

    // =====================================================
// API BASE URL
// =====================================================

const API_URL = "https://noorali61.pythonanywhere.com";

// =====================================================
// OFFICE LOCATION (for geofencing)
// =====================================================

const OFFICE_LAT = 24.946650;
const OFFICE_LNG = 67.056869;
const ALLOWED_RADIUS_METERS = 200; // adjust if needed

// Workers who can mark attendance from anywhere (field/onsite workers)
const FIELD_WORKERS = [
    // add names here later, e.g. "irfan"
];


// Calculate distance between two GPS points (Haversine formula)
function getDistanceMeters(lat1, lon1, lat2, lon2) {

    const R = 6371000; // Earth radius in meters

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}


// Get current location as a Promise
function getCurrentLocation() {

    return new Promise((resolve, reject) => {

        if (!navigator.geolocation) {
            reject(new Error("Geolocation not supported"));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            (error) => {
                reject(error);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });
}

// Reverse-geocode a lat/lng into a readable area name using
// OpenStreetMap's free Nominatim API. Returns null on any failure
// (no API key, but keep this to ~1 request/sec and don't spam it).
async function reverseGeocode(latitude, longitude) {

    try {

        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=16&addressdetails=1`,
            {
                headers: {
                    "Accept-Language": "en"
                }
            }
        );

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        const address = data.address || {};

        // Prefer smaller, more specific areas first.
        const area =
            address.suburb ||
            address.neighbourhood ||
            address.residential ||
            address.town ||
            address.city_district ||
            address.city ||
            address.county ||
            null;

        return area;

    } catch (error) {

        console.warn("Reverse geocoding failed:", error);
        return null;
    }
}


// Build a Google Maps link + distance + area name for a table cell.
// Returns an HTML string (used with innerHTML on the Location <td> only).
function renderLocationCellHTML(latitude, longitude, distanceMeters, areaName) {

    if (latitude == null || longitude == null) {
        return "—";
    }

    const mapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
    const distanceText =
        distanceMeters != null
            ? `${Math.round(distanceMeters)}m`
            : "";

    const areaText =
        areaName
            ? `<br><span style="font-size:0.85em;color:#555;">${areaName}</span>`
            : "";

    return `${distanceText} <a href="${mapsLink}" target="_blank" rel="noopener">📍 View</a>${areaText}`;
}

// =====================================================
// 2. WORKERS
// =====================================================

const workerNames = [
    "ali",
    "taqi",
    "alam",
    "zaman",
    "anas",
    "irfan"
];

// =====================================================
// 3. GLOBAL VARIABLES
// =====================================================

let labeledDescriptors = [];
let faceMatcher = null;

let markedToday = new Set();
let attendanceRecords = {};

let recognitionRunning = false;
let attendanceClosed = false;

let recognitionInterval = null;


// =====================================================
// 4. TIME FORMAT
// =====================================================

function formatTime(date = new Date()) {

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    const ampm = hours >= 12 ? "PM" : "AM";

    hours = hours % 12;

    if (hours === 0) {
        hours = 12;
    }

    return `${String(hours).padStart(2, "0")}:${minutes}:${seconds} ${ampm}`;
}


// =====================================================
// 5. GET LOCAL DATE
// =====================================================

function getLocalDateString(date = new Date()) {

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


// =====================================================
// 6. LOAD FACE API MODELS
// =====================================================

async function loadModels() {

    console.log("Loading face recognition models...");

    try {

        await faceapi.nets.tinyFaceDetector.loadFromUri(
            MODEL_URL
        );

        await faceapi.nets.faceLandmark68Net.loadFromUri(
            MODEL_URL
        );

        await faceapi.nets.faceRecognitionNet.loadFromUri(
            MODEL_URL
        );

        console.log("Models loaded successfully ✅");

    } catch (error) {

        console.error(
            "Model loading error ❌",
            error
        );

        alert(
            "Face recognition models could not be loaded."
        );

        throw error;
    }
}


// =====================================================
// 7. REGISTER WORKERS
// =====================================================

async function registerWorkers() {

    console.log("Registering workers...");

    labeledDescriptors = [];

    for (const name of workerNames) {

        try {

            console.log(
                `Looking for ${name}.jpg...`
            );

            const img =
                await faceapi.fetchImage(
                    `./workers/${name}.jpg`
                );

            const detection =
                await faceapi
                    .detectSingleFace(
                        img,
                        new faceapi.TinyFaceDetectorOptions()
                    )
                    .withFaceLandmarks()
                    .withFaceDescriptor();

            if (!detection) {

                console.warn(
                    `No face found in ${name}.jpg`
                );

                continue;
            }

            const descriptor =
                new faceapi.LabeledFaceDescriptors(
                    name,
                    [detection.descriptor]
                );

            labeledDescriptors.push(
                descriptor
            );

            console.log(
                `${name} registered successfully ✅`
            );

        } catch (error) {

            console.warn(
                `Could not load ${name}.jpg`
            );

        }
    }


    if (labeledDescriptors.length === 0) {

        console.warn(
            "No worker photos are available."
        );

        return;
    }


    faceMatcher =
        new faceapi.FaceMatcher(
            labeledDescriptors,
            0.5
        );


    console.log(
        "Available workers for recognition:",
        labeledDescriptors.map(
            worker => worker.label
        )
    );
}


// =====================================================
// 8. START CAMERA
// =====================================================

async function startCamera() {

    const video =
        document.getElementById("camera");

    if (!video) {

        console.error(
            "Camera element not found ❌"
        );

        return;
    }


    try {

        const stream =
            await navigator.mediaDevices.getUserMedia({
                video: true
            });


        video.srcObject = stream;


        const message =
            document.getElementById(
                "cameraMessage"
            );


        if (message) {

            message.innerText =
                "Camera is ON";
        }


        console.log(
            "Camera started successfully ✅"
        );

    } catch (error) {

        console.error(
            "Camera error ❌",
            error
        );

        alert(
            "Camera could not be started. Please allow camera permission."
        );

        throw error;
    }
}


// =====================================================
// 9. GET PRESENT / LATE STATUS
// =====================================================

function getStatus() {

    const now =
        new Date();

    const hours =
        now.getHours();

    const minutes =
        now.getMinutes();


    // Before 9:15 AM = Present

    if (
        hours < 9 ||
        (
            hours === 9 &&
            minutes <= 15
        )
    ) {

        return "Present";
    }


    // After 9:15 AM = Late

    return "Late";
}


// =====================================================
// 10. MARK ATTENDANCE
// =====================================================

async function markAttendance(name) {

    if (markedToday.has(name)) {
        return;
    }

    // Try to get location for everyone (used for the dashboard's
    // Location column), but only ENFORCE the geofence for workers
    // who are not in FIELD_WORKERS.

    let location = null;
    let distance = null;
    let areaName = null;

    try {

        location = await getCurrentLocation();

        distance = getDistanceMeters(
            location.lat, location.lng,
            OFFICE_LAT, OFFICE_LNG
        );

        areaName = await reverseGeocode(location.lat, location.lng);

    } catch (error) {

        location = null;
        distance = null;
        areaName = null;
    }


    if (!FIELD_WORKERS.includes(name)) {

        if (!location) {

            alert(
                "Location access chahiye attendance mark karne ke liye. Please permission allow karein."
            );

            return;
        }

        if (distance > ALLOWED_RADIUS_METERS) {

            alert(
                `${capitalize(name)} office ke bahar hain (${Math.round(distance)}m door). Attendance mark nahi ho sakti.`
            );

            return;
        }
    }


    const status =
        getStatus();


    try {

        const response =
            await fetch(
                `${API_URL}/attendance`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        worker_name: name,
                        status: status,
                        latitude: location ? location.lat : null,
                        longitude: location ? location.lng : null,
                        area_name: areaName
                    })
                }
            );


        if (!response.ok) {

            throw new Error(
                `Backend returned ${response.status}`
            );
        }


        const result =
            await response.json();


        console.log(
            "Attendance response:",
            result
        );


        // Backend may tell us it was already saved,
        // or return the freshly saved record either way —
        // in both cases we store whatever location data
        // it gives back (falling back to what we captured
        // locally if the backend doesn't send it yet).

        markedToday.add(name);

        attendanceRecords[name] = {

            status:
                result.status || status,

            time:
                result.time
                    ? convertDatabaseTime(
                        result.time
                    )
                    : formatTime(),

            latitude:
                result.latitude !== undefined
                    ? result.latitude
                    : (location ? location.lat : null),

            longitude:
                result.longitude !== undefined
                    ? result.longitude
                    : (location ? location.lng : null),

            distance:
                result.distance_meters !== undefined
                    ? result.distance_meters
                    : distance,

            areaName:
                result.area_name !== undefined
                    ? result.area_name
                    : areaName
        };


        console.log(
            `${name} => ${status} saved successfully ✅`
        );


    } catch (error) {

        console.error(
            "Backend error ❌",
            error
        );

        // Don't permanently mark it locally
        // if database saving failed.

        markedToday.delete(name);

        alert(
            "Attendance could not be saved. Please make sure the backend is running."
        );

        return;
    }


    updateAttendanceTable();
    updateDashboard();
}


// =====================================================
// 11. CONVERT DATABASE 24-HOUR TIME TO AM/PM
// =====================================================

function convertDatabaseTime(timeString) {

    if (!timeString) {
        return "-";
    }


    // If already contains AM or PM

    if (
        timeString.includes("AM") ||
        timeString.includes("PM")
    ) {

        return timeString;
    }


    const parts =
        timeString.split(":");


    if (parts.length < 2) {
        return timeString;
    }


    let hours =
        parseInt(parts[0], 10);

    const minutes =
        parts[1];

    const seconds =
        parts[2] || "00";


    const ampm =
        hours >= 12 ? "PM" : "AM";


    hours =
        hours % 12;


    if (hours === 0) {
        hours = 12;
    }


    return (
        `${String(hours).padStart(2, "0")}:` +
        `${minutes}:` +
        `${seconds} ${ampm}`
    );
}

// =====================================================
// 12. CLOSE ATTENDANCE
// =====================================================

async function saveAbsent(name, retrying = false) {

    try {

        const response = await fetch(
            `${API_URL}/attendance`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    worker_name: name,
                    status: "Absent"
                })
            }
        );

        const result = await response.json();

        attendanceRecords[name] = {
            status: "Absent",
            time: "-",
            latitude: null,
            longitude: null,
            distance: null,
            areaName: null
        };

        console.log(
            `${name} marked Absent in database ✅`,
            result
        );

    } catch (error) {

        console.error(
            `Could not save Absent for ${name} ❌`,
            error
        );

        // Automatically retry once before giving up.

        if (!retrying) {

            console.log(
                `Retrying ${name}...`
            );

            await saveAbsent(name, true);

        } else {

            attendanceRecords[name] = {
                status: "Absent",
                time: "-",
                latitude: null,
                longitude: null,
                distance: null,
                areaName: null
            };
        }
    }
}


async function closeAttendance() {

    if (attendanceClosed) {
        return;
    }

    attendanceClosed = true;

    const pending = workerNames.filter(
        name => !attendanceRecords[name]
    );

    await Promise.all(
        pending.map(
            name => saveAbsent(name)
        )
    );

    updateAttendanceTable();
    updateDashboard();

    const message =
        document.getElementById("cameraMessage");

    if (message) {
        message.innerText = "Attendance is closed";
    }

    console.log("Attendance closed 🔴");
}

// =====================================================
// 13. UPDATE ATTENDANCE TABLE
// =====================================================

function updateAttendanceTable() {

    const table =
        document.getElementById(
            "attendanceTable"
        );


    if (!table) {

        console.error(
            "Attendance table not found ❌"
        );

        return;
    }


    table.innerHTML = "";


    workerNames.forEach(
        name => {

            const record =
                attendanceRecords[name];


            let status =
                "Not Marked";

            let time =
                "-";

            let latitude = null;
            let longitude = null;
            let distance = null;
            let areaName = null;


            if (record) {

                status =
                    record.status;

                time =
                    record.time;

                latitude = record.latitude ?? null;
                longitude = record.longitude ?? null;
                distance = record.distance ?? null;
                areaName = record.areaName ?? null;
            }


            const row =
                document.createElement(
                    "tr"
                );


            const nameCell =
                document.createElement(
                    "td"
                );


            nameCell.innerText =
                capitalize(name);


            const statusCell =
                document.createElement(
                    "td"
                );


            statusCell.innerText =
                status;


            const timeCell =
                document.createElement(
                    "td"
                );


            timeCell.innerText =
                time;


            const locationCell =
                document.createElement(
                    "td"
                );

            locationCell.innerHTML =
                renderLocationCellHTML(
                    latitude, longitude, distance, areaName
                );


            // Present

            if (
                status === "Present"
            ) {

                statusCell.style.color =
                    "green";

                statusCell.style.fontWeight =
                    "bold";
            }


            // Late

            else if (
                status === "Late"
            ) {

                statusCell.style.color =
                    "orange";

                statusCell.style.fontWeight =
                    "bold";
            }


            // Absent

            else if (
                status === "Absent"
            ) {

                statusCell.style.color =
                    "red";

                statusCell.style.fontWeight =
                    "bold";
            }


            row.appendChild(
                nameCell
            );

            row.appendChild(
                statusCell
            );

            row.appendChild(
                timeCell
            );

            row.appendChild(
                locationCell
            );


            table.appendChild(
                row
            );
        }
    );
}


// =====================================================
// 14. UPDATE DASHBOARD
// =====================================================

function updateDashboard() {

    const total =
        workerNames.length;


    let present = 0;
    let late = 0;
    let absent = 0;


    workerNames.forEach(
        name => {

            const record =
                attendanceRecords[name];


            if (!record) {
                return;
            }


            if (
                record.status === "Present"
            ) {

                present++;
            }

            else if (
                record.status === "Late"
            ) {

                late++;
            }

            else if (
                record.status === "Absent"
            ) {

                absent++;
            }
        }
    );


    const totalElement =
        document.getElementById(
            "totalWorkers"
        );


    if (totalElement) {

        totalElement.innerText =
            total;
    }


    const presentElement =
        document.getElementById(
            "presentWorkers"
        );


    if (presentElement) {

        presentElement.innerText =
            present;
    }


    const lateElement =
        document.getElementById(
            "lateWorkers"
        );


    if (lateElement) {

        lateElement.innerText =
            late;
    }


    const absentElement =
        document.getElementById(
            "absentWorkers"
        );


    if (absentElement) {

        absentElement.innerText =
            absent;
    }
}


// =====================================================
// 15. FACE RECOGNITION
// =====================================================

function recognizeLoop() {

    if (recognitionRunning) {
        return;
    }


    recognitionRunning = true;


    const video =
        document.getElementById(
            "camera"
        );


    console.log(
        "Face recognition started ✅"
    );


    recognitionInterval =
        setInterval(
            async () => {

                if (
                    !faceMatcher
                ) {
                    return;
                }


                if (
                    !video ||
                    video.readyState < 2
                ) {
                    return;
                }


                try {

                    const detection =
                        await faceapi
                            .detectSingleFace(
                                video,
                                new faceapi.TinyFaceDetectorOptions()
                            )
                            .withFaceLandmarks()
                            .withFaceDescriptor();


                    if (!detection) {
                        return;
                    }


                    const match =
                        faceMatcher.findBestMatch(
                            detection.descriptor
                        );


                    if (
                        match.label !== "unknown"
                    ) {

                        if (
                            !markedToday.has(
                                match.label
                            )
                        ) {

                            await markAttendance(
                                match.label
                            );
                        }
                    }


                } catch (error) {

                    console.error(
                        "Face recognition error ❌",
                        error
                    );
                }

            },
            2000
        );
}


// =====================================================
// 16. CAPITALIZE NAME
// =====================================================

function capitalize(name) {

    if (!name) {
        return "";
    }


    return (
        name.charAt(0).toUpperCase() +
        name.slice(1)
    );
}


// =====================================================
// 17. START CAMERA BUTTON
// =====================================================

const startButton =
    document.getElementById(
        "startCamera"
    );


if (startButton) {

    startButton.addEventListener(
        "click",
        async () => {

            try {

                console.log(
                    "Starting camera..."
                );

                await startCamera();

                recognizeLoop();

                console.log(
                    "Worker Attendance System is running ✅"
                );

            } catch (error) {

                console.error(
                    "System startup error ❌",
                    error
                );
            }
        }
    );
}


// =====================================================
// 18. CLOSE ATTENDANCE BUTTON
// =====================================================

const closeButton =
    document.getElementById(
        "closeAttendance"
    );


if (closeButton) {

    closeButton.addEventListener(
        "click",
        closeAttendance
    );
}


// =====================================================
// 19. LOAD TODAY'S ATTENDANCE
// =====================================================

async function loadTodayAttendance() {

    const dateStr =
        getLocalDateString();


    try {

        const response =
            await fetch(
                `${API_URL}/attendance/date/${dateStr}`
            );


        if (!response.ok) {

            throw new Error(
                `Backend returned ${response.status}`
            );
        }


        const records =
            await response.json();


        // Clear old local data

        attendanceRecords = {};
        markedToday.clear();


        records.forEach(
            record => {

                const name =
                    record.worker_name;


                // Only load workers that
                // currently exist.

                if (
                    workerNames.includes(
                        name.toLowerCase()
                    )
                ) {

                    const workerName =
                        name.toLowerCase();


                    attendanceRecords[
                        workerName
                    ] = {

                        status:
                            record.status,

                        time:
                            convertDatabaseTime(
                                record.attendance_time
                            ),

                        latitude:
                            record.latitude ?? null,

                        longitude:
                            record.longitude ?? null,

                        distance:
                            record.distance_meters ?? null,

                        areaName:
                            record.area_name ?? null
                    };


                    markedToday.add(
                        workerName
                    );
                }
            }
        );


        console.log(
            "Today's attendance loaded from database ✅",
            records
        );


    } catch (error) {

        console.error(
            "Could not load today's attendance ❌",
            error
        );
    }


    updateAttendanceTable();
    updateDashboard();
}


// =====================================================
// 20. INITIAL PAGE
// =====================================================

loadTodayAttendance();

// Preload models + register worker faces on page load,
// so clicking "Start Camera" is instant.
(async () => {

    try {

        console.log("Preloading models in background...");

        await loadModels();
        await registerWorkers();

        console.log("Ready — camera can now start instantly ✅");

    } catch (error) {

        console.error("Preload failed ❌", error);
    }

})();


// =====================================================
// 21. LOAD ATTENDANCE HISTORY BY DATE
// =====================================================

function loadHistoryByDate() {

    const dateInput =
        document.getElementById(
            "historyDate"
        );


    const historyTable =
        document.getElementById(
            "historyTable"
        );


    if (
        !dateInput ||
        !dateInput.value
    ) {

        alert(
            "Please select a date first."
        );

        return;
    }


    fetch(
        `${API_URL}/attendance/date/${dateInput.value}`
    )

        .then(
            response => {

                if (!response.ok) {

                    throw new Error(
                        `HTTP ${response.status}`
                    );
                }

                return response.json();
            }
        )

        .then(
            records => {

                historyTable.innerHTML =
                    "";


                if (
                    records.length === 0
                ) {

                    historyTable.innerHTML =
                        "<tr><td colspan='4'>No records found for this date.</td></tr>";

                    return;
                }


                records.forEach(
                    record => {

                        const row =
                            document.createElement(
                                "tr"
                            );


                        const nameCell =
                            document.createElement(
                                "td"
                            );


                        const statusCell =
                            document.createElement(
                                "td"
                            );


                        const timeCell =
                            document.createElement(
                                "td"
                            );


                        const locationCell =
                            document.createElement(
                                "td"
                            );


                        nameCell.innerText =
                            capitalize(
                                record.worker_name
                            );


                        statusCell.innerText =
                            record.status;


                        timeCell.innerText =
                            convertDatabaseTime(
                                record.attendance_time
                            );


                        locationCell.innerHTML =
                            renderLocationCellHTML(
                                record.latitude ?? null,
                                record.longitude ?? null,
                                record.distance_meters ?? null,
                                record.area_name ?? null
                            );


                        // Status colors

                        if (
                            record.status ===
                            "Present"
                        ) {

                            statusCell.style.color =
                                "green";

                            statusCell.style.fontWeight =
                                "bold";
                        }


                        else if (
                            record.status ===
                            "Late"
                        ) {

                            statusCell.style.color =
                                "orange";

                            statusCell.style.fontWeight =
                                "bold";
                        }


                        else if (
                            record.status ===
                            "Absent"
                        ) {

                            statusCell.style.color =
                                "red";

                            statusCell.style.fontWeight =
                                "bold";
                        }


                        row.appendChild(
                            nameCell
                        );

                        row.appendChild(
                            statusCell
                        );

                        row.appendChild(
                            timeCell
                        );

                        row.appendChild(
                            locationCell
                        );


                        historyTable.appendChild(
                            row
                        );
                    }
                );
            }
        )

        .catch(
            error => {

                console.error(
                    "Could not load history ❌",
                    error
                );


                historyTable.innerHTML =
                    "<tr><td colspan='4'>Error loading history. Is the backend running?</td></tr>";
            }
        );
}


// =====================================================
// 22. HISTORY BUTTON
// =====================================================

const historyButton =
    document.getElementById(
        "loadHistory"
    );


if (historyButton) {

    historyButton.addEventListener(
        "click",
        loadHistoryByDate
    );
}


// =====================================================
// 23. AUTO REFRESH TODAY'S ATTENDANCE
// =====================================================

// Refresh database data every 30 seconds.

setInterval(
    () => {

        if (!attendanceClosed) {

            loadTodayAttendance();
        }

    },
    30000
);


// =====================================================
// SYSTEM READY
// =====================================================

console.log(
    "Worker Attendance JavaScript loaded successfully ✅"
);

console.log(
    "Workers:",
    workerNames
);

console.log(
    "Zaman photo expected at: ./workers/zaman.jpg"
);