# KSS Engineering Attendance System

A real-time, face-recognition based attendance system built for KSS Engineering — with GPS location verification, live dashboards, and full attendance history.

## Overview

This project replaces manual attendance registers with a browser-based system that:

- Recognizes employees automatically via webcam
- Verifies the employee is physically at (or near) the office using GPS
- Marks Present / Late / Absent based on configurable office timing
- Stores every record permanently in a database, with a live dashboard and searchable history

Built and deployed end-to-end — frontend on Vercel, backend on PythonAnywhere.

## Features

- **Face Recognition** - Uses face-api.js to detect and match employee faces directly in the browser, no server-side ML processing needed.
- **Geolocation Verification** - Captures the employee's GPS coordinates at the moment of check-in and calculates their distance from the office using the Haversine formula. Attendance outside the allowed radius can be blocked (configurable per employee, e.g. for field/onsite workers).
- **Automatic Status Calculation** - The server (not the client) determines Present vs. Late based on a configurable cutoff time, and Pakistan Standard Time is used consistently for all timestamps.
- **Live Dashboard** - Shows today's attendance at a glance: total, present, late, and absent counts, refreshed automatically every 30 seconds.
- **Attendance History** - Browse any past date's attendance records, including each employee's check-in location.
- **Location Details** - Every record shows distance from the office and a direct Google Maps link to the exact check-in point.
- **Duplicate Protection** - A worker can only be marked once per day; the database enforces this with a unique constraint.

## Tech Stack

| Layer      | Technology                          |
|------------|--------------------------------------|
| Frontend   | HTML, CSS, JavaScript, face-api.js  |
| Backend    | Python, Flask, Flask-CORS           |
| Database   | SQLite                              |
| Deployment | Vercel (frontend), PythonAnywhere (backend) |

## Project Structure

kss-attendance-system/
- attendance-web/  (Frontend - deployed on Vercel)
  - index.html
  - script.js
  - style.css
  - models/  (face-api.js model weights)
  - workers/  (Reference photos for each employee)
- backend/  (Backend - deployed on PythonAnywhere)
  - server.py  (Flask API + SQLite logic)
  - attendance.db  (SQLite database, auto-created)

## How It Works

1. An employee stands in front of the camera; face-api.js matches their face against pre-registered reference photos.
2. The browser requests the employee's GPS location and calculates distance from the office.
3. This data is sent to the Flask backend, which independently determines the correct status and timestamp (Pakistan time), and stores everything in SQLite.
4. The dashboard polls the backend and updates in real time.

## API Endpoints

| Method | Endpoint                              | Description                              |
|--------|----------------------------------------|-------------------------------------------|
| GET    | /                                      | Health check                              |
| GET    | /workers                               | List of registered workers                |
| POST   | /attendance                            | Mark attendance (worker, status, location)|
| GET    | /attendance                            | All attendance records                    |
| GET    | /attendance/worker/<name>              | Attendance history for one worker         |
| GET    | /attendance/date/<YYYY-MM-DD>          | Attendance for a specific date            |
| GET    | /attendance/month/<year>/<month>       | Attendance for a specific month           |
| GET    | /attendance/summary/<year>/<month>     | Present/Late/Absent counts per worker     |
| DELETE | /attendance/delete-all                 | Clear all attendance records              |

## Running Locally

**Backend:**

    cd backend
    pip install flask flask-cors
    python server.py

The server runs at http://127.0.0.1:5000

**Frontend:**
Open attendance-web/index.html in a browser (or serve it with any static file server), and update API_URL in script.js to point to your backend.

## Configuration

- **Office location & radius** - set OFFICE_LAT, OFFICE_LNG (in both server.py and script.js) and ALLOWED_RADIUS_METERS in script.js.
- **Workers** - add employee names to the WORKERS list in server.py and workerNames in script.js, and place a reference photo at attendance-web/workers/<name>.jpg.
- **Field/onsite workers** - add their names to FIELD_WORKERS in script.js to skip the office-radius check while still recording their location.
- **Attendance cutoff time** - adjust the logic in calculate_status() (server.py).

## Future Improvements

- Monthly payroll/summary export (CSV or PDF)
- Admin authentication for the dashboard
- Push notifications for late/absent employees
- Multi-office support

## Author

**Syed Noor Ali Shah**
Final-year Computer Science student, interested in AI/ML and Applied AI Engineering.

---

Built as a real, production-deployed system - not just a demo.
