from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path


# =====================================================
# WORKER ATTENDANCE BACKEND
# =====================================================

app = Flask(__name__)
CORS(app)


# =====================================================
# DATABASE
# =====================================================

# Always use the database next to server.py.
# This prevents accidentally creating two attendance.db
# files when Flask is started from different folders.

BASE_DIR = Path(__file__).resolve().parent
DATABASE = BASE_DIR / "attendance.db"


# =====================================================
# PAKISTAN TIME
# =====================================================

PAKISTAN_TZ = ZoneInfo("Asia/Karachi")


def pakistan_now():
    """
    Returns current Pakistan Standard Time.
    """
    return datetime.now(PAKISTAN_TZ)


# =====================================================
# DATABASE CONNECTION
# =====================================================

def get_db():

    conn = sqlite3.connect(str(DATABASE))

    conn.row_factory = sqlite3.Row

    return conn


# =====================================================
# CREATE DATABASE / TABLE
# =====================================================

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

    # Prevent duplicate attendance for one worker
    # on the same date.

    conn.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS
        unique_worker_date
        ON attendance(worker_name, attendance_date)
    """)

    conn.commit()

    conn.close()

    print("Database initialized successfully ✅")
    print(f"Database location: {DATABASE}")


# =====================================================
# HOME
# =====================================================

@app.route("/")
def home():

    return jsonify({

        "message":
            "Worker Attendance Backend is running ✅",

        "status":
            "online",

        "timezone":
            "Asia/Karachi",

        "database":
            str(DATABASE)
    })


# =====================================================
# MARK ATTENDANCE
# =====================================================

@app.route("/attendance", methods=["POST"])
def mark_attendance():

    data = request.get_json()

    if not data:

        return jsonify({
            "error": "No data received"
        }), 400


    worker_name = data.get("worker_name")

    requested_status = data.get("status")


    if not worker_name:

        return jsonify({
            "error":
                "worker_name is required"
        }), 400


    # -------------------------------------------------
    # SERVER CONTROLS THE DATE AND TIME
    # -------------------------------------------------

    # Pakistan Standard Time 🇵🇰
now = datetime.now(ZoneInfo("Asia/Karachi"))

attendance_date = now.strftime("%Y-%m-%d")
attendance_time = now.strftime("%I:%M:%S %p")


    # -------------------------------------------------
    # SERVER CONTROLS PRESENT / LATE
    # -------------------------------------------------

    current_minutes = (
        now.hour * 60 +
        now.minute
    )

    cutoff_minutes = (
        9 * 60 +
        15
    )


    if current_minutes <= cutoff_minutes:

        status = "Present"

    else:

        status = "Late"


    # -------------------------------------------------
    # IF FRONTEND IS SAVING ABSENT
    # -------------------------------------------------

    if requested_status == "Absent":

        status = "Absent"

        attendance_time = "-"


    # -------------------------------------------------
    # DATABASE
    # -------------------------------------------------

    conn = get_db()


    existing = conn.execute("""
        SELECT
            id,
            worker_name,
            status,
            attendance_date,
            attendance_time

        FROM attendance

        WHERE worker_name = ?

        AND attendance_date = ?
    """, (
        worker_name,
        attendance_date
    )).fetchone()


    if existing:

        conn.close()

        return jsonify({

            "message":
                "Attendance already marked for today",

            "worker_name":
                existing["worker_name"],

            "status":
                existing["status"],

            "date":
                existing["attendance_date"],

            "time":
                existing["attendance_time"]
        })


    # -------------------------------------------------
    # INSERT ATTENDANCE
    # -------------------------------------------------

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
        f"at {attendance_date} {attendance_time} PKT"
    )


    return jsonify({

        "message":
            "Attendance saved successfully ✅",

        "worker_name":
            worker_name,

        "status":
            status,

        "date":
            attendance_date,

        "time":
            attendance_time
    })


# =====================================================
# GET ALL ATTENDANCE
# =====================================================

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

        ORDER BY
            attendance_date DESC,
            attendance_time DESC
    """).fetchall()


    conn.close()


    return jsonify([
        dict(row)
        for row in rows
    ])


