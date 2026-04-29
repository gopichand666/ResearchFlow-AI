import sqlite3
import os

db_path = 'memento.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, created_at FROM articles LIMIT 5")
    rows = cursor.fetchall()
    print("Recent articles:")
    for row in rows:
        print(row)
    conn.close()
else:
    print("Database not found")
