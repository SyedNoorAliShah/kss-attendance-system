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
// 2. WORKERS
// =====================================================

// We currently have 4 workers.
//
// Their photos:
// workers/ali.jpg
// workers/taqi.jpg
// workers/alam.jpg
// workers/moiz.jpg

const workerNames = [
    "ali",
    "taqi",
    "alam",
    "moiz"
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


// =====================================================
// 4. LOAD FACE API MODELS
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
// 5. REGISTER WORKERS
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

            // This is okay if a worker's photo
            // is not available yet.
        }
    }


    // If no worker photo exists yet

    if (
        labeledDescriptors.length === 0
    ) {

        console.warn(
            "No worker photos are available yet."
        );

        return;
    }


    // Create Face Matcher

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
// 6. START CAMERA
// =====================================================

async function startCamera() {

    const video =
        document.getElementById(
            "camera"
        );


    if (!video) {

        console.error(
            "Camera element not found ❌"
        );

        return;
    }


    try {

        const stream =
            await navigator.mediaDevices.getUserMedia(
                {
                    video: true
                }
            );


        video.srcObject =
            stream;


        document.getElementById(
            "cameraMessage"
        ).innerText =
            "Camera is ON";


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
// 7. GET PRESENT / LATE STATUS
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
// 8. MARK ATTENDANCE
// =====================================================

async function markAttendance(name) {

    if (markedToday.has(name)) {
        return;
    }

    markedToday.add(name);

    const status = getStatus();

    try {

        const response = await fetch(
            "http://localhost:5000/attendance",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    worker_name: name,
                    status: status
                })
            }
        );

        const result = await response.json();

        console.log(
            result.message,
            result
        );

        // Update local record
        // so the table/dashboard reflects it

        attendanceRecords[name] = {
            status: result.status || status,
            time:
                result.time ||
                new Date().toLocaleTimeString()
        };

    } catch (error) {

        console.error(
            "Backend error ❌",
            error
        );

        // Still update locally even if backend fails

        attendanceRecords[name] = {
            status: status,
            time: new Date().toLocaleTimeString()
        };
    }

    updateAttendanceTable();
    updateDashboard();
}


// =====================================================
// 9. CLOSE ATTENDANCE
// =====================================================

function closeAttendance() {

    if (
        attendanceClosed
    ) {

        return;
    }


    attendanceClosed = true;


    // Every worker who does not have
    // an attendance record becomes Absent.

    workerNames.forEach(
        name => {

            if (
                !attendanceRecords[name]
            ) {

                attendanceRecords[name] = {

                    status: "Absent",

                    time: "-"
                };
            }
        }
    );


    updateAttendanceTable();

    updateDashboard();


    const message =
        document.getElementById(
            "cameraMessage"
        );


    if (message) {

        message.innerText =
            "Attendance is closed";
    }


    console.log(
        "Attendance closed 🔴"
    );
}


// =====================================================
// 10. UPDATE ATTENDANCE TABLE
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


            // If attendance is closed
            // and worker wasn't recognized,
            // show Absent.

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


            // Status colors

            if (
                status === "Present"
            ) {

                statusCell.style.color =
                    "green";

                statusCell.style.fontWeight =
                    "bold";
            }


            else if (
                status === "Late"
            ) {

                statusCell.style.color =
                    "orange";

                statusCell.style.fontWeight =
                    "bold";
            }


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
// 11. UPDATE DASHBOARD
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


    // Update Total

    const totalElement =
        document.getElementById(
            "totalWorkers"
        );


    if (totalElement) {

        totalElement.innerText =
            total;
    }


    // Update Present

    const presentElement =
        document.getElementById(
            "presentWorkers"
        );


    if (presentElement) {

        presentElement.innerText =
            present;
    }


    // Update Late

    const lateElement =
        document.getElementById(
            "lateWorkers"
        );


    if (lateElement) {

        lateElement.innerText =
            late;
    }


    // Update Absent

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
// 12. FACE RECOGNITION
// =====================================================

function recognizeLoop() {

    if (
        recognitionRunning
    ) {

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


    setInterval(
        async () => {

            if (
                !faceMatcher
            ) {

                return;
            }


            if (
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


                // Recognized worker

                if (
                    match.label !== "unknown"
                ) {

                    if (
                        !markedToday.has(
                            match.label
                        )
                    ) {

                        markAttendance(
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
// 13. CAPITALIZE NAME
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
// 14. START CAMERA BUTTON
// =====================================================

let systemStarted = false;

const startButton =
    document.getElementById(
        "startCamera"
    );


if (startButton) {

    startButton.addEventListener(
        "click",
        async () => {

            // Prevent multiple clicks from restarting everything
            if (systemStarted) {
                console.log("System already running, ignoring click.");
                return;
            }

            systemStarted = true;

            startButton.disabled = true;
            startButton.innerText = "Camera Running...";

            try {

                console.log(
                    "Starting Worker Attendance System..."
                );


                await loadModels();


                await registerWorkers();


                await startCamera();


                recognizeLoop();


                console.log(
                    "Worker Attendance System is running ✅"
                );

                startButton.innerText = "Camera Running ✅";

            } catch (error) {

                console.error(
                    "System startup error ❌",
                    error
                );

                // Allow retry if something failed
                systemStarted = false;
                startButton.disabled = false;
                startButton.innerText = "Start Camera";
            }
        }
    );
}

// =====================================================
// 15. CREATE CLOSE ATTENDANCE BUTTON
// =====================================================

// We create the button automatically.
// So you don't have to edit index.html manually.

const cameraSection =
    document.querySelector(
        ".camera-section"
    );


if (cameraSection) {

    const closeButton =
        document.createElement(
            "button"
        );


    closeButton.id =
        "closeAttendance";


    closeButton.innerText =
        "Close Attendance";


    closeButton.style.marginTop =
        "10px";


    closeButton.style.padding =
        "10px 20px";


    closeButton.style.cursor =
        "pointer";


    closeButton.addEventListener(
        "click",
        closeAttendance
    );


    cameraSection
        .querySelector(".camera-box")
        .appendChild(
            closeButton
        );
}


// =====================================================
// 15.5 LOAD TODAY'S ATTENDANCE FROM BACKEND
// =====================================================

async function loadTodayAttendance() {

    const today = new Date();

    const dateStr =
        today.toISOString().split("T")[0];

    try {

        const response = await fetch(
            `http://localhost:5000/attendance/date/${dateStr}`
        );


        const records =
            await response.json();


        records.forEach(
            record => {

                const name =
                    record.worker_name;


                attendanceRecords[name] = {

                    status:
                        record.status,

                    time:
                        record.attendance_time
                };


                markedToday.add(name);
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
// 16. INITIAL PAGE
// =====================================================

updateAttendanceTable();
updateDashboard();


// =====================================================
// 17. LOAD ATTENDANCE HISTORY (BY DATE)
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
        `http://localhost:5000/attendance/date/${dateInput.value}`
    )

        .then(
            response =>
                response.json()
        )

        .then(
            records => {

                historyTable.innerHTML = "";


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


                        nameCell.innerText =
                            capitalize(
                                record.worker_name
                            );


                        const statusCell =
                            document.createElement(
                                "td"
                            );


                        statusCell.innerText =
                            record.status;


                        const timeCell =
                            document.createElement(
                                "td"
                            );


                        timeCell.innerText =
                            record.attendance_time;


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


document
    .getElementById(
        "loadHistory"
    )
    .addEventListener(
        "click",
        loadHistoryByDate
    );