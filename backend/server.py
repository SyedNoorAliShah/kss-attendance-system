from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import math
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path

app = Flask(__name__)
CORS(app)

# =====================================================
# WORKERS
# =====================================================

WORKERS = [
    "ali",
    "taqi",
    "alam",
    "zaman",
    "anas",
    "irfan"
]

# =====================================================
# OFFICE LOCATION
# =====================================================

OFFICE_LAT = 24.946650
OFFICE_LNG = 67.056869
ALLOWED_RADIUS_METERS = 200


def calculate_distance_meters(lat1, lon1, lat2, lon2):
    R = 6371000
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = (math.sin(dLat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dLon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


# =====================================================
# DATABASE
# =====================================================

BASE_DIR = Path(__file__).resolve().parent
DATABASE = BASE_DIR / "attendance.db"

PAKISTAN_TZ = ZoneInfo("Asia/Karachi")


def pakistan_now():
    return datetime.now(PAKISTAN_TZ)


def get_db():
    conn = sqlite3.connect(str(DATABASE), timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                worker_name TEXT NOT NULL,
                status TEXT NOT NULL,
                attendance_date TEXT NOT NULL,
                attendance_time TEXT NOT NULL
            )
        """)

        for column in ["latitude REAL", "longitude REAL", "distance_meters REAL"]:
            try:
                conn.execute(f"ALTER TABLE attendance ADD COLUMN {column}")
            except sqlite3.OperationalError:
                pass

        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS
            unique_worker_date
            ON attendance(worker_name, attendance_date)
        """)

        conn.commit()
        print("Database initialized successfully ✅")
        print(f"Database location: {DATABASE}")
    finally:
        conn.close()


def calculate_status(now):
    current_minutes = now.hour * 60 + now.minute
    cutoff_minutes = 9 * 60 + 15
    if current_minutes <= cutoff_minutes:
        return "Present"
    return "Late"


# =====================================================
# HOME
# =====================================================

@app.route("/")
def home():
    return jsonify({
        "message": "Worker Attendance Backend is running ✅",
        "status": "online",
        "timezone": "Asia/Karachi",
        "workers": WORKERS
    })


@app.route("/workers", methods=["GET"])
def get_workers():
    return jsonify({"workers": WORKERS})


# =====================================================
# MARK ATTENDANCE
# =====================================================

@app.route("/attendance", methods=["POST"])
def mark_attendance():

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data received"}), 400

    worker_name = data.get("worker_name")
    requested_status = data.get("status")

    if not worker_name:
        return jsonify({"error": "worker_name is required"}), 400

    worker_name = str(worker_name).strip().lower()

    if worker_name not in WORKERS:
        return jsonify({
            "error": f"Unknown worker: {worker_name}",
            "allowed_workers": WORKERS
        }), 400

    latitude = data.get("latitude")
    longitude = data.get("longitude")
    distance = None

    try:
        if latitude is not None:
            latitude = float(latitude)
        if longitude is not None:
            longitude = float(longitude)
    except (TypeError, ValueError):
        latitude = None
        longitude = None

    if latitude is not None and longitude is not None:
        distance = calculate_distance_meters(
            latitude, longitude, OFFICE_LAT, OFFICE_LNG
        )

    now = pakistan_now()
    attendance_date = now.strftime("%Y-%m-%d")
    attendance_time = now.strftime("%I:%M:%S %p")
    status = calculate_status(now)

    if requested_status == "Absent":
        status = "Absent"
        attendance_time = "-"

    conn = get_db()

    try:
        existing = conn.execute("""
            SELECT * FROM attendance
            WHERE LOWER(worker_name) = ? AND attendance_date = ?
        """, (worker_name, attendance_date)).fetchone()

        if existing:
            return jsonify({
                "message": "Attendance already marked for today",
                "worker_name": existing["worker_name"],
                "status": existing["status"],
                "date": existing["attendance_date"],
                "time": existing["attendance_time"],
                "latitude": existing["latitude"],
                "longitude": existing["longitude"],
                "distance_meters": existing["distance_meters"]
            })

        conn.execute("""
            INSERT INTO attendance
            (worker_name, status, attendance_date, attendance_time, latitude, longitude, distance_meters)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (worker_name, status, attendance_date, attendance_time, latitude, longitude, distance))

        conn.commit()

        print(f"{worker_name} => {status} at {attendance_date} {attendance_time} PKT (distance: {distance})")

        return jsonify({
            "message": "Attendance saved successfully ✅",
            "worker_name": worker_name,
            "status": status,
            "date": attendance_date,
            "time": attendance_time,
            "latitude": latitude,
            "longitude": longitude,
            "distance_meters": distance
        })

    except sqlite3.IntegrityError:
        existing = conn.execute("""
            SELECT * FROM attendance
            WHERE LOWER(worker_name) = ? AND attendance_date = ?
        """, (worker_name, attendance_date)).fetchone()

        if existing:
            return jsonify({
                "message": "Attendance already marked for today",
                "worker_name": existing["worker_name"],
                "status": existing["status"],
                "date": existing["attendance_date"],
                "time": existing["attendance_time"]
            })
        return jsonify({"error": "Could not save attendance."}), 500

    finally:
        conn.close()


# =====================================================
# GET ALL ATTENDANCE
# =====================================================

@app.route("/attendance", methods=["GET"])
def get_attendance():
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT * FROM attendance
            ORDER BY attendance_date DESC, attendance_time DESC
        """).fetchall()
        return jsonify([dict(row) for row in rows])
    finally:
        conn.close()


@app.route("/attendance/worker/<worker_name>", methods=["GET"])
def get_worker_attendance(worker_name):
    worker_name = worker_name.strip().lower()
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT * FROM attendance
            WHERE LOWER(worker_name) = ?
            ORDER BY attendance_date DESC, attendance_time DESC
        """, (worker_name,)).fetchall()
        return jsonify([dict(row) for row in rows])
    finally:
        conn.close()


@app.route("/attendance/date/<attendance_date>", methods=["GET"])
def get_date_attendance(attendance_date):
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT * FROM attendance
            WHERE attendance_date = ?
            ORDER BY attendance_time ASC
        """, (attendance_date,)).fetchall()
        return jsonify([dict(row) for row in rows])
    finally:
        conn.close()


