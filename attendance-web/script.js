// =====================================================
// WORKER ATTENDANCE SYSTEM
// FACE RECOGNITION + DATABASE ATTENDANCE
// =====================================================


// =====================================================
// 1. BACKEND
// =====================================================

const BACKEND_URL = "http://localhost:5000";


// =====================================================
// 2. FACE API MODEL LOCATION
// =====================================================

const MODEL_URL =
    "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js/weights";


// =====================================================
// 3. WORKERS
// =====================================================

const workerNames = [
    "ali",
    "taqi",
    "alam",
    "moiz"
];


// =====================================================
// 4. GLOBAL VARIABLES
// =====================================================

let labeledDescriptors = [];

let faceMatcher = null;

let markedToday = new Set();

let attendanceRecords = {};

let recognitionRunning = false;

let attendanceClosed = false;

let systemStarted = false;

let recognitionInterval = null;


// =====================================================
// 5. PAKISTAN DATE & TIME HELPERS
// =====================================================

function getPakistanDateString() {

    return new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone: "Asia/Karachi",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    ).format(new Date());
}


function getPakistanTimeString() {

    return new Intl.DateTimeFormat(
        "en-GB",
        {
            timeZone: "Asia/Karachi",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        }
    ).format(new Date());
}


function getPakistanHourMinute() {

    const parts =
        new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone: "Asia/Karachi",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
            }
        ).formatToParts(new Date());

    let hour = 0;
    let minute = 0;

    parts.forEach(part => {

        if (part.type === "hour") {
            hour = Number(part.value);
        }

        if (part.type === "minute") {
            minute = Number(part.value);
        }

    });

    return {
        hour: hour,
        minute: minute
    };
}


// =====================================================
// 6. LOAD FACE API MODELS
// =====================================================