# =====================================================
# GET ATTENDANCE BY WORKER
# =====================================================

@app.route(
    "/attendance/worker/<worker_name>",
    methods=["GET"]
)
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

        ORDER BY
            attendance_date DESC,
            attendance_time DESC
    """, (
        worker_name,
    )).fetchall()


    conn.close()


    return jsonify([
        dict(row)
        for row in rows
    ])


# =====================================================
# GET ATTENDANCE BY DATE
# =====================================================

@app.route(
    "/attendance/date/<attendance_date>",
    methods=["GET"]
)
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

        ORDER BY
            CASE status
                WHEN 'Present' THEN 1
                WHEN 'Late' THEN 2
                WHEN 'Absent' THEN 3
                ELSE 4
            END,

            worker_name ASC
    """, (
        attendance_date,
    )).fetchall()


    conn.close()


    return jsonify([
        dict(row)
        for row in rows
    ])


# =====================================================
# MONTHLY ATTENDANCE
# =====================================================

@app.route(
    "/attendance/month/<year>/<month>",
    methods=["GET"]
)
def get_month_attendance(year, month):

    try:

        year = int(year)
        month = int(month)

    except ValueError:

        return jsonify({
            "error":
                "Invalid year or month"
        }), 400


    if month < 1 or month > 12:

        return jsonify({
            "error":
                "Month must be between 1 and 12"
        }), 400


    month_prefix = (
        f"{year:04d}-{month:02d}"
    )


    conn = get_db()


    rows = conn.execute("""
        SELECT

            id,

            worker_name,

            status,

            attendance_date,

            attendance_time

        FROM attendance

        WHERE attendance_date LIKE ?

        ORDER BY
            attendance_date ASC,
            worker_name ASC
    """, (
        f"{month_prefix}%",
    )).fetchall()


    conn.close()


    return jsonify([
        dict(row)
        for row in rows
    ])


# =====================================================
# MONTHLY WORKER SUMMARY
# =====================================================

@app.route(
    "/attendance/summary/<year>/<month>",
    methods=["GET"]
)
def get_month_summary(year, month):

    try:

        year = int(year)
        month = int(month)

    except ValueError:

        return jsonify({
            "error":
                "Invalid year or month"
        }), 400


    if month < 1 or month > 12:

        return jsonify({
            "error":
                "Month must be between 1 and 12"
        }), 400


    month_prefix = (
        f"{year:04d}-{month:02d}"
    )


    conn = get_db()


    rows = conn.execute("""
        SELECT

            worker_name,

            SUM(
                CASE
                    WHEN status = 'Present'
                    THEN 1
                    ELSE 0
                END
            ) AS present_days,

            SUM(
                CASE
                    WHEN status = 'Late'
                    THEN 1
                    ELSE 0
                END
            ) AS late_days,

            SUM(
                CASE
                    WHEN status = 'Absent'
                    THEN 1
                    ELSE 0
                END
            ) AS absent_days

        FROM attendance

        WHERE attendance_date LIKE ?

        GROUP BY worker_name

        ORDER BY worker_name ASC
    """, (
        f"{month_prefix}%",
    )).fetchall()


    conn.close()


    return jsonify([
        dict(row)
        for row in rows
    ])


# =====================================================
# DELETE ALL ATTENDANCE
# =====================================================

@app.route(
    "/attendance/delete-all",
    methods=["DELETE"]
)
def delete_all_attendance():

    conn = get_db()

    conn.execute(
        "DELETE FROM attendance"
    )

    conn.commit()

    conn.close()


    return jsonify({
        "message":
            "All attendance records deleted"
    })


# =====================================================
# START SERVER
# =====================================================

if __name__ == "__main__":

    init_db()


    print("")
    print("======================================")
    print(" Worker Attendance Backend")
    print("======================================")
    print("")
    print("Server running at:")
    print("http://127.0.0.1:5000")
    print("")
    print("Timezone: Asia/Karachi 🇵🇰")
    print(f"Database: {DATABASE}")
    print("")


    app.run(

        host="127.0.0.1",

        port=5000,

        debug=True
    )