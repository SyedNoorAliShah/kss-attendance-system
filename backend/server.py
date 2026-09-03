// =====================================================
// 8. MARK ATTENDANCE (with GPS location)
// =====================================================

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
            time: result.time || new Date().toLocaleTimeString()
        };

    } catch (error) {
        console.error("Backend error ❌", error);
        attendanceRecords[name] = {
            status: status,
            time: new Date().toLocaleTimeString()
        };
    }

    updateAttendanceTable();
    updateDashboard();
}