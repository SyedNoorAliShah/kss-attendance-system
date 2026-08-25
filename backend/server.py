from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)

# =====================================================
# DATABASE PATH (ALWAYS POINTS TO backend/attendance.db
# NO MATTER WHERE THE SCRIPT IS RUN FROM)
# =====================================================

DATABASE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "attendance.db"
)


# ==========================================
# DATABASE CONNECTION
# ==========================================

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


# ==========================================
# CREATE DATABASE / TABLE
# ==========================================

def init_db():
    conn = get_db()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            worker_name TEXT NOT NULL,
            status TEXT NOT NULL,
            attendance_date TEXT NOT NULL,
            attendance_time TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()

    print("Database initialized successfully ✅")
    print("Using database file:", DATABASE)


# ==========================================
# HOME
# ==========================================

@app.route("/")
def home():
    return jsonify({
        "message": "Worker Attendance Backend is running ✅",
        "status": "online"
    })


# ==========================================
# MARK ATTENDANCE
# ==========================================

@app.route("/attendance", methods=["POST"])
def mark_attendance():

    data = request.get_json()

    if not data:
        return jsonify({
            "error": "No data received"
        }), 400

    worker_name = data.get("worker_name")
    status = data.get("status")

    if not worker_name or not status:
        return jsonify({
            "error": "worker_name and status are required"
        }), 400

    now = datetime.now()

    attendance_date = now.strftime("%Y-%m-%d")
    attendance_time = now.strftime("%H:%M:%S")

    conn = get_db()

    # Prevent duplicate attendance for the same worker on the same day
    existing = conn.execute("""
        SELECT id
        FROM attendance
        WHERE worker_name = ?
        AND attendance_date = ?
    """, (worker_name, attendance_date)).fetchone()

    if existing:
        conn.close()

        return jsonify({
            "message": "Attendance already marked for today",
            "worker_name": worker_name,
            "status": status,
            "date": attendance_date,
            "time": attendance_time
        })

    conn.execute("""
        INSERT INTO attendance
        (
            worker_name,
            status,
            attendance_date,
            attendance_time
        )
        VALUES (?, ?, ?, ?)
    """, (
        worker_name,
        status,
        attendance_date,
        attendance_time
    ))

    conn.commit()
    conn.close()

    print(
        f"{worker_name} => {status} "
        f"at {attendance_date} {attendance_time}"
    )

    return jsonify({
        "message": "Attendance saved successfully ✅",
        "worker_name": worker_name,
        "status": status,
        "date": attendance_date,
        "time": attendance_time
    })


# ==========================================
# GET ALL ATTENDANCE
# ==========================================

@app.route("/attendance", methods=["GET"])
def get_attendance():

    conn = get_db()

    rows = conn.execute("""
        SELECT
            id,
            worker_name,
            status,
            attendance_date,
            attendance_time
        FROM attendance
        ORDER BY attendance_date DESC,
                 attendance_time DESC
    """).fetchall()

    conn.close()

    attendance = [dict(row) for row in rows]

    return jsonify(attendance)


# ==========================================
# GET ATTENDANCE BY WORKER
# ==========================================

@app.route("/attendance/worker/<worker_name>", methods=["GET"])
def get_worker_attendance(worker_name):

    conn = get_db()

    rows = conn.execute("""
        SELECT
            id,
            worker_name,
            status,
            attendance_date,
            attendance_time
        FROM attendance
        WHERE worker_name = ?
        ORDER BY attendance_date DESC,
                 attendance_time DESC
    """, (worker_name,)).fetchall()

    conn.close()

    attendance = [dict(row) for row in rows]

    return jsonify(attendance)


# ==========================================
# GET ATTENDANCE BY DATE
# ==========================================

@app.route("/attendance/date/<attendance_date>", methods=["GET"])
def get_date_attendance(attendance_date):

    conn = get_db()

    rows = conn.execute("""
        SELECT
            id,
            worker_name,
            status,
            attendance_date,
            attendance_time
        FROM attendance
        WHERE attendance_date = ?
        ORDER BY attendance_time ASC
    """, (attendance_date,)).fetchall()

    conn.close()

    attendance = [dict(row) for row in rows]

    return jsonify(attendance)


# ==========================================
# DELETE ALL ATTENDANCE
# ==========================================

@app.route("/attendance/delete-all", methods=["DELETE"])
def delete_all_attendance():

    conn = get_db()

    conn.execute("DELETE FROM attendance")

    conn.commit()
    conn.close()

    return jsonify({
        "message": "All attendance records deleted"
    })


# ==========================================
# START SERVER
# ==========================================

if __name__ == "__main__":

    init_db()

    print("")
    print("======================================")
    print(" Worker Attendance Backend")
    print("======================================")
    print("")
    print("Server running at:")
    print("http://localhost:5000")
    print("")

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )