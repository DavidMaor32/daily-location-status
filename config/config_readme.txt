CONFIG README
=============

מטרת הקובץ
----------
הקובץ app_config.yaml מגדיר את כל ההגדרות של המערכת.
המערכת עובדת במצב YAML בלבד (ללא קבצי .env).

נתיב קובץ הקונפיגורציה:
  ./config/app_config.yaml


פירוט שדות
----------
app.name
- מה זה: שם לוגי של המערכת (לוגים/זיהוי שירות).
- דוגמה: "Daily Status Manager API"

app.environment
- מה זה: סביבת ריצה.
- דוגמה: "development" או "production"

cors.origins
- מה זה: רשימת כתובות שמורשות לגשת ל-API מהדפדפן (CORS).
- דוגמה:
  - "http://localhost:5173"

frontend.api_base_url
- מה זה: בסיס URL של ה-API בדפדפן.
- התנהגות מומלצת: ערך ריק "" כדי לעבוד דרך /api יחסי.
- דוגמה: ""

frontend.dev_server_port
- מה זה: פורט של שרת ה-Frontend (Vite) בזמן פיתוח.
- דוגמה: 5173

frontend.dev_proxy_target
- מה זה: כתובת היעד שאליה Vite מעביר בקשות `/api` בזמן פיתוח.
- דוגמה: "http://localhost:8000"

storage.mode
- מה זה: מצב שמירת קבצי Excel.
- ערכים אפשריים:
  - local: שמירה לוקאלית בלבד
  - s3: שמירה ל-S3 בלבד
  - local_and_s3: שמירה לוקאלית + שכפול ל-S3
- דוגמה: "local_and_s3"

storage.local_storage_dir
- מה זה: תיקיית שמירה מקומית לקבצי Excel.
- דוגמה: "./local_storage"

storage.seed_people_file
- מה זה: קובץ CSV התחלתי של אנשים. נצרך רק אם קובץ ה-master עדיין לא קיים.
- דוגמה: "./backend/data/sample_people.csv"

storage.snapshot_restore_policy
- מה זה: מדיניות שחזור יום היסטורי לתוך היום הנוכחי.
- ערכים אפשריים:
  - exact_snapshot: שחזור מדויק כפי שהיה ביום ההיסטורי (כולל אנשים שכבר לא ב-master).
  - master_only: שחזור רק לאנשים הפעילים כרגע ב-master.
- דוגמה: "exact_snapshot"

storage.s3.snapshots_prefix
- מה זה: Prefix (תיקייה לוגית) של קבצי snapshots יומיים ב-S3.
- דוגמה: "snapshots"

storage.s3.master_key
- מה זה: מפתח קובץ Excel של רשימת האנשים (master) ב-S3.
- דוגמה: "master/people_master.xlsx"

storage.s3.locations_key
- מה זה: מפתח קובץ Excel של רשימת המיקומים ב-S3.
- דוגמה: "master/locations.xlsx"

storage.s3.bucket_name
- מה זה: שם הבאקט ב-S3.
- מתי חובה: במצב s3 או local_and_s3.
- דוגמה: "my-status-bucket"

aws.access_key_id
- מה זה: מזהה מפתח גישה ל-AWS.
- דוגמה: "AKIA..."

aws.secret_access_key
- מה זה: סוד מפתח גישה ל-AWS.
- דוגמה: "xxxxxxxxxxxx"

aws.session_token
- מה זה: טוקן זמני ל-AWS (אם משתמשים בהרשאות זמניות).
- דוגמה: "IQoJb3Jp..."

aws.region
- מה זה: אזור AWS לעבודה מול S3.
- דוגמה: "us-east-1"

telegram.enabled
- מה זה: הפעלת/כיבוי אינטגרציית בוט טלגרם.
- ערכים: true / false
- דוגמה: true

telegram.bot_token
- מה זה: טוקן בוט מ-BotFather.
- דוגמה: "123456:ABC-DEF..."

telegram.allowed_chat_ids
- מה זה: רשימת chat_id מורשים לעדכון דרך הבוט.
- התנהגות: אם הרשימה ריקה, אין הגבלת צ'אטים.
- דוגמה: [123456789, 987654321]

telegram.allowed_remote_names
- מה זה: רשימת שמות שמורשים להזנה מרחוק בתהליך השיחתי של הבוט.
- התנהגות:
  - אם הרשימה ריקה: אין הגבלה, המשתמש יכול להקליד כל שם, ואם לא קיים אדם כזה הוא יירשם אוטומטית.
  - אם הרשימה מלאה: רק השמות שמופיעים בה מורשים.
- דוגמה: ["יוסי כהן", "מיכל לוי"]

telegram.poll_timeout_seconds
- מה זה: זמן המתנה (בשניות) לבקשת polling ל-Telegram.
- דוגמה: 25

telegram.poll_retry_seconds
- מה זה: זמן המתנה בין ניסיונות במקרה של שגיאת polling.
- דוגמה: 3


דוגמה מהירה: מצב לוקאלי בלבד
----------------------------
storage:
  mode: "local"
  local_storage_dir: "./local_storage"

frontend:
  api_base_url: ""
  dev_server_port: 5173
  dev_proxy_target: "http://localhost:8000"


דוגמה מהירה: מצב שמירה כפולה (לוקאלי + S3)
-------------------------------------------
storage:
  mode: "local_and_s3"
  local_storage_dir: "./local_storage"
  s3:
    bucket_name: "my-status-bucket"
    snapshots_prefix: "snapshots"
    master_key: "master/people_master.xlsx"
    locations_key: "master/locations.xlsx"

aws:
  access_key_id: "AKIA..."
  secret_access_key: "..."
  region: "us-east-1"


דגשים חשובים
-------------
- כל שינוי בקובץ config/app_config.yaml דורש restart ל-Backend ול-Frontend.
- אין לשמור סודות אמיתיים בקובץ שנכנס ל-Git.
