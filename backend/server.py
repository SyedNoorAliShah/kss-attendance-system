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
# WORKERS
# =====================================================

WORKERS = [
    "ali",
    "taqi",
    "alam",
    "zaman"
]


# =====================================================
# DATABASE
# =====================================================

# IMPORTANT:
# Always use the database located next to server.py.
#
# This prevents multiple attendance.db files from
# being created when the server is started from
# different folders.

BASE_DIR = Path(__file__).resolve().parent

DATABASE = BASE_DIR / "attendance.db"


# =====================================================
# PAKISTAN TIME
# =====================================================

PAKISTAN_TZ = ZoneInfo("Asia/Karachi")


def pakistan_now():
    """
    Return current Pakistan Standard Time.
    """

    return datetime.now(PAKISTAN_TZ)


# =====================================================
# DATABASE CONNECTION
# =====================================================

def get_db():

    conn = sqlite3.connect(
        str(DATABASE),
        timeout=10
    )

    conn.row_factory = sqlite3.Row

    return conn


# =====================================================
# CREATE DATABASE / TABLE
# =====================================================

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


        # -------------------------------------------------
        # Prevent duplicate attendance for the same
        # worker on the same date.
        # -------------------------------------------------

        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS
            unique_worker_date

            ON attendance(
                worker_name,
                attendance_date
            )
        """)


        conn.commit()


        print(
            "Database initialized successfully ✅"
        )

        print(
            f"Database location: {DATABASE}"
        )


    finally:

        conn.close()


# =====================================================
# RENAME OLD MOIZ RECORDS TO ZAMAN
# =====================================================

def rename_moiz_to_zaman():

    conn = get_db()

    try:

        # -------------------------------------------------
        # Check whether old Moiz records exist.
        # -------------------------------------------------

        old_records = conn.execute("""
            SELECT COUNT(*) AS total
            FROM attendance
            WHERE LOWER(worker_name) = 'moiz'
        """).fetchone()


        if old_records["total"] == 0:

            print(
                "No old Moiz records found."
            )

            return


        # -------------------------------------------------
        # Check for possible date conflicts.
        #
        # Example:
        # Moiz has attendance on 24 Aug
        # Zaman already has attendance on 24 Aug
        #
        # We don't want to violate the unique index.
        # -------------------------------------------------

        conflict_count = conn.execute("""
            SELECT COUNT(*)
            FROM attendance AS moiz
            INNER JOIN attendance AS zaman

                ON moiz.attendance_date =
                   zaman.attendance_date

            WHERE LOWER(moiz.worker_name) = 'moiz'

            AND LOWER(zaman.worker_name) = 'zaman'
        """).fetchone()[0]


        if conflict_count > 0:

            print(
                "⚠️ Moiz → Zaman rename skipped "
                "for conflicting dates."
            )

            print(
                f"Conflicting dates: {conflict_count}"
            )

            # Remove only duplicate Moiz records
            # where Zaman already has a record.
            #
            # This preserves the existing Zaman record.

            conn.execute("""
                DELETE FROM attendance

                WHERE LOWER(worker_name) = 'moiz'

                AND attendance_date IN (

                    SELECT moiz.attendance_date

                    FROM attendance AS moiz

                    INNER JOIN attendance AS zaman

                        ON moiz.attendance_date =
                           zaman.attendance_date

                    WHERE LOWER(moiz.worker_name) = 'moiz'

                    AND LOWER(zaman.worker_name) = 'zaman'
                )
            """)


        # -------------------------------------------------
        # Rename remaining Moiz records.
        # -------------------------------------------------

        updated = conn.execute("""
            UPDATE attendance

            SET worker_name = 'zaman'

            WHERE LOWER(worker_name) = 'moiz'
        """)


        conn.commit()


        print(
            f"Moiz → Zaman completed ✅ "
            f"({updated.rowcount} records updated)"
        )


    finally:

        conn.close()


# =====================================================
# CALCULATE ATTENDANCE STATUS
# =====================================================

def calculate_status(now):

    current_minutes = (
        now.hour * 60
        + now.minute
    )


    # 9:15 AM cutoff

    cutoff_minutes = (
        9 * 60
        + 15
    )


    if current_minutes <= cutoff_minutes:

        return "Present"


    return "Late"


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

        "workers":
            WORKERS,

        "database":
            str(DATABASE)
    })


# =====================================================
# GET WORKERS
# =====================================================

@app.route(
    "/workers",
    methods=["GET"]
)
def get_workers():

    return jsonify({

        "workers":
            WORKERS
    })


# =====================================================
# MARK ATTENDANCE
# =====================================================

@app.route(
    "/attendance",
    methods=["POST"]
)
def mark_attendance():

    data = request.get_json()


    if not data:

        return jsonify({

            "error":
                "No data received"

        }), 400


    worker_name = data.get(
        "worker_name"
    )


    requested_status = data.get(
        "status"
    )


    if not worker_name:

        return jsonify({

            "error":
                "worker_name is required"

        }), 400


    # -------------------------------------------------
    # Normalize worker name
    # -------------------------------------------------

    worker_name = (
        str(worker_name)
        .strip()
        .lower()
    )


    # -------------------------------------------------
    # Moiz is permanently replaced by Zaman.
    # -------------------------------------------------

    if worker_name == "moiz":

        worker_name = "zaman"


    # -------------------------------------------------
    # Check worker
    # -------------------------------------------------

    if worker_name not in WORKERS:

        return jsonify({

            "error":
                f"Unknown worker: {worker_name}",

            "allowed_workers":
                WORKERS

        }), 400


    # -------------------------------------------------
    # SERVER CONTROLS DATE/TIME
    # -------------------------------------------------

    now = pakistan_now()


    attendance_date = (
        now.strftime("%Y-%m-%d")
    )


    attendance_time = (
        now.strftime("%I:%M:%S %p")
    )


    # -------------------------------------------------
    # SERVER CONTROLS PRESENT / LATE
    # -------------------------------------------------

    status = calculate_status(
        now
    )


    # -------------------------------------------------
    # ABSENT SUPPORT
    # -------------------------------------------------

    if requested_status == "Absent":

        status = "Absent"

        attendance_time = "-"


    # -------------------------------------------------
    # DATABASE
    # -------------------------------------------------

    conn = get_db()


    try:

        existing = conn.execute("""
            SELECT

                id,

                worker_name,

                status,

                attendance_date,

                attendance_time

            FROM attendance

            WHERE LOWER(worker_name) = ?

            AND attendance_date = ?
        """, (

            worker_name,

            attendance_date

        )).fetchone()


        # -------------------------------------------------
        # Already marked
        # -------------------------------------------------

        if existing:

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
        # INSERT
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


        print(
            f"{worker_name} => "
            f"{status} at "
            f"{attendance_date} "
            f"{attendance_time} PKT"
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


    except sqlite3.IntegrityError:

        # -------------------------------------------------
        # Safety net for duplicate records.
        # -------------------------------------------------

        existing = conn.execute("""
            SELECT

                worker_name,
                status,
                attendance_date,
                attendance_time

            FROM attendance

            WHERE LOWER(worker_name) = ?

            AND attendance_date = ?
        """, (

            worker_name,

            attendance_date

        )).fetchone()


        if existing:

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


        return jsonify({

            "error":
                "Could not save attendance."

        }), 500


    finally:

        conn.close()


# =====================================================
# GET ALL ATTENDANCE
# =====================================================

@app.route(
    "/attendance",
    methods=["GET"]
)
def get_attendance():

    conn = get_db()

    try:

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


        return jsonify([

            dict(row)

            for row in rows

        ])


    finally:

        conn.close()


# =====================================================
# GET ATTENDANCE BY WORKER
# =====================================================

@app.route(
    "/attendance/worker/<worker_name>",
    methods=["GET"]
)
def get_worker_attendance(
    worker_name
):

    worker_name = (
        worker_name
        .strip()
        .lower()
    )


    # Moiz → Zaman

    if worker_name == "moiz":

        worker_name = "zaman"


    conn = get_db()

    try:

        rows = conn.execute("""
            SELECT

                id,

                worker_name,

                status,

                attendance_date,

                attendance_time

            FROM attendance

            WHERE LOWER(worker_name) = ?

            ORDER BY

                attendance_date DESC,

                attendance_time DESC
        """, (

            worker_name,

        )).fetchall()


        return jsonify([

            dict(row)

            for row in rows

        ])


    finally:

        conn.close()


# =====================================================
# GET ATTENDANCE BY DATE
# =====================================================

@app.route(
    "/attendance/date/<attendance_date>",
    methods=["GET"]
)
def get_date_attendance(
    attendance_date
):

    conn = get_db()

    try:

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

                    WHEN 'Present'
                    THEN 1

                    WHEN 'Late'
                    THEN 2

                    WHEN 'Absent'
                    THEN 3

                    ELSE 4

                END,

                worker_name ASC
        """, (

            attendance_date,

        )).fetchall()


        return jsonify([

            dict(row)

            for row in rows

        ])


    finally:

        conn.close()


