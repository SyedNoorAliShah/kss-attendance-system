import sqlite3
import os
import shutil

# =====================================================
# DATABASE LOCATIONS
# =====================================================

ROOT_DB = r"C:\Users\noora\worker_attendance\attendance.db"

BACKEND_DB = r"C:\Users\noora\worker_attendance\backend\attendance.db"

BACKUP_DB = r"C:\Users\noora\worker_attendance\backend\attendance_backup_before_merge.db"


# =====================================================
# CHECK DATABASES
# =====================================================

if not os.path.exists(ROOT_DB):
    print("Root database not found ❌")
    exit()

if not os.path.exists(BACKEND_DB):
    print("Backend database not found ❌")
    exit()


# =====================================================
# BACKUP BACKEND DATABASE
# =====================================================

print("Creating backup...")

shutil.copy2(
    BACKEND_DB,
    BACKUP_DB
)

print("Backup created successfully ✅")


# =====================================================
# OPEN DATABASES
# =====================================================

root_conn = sqlite3.connect(ROOT_DB)
backend_conn = sqlite3.connect(BACKEND_DB)

root_conn.row_factory = sqlite3.Row
backend_conn.row_factory = sqlite3.Row


# =====================================================
# READ ROOT DATABASE
# =====================================================

root_rows = root_conn.execute("""
    SELECT
        worker_name,
        status,
        attendance_date,
        attendance_time
    FROM attendance
    ORDER BY attendance_date, attendance_time
""").fetchall()


print("")
print("Records found in root database:")
print("--------------------------------")

for row in root_rows:
    print(
        row["attendance_date"],
        "|",
        row["worker_name"],
        "|",
        row["status"],
        "|",
        row["attendance_time"]
    )


# =====================================================
# MERGE INTO BACKEND DATABASE
# =====================================================

inserted = 0
skipped = 0


for row in root_rows:

    worker_name = row["worker_name"]
    status = row["status"]
    attendance_date = row["attendance_date"]
    attendance_time = row["attendance_time"]


    # Check if this worker already has
    # attendance for this date.

    existing = backend_conn.execute("""
        SELECT id
        FROM attendance
        WHERE worker_name = ?
        AND attendance_date = ?
    """, (
        worker_name,
        attendance_date
    )).fetchone()


    if existing:

        print(
            f"SKIPPED: {worker_name} "
            f"{attendance_date} "
            f"(already exists)"
        )

        skipped += 1

    else:

        backend_conn.execute("""
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

        print(
            f"ADDED: {worker_name} "
            f"{attendance_date} "
            f"{status} "
            f"{attendance_time}"
        )

        inserted += 1


backend_conn.commit()


# =====================================================
# SHOW FINAL DATABASE
# =====================================================

print("")
print("======================================")
print(" MERGE COMPLETE")
print("======================================")

print(
    f"Records added: {inserted}"
)

print(
    f"Records skipped: {skipped}"
)


print("")
print("Final backend database:")

final_rows = backend_conn.execute("""
    SELECT
        worker_name,
        status,
        attendance_date,
        attendance_time
    FROM attendance
    ORDER BY attendance_date, attendance_time
""").fetchall()


for row in final_rows:

    print(
        row["attendance_date"],
        "|",
        row["worker_name"],
        "|",
        row["status"],
        "|",
        row["attendance_time"]
    )


# =====================================================
# CLOSE
# =====================================================

root_conn.close()
backend_conn.close()

print("")
print("Database merge finished successfully ✅")
print(
    "Backup saved at:",
    BACKUP_DB
)