async function loadModels() {

    console.log(
        "Loading face recognition models..."
    );

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

        console.log(
            "Models loaded successfully ✅"
        );

    }

    catch (error) {

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

    console.log(
        "Registering workers..."
    );

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

        }

        catch (error) {

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

    }

    catch (error) {

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
// 9. GET ATTENDANCE STATUS
// =====================================================
// 9:15 AM or earlier = Present
// After 9:15 AM = Late
// Pakistan Time is used.
// =====================================================

function getStatus() {

    const {
        hour,
        minute
    } = getPakistanHourMinute();


    if (
        hour < 9 ||
        (
            hour === 9 &&
            minute <= 15
        )
    ) {

        return "Present";
    }


    return "Late";
}


// =====================================================
// 10. MARK ATTENDANCE
// =====================================================

async function markAttendance(name) {

    if (markedToday.has(name)) {

        console.log(
            `${name} already marked today.`
        );

        return;
    }


    const status =
        getStatus();


    const pakistanDate =
        getPakistanDateString();


    const pakistanTime =
        getPakistanTimeString();


    console.log(
        `Saving ${name}: ${status} at ${pakistanDate} ${pakistanTime}`
    );


    try {

        const response =
            await fetch(
                `${BACKEND_URL}/attendance`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({

                        worker_name: name,

                        status: status,

                        attendance_date:
                            pakistanDate,

                        attendance_time:
                            pakistanTime
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
            "Attendance saved successfully ✅",
            result
        );


        markedToday.add(name);


        attendanceRecords[name] = {

            status:
                result.status || status,

            time:
                result.time ||
                pakistanTime
        };


        updateAttendanceTable();

        updateDashboard();

    }

    catch (error) {

        console.error(
            "Attendance could not be saved ❌",
            error
        );


        alert(
            `Attendance for ${capitalize(name)} could not be saved to database.`
        );
    }
}


// =====================================================
// 11. CLOSE ATTENDANCE
// =====================================================
// Any worker not recognized becomes Absent.
// IMPORTANT: Absent is also saved to database.
// =====================================================

async function closeAttendance() {

    if (attendanceClosed) {

        console.log(
            "Attendance already closed."
        );

        return;
    }


    attendanceClosed = true;


    console.log(
        "Closing attendance..."
    );


    for (const name of workerNames) {

        if (!markedToday.has(name)) {

            try {

                const response =
                    await fetch(
                        `${BACKEND_URL}/attendance`,
                        {
                            method: "POST",

                            headers: {
                                "Content-Type": "application/json"
                            },

                            body: JSON.stringify({

                                worker_name: name,

                                status: "Absent",

                                attendance_date:
                                    getPakistanDateString(),

                                attendance_time:
                                    "-"
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
                    `${name} => Absent saved ✅`,
                    result
                );


                attendanceRecords[name] = {

                    status: "Absent",

                    time: "-"
                };


                markedToday.add(name);

            }

            catch (error) {

                console.error(
                    `Could not save ${name} as Absent ❌`,
                    error
                );

                // Do NOT pretend it was saved.
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
        document.getElementById(
            "cameraMessage"
        );


    if (message) {

        message.innerText =
            "Attendance is closed";
    }


    stopRecognition();


    console.log(
        "Attendance closed 🔴"
    );
}


// =====================================================
// 12. UPDATE ATTENDANCE TABLE
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


            // -----------------------------
            // STATUS COLORS
            // -----------------------------

            if (status === "Present") {

                statusCell.style.color =
                    "green";

                statusCell.style.fontWeight =
                    "bold";
            }

            else if (status === "Late") {

                statusCell.style.color =
                    "orange";

                statusCell.style.fontWeight =
                    "bold";
            }

            else if (status === "Absent") {

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
// 13. UPDATE DASHBOARD
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
// 14. FACE RECOGNITION
// =====================================================

function recognizeLoop() {

    if (recognitionRunning) {

        console.log(
            "Face recognition is already running."
        );

        return;
    }


    recognitionRunning = true;


    const video =
        document.getElementById(
            "camera"
        );


    if (!video) {

        console.error(
            "Camera not found ❌"
        );

        return;
    }


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
                    attendanceClosed
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


                    console.log(
                        "Detected:",
                        match.label,
                        "Distance:",
                        match.distance
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

                }

                catch (error) {

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
// 15. STOP FACE RECOGNITION
// =====================================================

function stopRecognition() {

    if (recognitionInterval) {

        clearInterval(
            recognitionInterval
        );

        recognitionInterval =
            null;
    }


    recognitionRunning =
        false;


    console.log(
        "Face recognition stopped."
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
// 17. LOAD TODAY'S ATTENDANCE FROM DATABASE
// =====================================================

async function loadTodayAttendance() {

    const today =
        getPakistanDateString();


    console.log(
        "Loading attendance for Pakistan date:",
        today
    );


    try {

        const response =
            await fetch(
                `${BACKEND_URL}/attendance/date/${today}`
            );


        if (!response.ok) {

            throw new Error(
                `Backend returned ${response.status}`
            );
        }


        const records =
            await response.json();


        attendanceRecords = {};

        markedToday = new Set();


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


                markedToday.add(
                    name
                );
            }
        );


        console.log(
            "Today's attendance loaded from database ✅",
            records
        );


        updateAttendanceTable();

        updateDashboard();

    }

    catch (error) {

        console.error(
            "Could not load today's attendance ❌",
            error
        );


        updateAttendanceTable();

        updateDashboard();
    }
}


// =====================================================
// 18. LOAD ATTENDANCE HISTORY
// =====================================================

async function loadHistoryByDate() {

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


    if (!historyTable) {

        console.error(
            "History table not found ❌"
        );

        return;
    }


    const selectedDate =
        dateInput.value;


    console.log(
        "Loading history for:",
        selectedDate
    );


    historyTable.innerHTML =
        "<tr><td colspan='3'>Loading...</td></tr>";


    try {

        const response =
            await fetch(
                `${BACKEND_URL}/attendance/date/${selectedDate}`
            );


        if (!response.ok) {

            throw new Error(
                `Backend returned ${response.status}`
            );
        }


        const records =
            await response.json();


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


                // -----------------------------
                // HISTORY STATUS COLORS
                // -----------------------------

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


        console.log(
            "History loaded successfully ✅",
            records
        );

    }

    catch (error) {

        console.error(
            "Could not load history ❌",
            error
        );


        historyTable.innerHTML =
            "<tr><td colspan='3'>Error loading history. Is the backend running?</td></tr>";
    }
}


// =====================================================
// 19. START CAMERA BUTTON
// =====================================================

const startButton =
    document.getElementById(
        "startCamera"
    );


if (startButton) {

    startButton.addEventListener(
        "click",
        async () => {

            if (systemStarted) {

                console.log(
                    "System already running."
                );

                return;
            }


            systemStarted =
                true;


            startButton.disabled =
                true;


            startButton.innerText =
                "Starting...";


            try {

                console.log(
                    "Starting Worker Attendance System..."
                );


                // Load today's database records first
                await loadTodayAttendance();


                // Load face models
                await loadModels();


                // Register worker photos
                await registerWorkers();


                // Start camera
                await startCamera();


                // Start recognition
                recognizeLoop();


                console.log(
                    "Worker Attendance System is running ✅"
                );


                startButton.innerText =
                    "Camera Running ✅";

            }

            catch (error) {

                console.error(
                    "System startup error ❌",
                    error
                );


                systemStarted =
                    false;


                startButton.disabled =
                    false;


                startButton.innerText =
                    "Start Camera";
            }
        }
    );
}


// =====================================================
// 20. CLOSE ATTENDANCE BUTTON
// =====================================================

const closeButton =
    document.getElementById(
        "closeAttendance"
    );


if (closeButton) {

    closeButton.addEventListener(
        "click",
        async () => {

            await closeAttendance();

        }
    );
}


// =====================================================
// 21. HISTORY BUTTON
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
// 22. INITIAL PAGE
// =====================================================

updateAttendanceTable();

updateDashboard();


// =====================================================
// 23. LOAD TODAY'S DATA WHEN PAGE OPENS
// =====================================================

loadTodayAttendance();


console.log(
    "Worker Attendance System JavaScript loaded ✅"
);