# =====================================================
# MONTHLY ATTENDANCE
# =====================================================

@app.route(
    "/attendance/month/<year>/<month>",
    methods=["GET"]
)
def get_month_attendance(
    year,
    month
):

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

    try:

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


        return jsonify([

            dict(row)

            for row in rows

        ])


    finally:

        conn.close()


# =====================================================
# MONTHLY WORKER SUMMARY
# =====================================================

@app.route(
    "/attendance/summary/<year>/<month>",
    methods=["GET"]
)
def get_month_summary(
    year,
    month
):

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

    try:

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


        return jsonify([

            dict(row)

            for row in rows

        ])


    finally:

        conn.close()


# =====================================================
# DELETE ALL ATTENDANCE
# =====================================================

@app.route(
    "/attendance/delete-all",
    methods=["DELETE"]
)
def delete_all_attendance():

    conn = get_db()

    try:

        conn.execute(
            "DELETE FROM attendance"
        )

        conn.commit()


        return jsonify({

            "message":
                "All attendance records deleted"

        })


    finally:

        conn.close()


# =====================================================
# START SERVER
# =====================================================

if __name__ == "__main__":

    # -------------------------------------------------
    # Initialize database
    # -------------------------------------------------

    init_db()


    # -------------------------------------------------
    # Rename old Moiz records
    # -------------------------------------------------

    rename_moiz_to_zaman()


    # -------------------------------------------------
    # SERVER INFORMATION
    # -------------------------------------------------

    print("")

    print(
        "======================================"
    )

    print(
        " Worker Attendance Backend"
    )

    print(
        "======================================"
    )

    print("")

    print(
        "Server running at:"
    )

    print(
        "http://127.0.0.1:5000"
    )

    print("")

    print(
        "Timezone: Asia/Karachi 🇵🇰"
    )

    print(
        f"Database: {DATABASE}"
    )

    print("")

    print(
        "Workers:"
    )

    for worker in WORKERS:

        print(
            f" - {worker}"
        )

    print("")


    # -------------------------------------------------
    # START FLASK
    # -------------------------------------------------

    app.run(

        host="127.0.0.1",

        port=5000,

        debug=True
    )