@app.route("/attendance/month/<year>/<month>", methods=["GET"])
def get_month_attendance(year, month):
    try:
        year = int(year)
        month = int(month)
    except ValueError:
        return jsonify({"error": "Invalid year or month"}), 400

    if month < 1 or month > 12:
        return jsonify({"error": "Month must be between 1 and 12"}), 400

    month_prefix = f"{year:04d}-{month:02d}"
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT * FROM attendance
            WHERE attendance_date LIKE ?
            ORDER BY attendance_date ASC, worker_name ASC
        """, (f"{month_prefix}%",)).fetchall()
        return jsonify([dict(row) for row in rows])
    finally:
        conn.close()


@app.route("/attendance/summary/<year>/<month>", methods=["GET"])
def get_month_summary(year, month):
    try:
        year = int(year)
        month = int(month)
    except ValueError:
        return jsonify({"error": "Invalid year or month"}), 400

    if month < 1 or month > 12:
        return jsonify({"error": "Month must be between 1 and 12"}), 400

    month_prefix = f"{year:04d}-{month:02d}"
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT
                worker_name,
                SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS present_days,
                SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) AS late_days,
                SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent_days
            FROM attendance
            WHERE attendance_date LIKE ?
            GROUP BY worker_name
            ORDER BY worker_name ASC
        """, (f"{month_prefix}%",)).fetchall()
        return jsonify([dict(row) for row in rows])
    finally:
        conn.close()


@app.route("/attendance/delete-all", methods=["DELETE"])
def delete_all_attendance():
    conn = get_db()
    try:
        conn.execute("DELETE FROM attendance")
        conn.commit()
        return jsonify({"message": "All attendance records deleted"})
    finally:
        conn.close()


# Runs at import time too (needed for PythonAnywhere/WSGI)
init_db()


if __name__ == "__main__":
    print("")
    print("======================================")
    print(" Worker Attendance Backend")
    print("======================================")
    print("Timezone: Asia/Karachi 🇵🇰")
    print(f"Database: {DATABASE}")
    app.run(host="127.0.0.1", port=5000, debug=True)