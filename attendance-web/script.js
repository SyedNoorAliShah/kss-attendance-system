// =====================================================
// WORKER ATTENDANCE SYSTEM
// FACE RECOGNITION + ATTENDANCE DASHBOARD
// =====================================================


// =====================================================
// 1. FACE API MODEL LOCATION
// =====================================================

const MODEL_URL =
    "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js/weights";

    // =====================================================
// API BASE URL
// =====================================================

const API_URL = "https://noorali61.pythonanywhere.com";


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
                        status: status
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


        // Backend may tell us it was already saved

        if (
            result.message &&
            result.message.includes(
                "already marked"
            )
        ) {

            markedToday.add(name);

            attendanceRecords[name] = {

                status:
                    result.status || status,

                time:
                    result.time
                        ? convertDatabaseTime(
                            result.time
                        )
                        : formatTime()
            };

        } else {

            markedToday.add(name);

            attendanceRecords[name] = {

                status:
                    result.status || status,

                time:
                    result.time
                        ? convertDatabaseTime(
                            result.time
                        )
                        : formatTime()
            };
        }


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

async function closeAttendance() {

    if (attendanceClosed) {
        return;
    }

    attendanceClosed = true;

    for (const name of workerNames) {

        if (!attendanceRecords[name]) {

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
                    time: "-"
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

                // Still show as Absent locally even if
                // the database save failed.

                attendanceRecords[name] = {
                    status: "Absent",
                    time: "-"
                };
            }
        }
    }

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


            if (record) {

                status =
                    record.status;

                time =
                    record.time;
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
                            )
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
                        "<tr><td colspan='3'>No records found for this date.</td></tr>";

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
                    "<tr><td colspan='3'>Error loading history. Is the backend running?</td></tr>";
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