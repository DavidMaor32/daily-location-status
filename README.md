# מערכת ניהול סטטוס יומי ומיקום (FastAPI + React)

מערכת אינטרנטית לניהול אנשים, מיקומים וסטטוס יומי, עם שמירת היסטוריה בקבצי Excel (`.xlsx`) והזנה עצמאית דרך האתר ובאופן אופציונלי דרך בוט טלגרם.

## עקרונות בסיס

- רוב ההגדרות מנוהלות דרך `config/app_config.yaml`.
- סודות (כמו טוקן טלגרם) מומלץ לשים ב-`.env` ולא ב-Git.
- כל יום נשמר כ-snapshot נפרד.
- רשימת האנשים נשמרת ב-master כדי שלא תצטרך להזין אותם מחדש כל יום.
- בתחילת יום חדש נוצרת אוטומטית קובץ XLSX יומי חדש, שמעתיק מה-master את רשימת האנשים בלבד.
- בקובץ היומי החדש שדות העבודה מאותחלים לערכי ברירת מחדל (כדי להתחיל עבודה נקייה ליום החדש).

## אבטחה ויציבות

- טוקנים וסודות נטענים מ-`.env` כדי לא לשמור אותם בקוד שמועלה ל-Git.
- שגיאות שרת לא צפויות מוחזרות כלקוח כ-`Internal server error` בלי לחשוף פרטים פנימיים.
- קלט עצמי (כולל מבוט טלגרם) עובר ולידציה, כולל מגבלת אורך למיקום.
- ה-Frontend מנרמל payload מה-API כדי למנוע קריסה גם אם מתקבל מבנה לא צפוי.

## מבנה קוד מודולרי

Backend:

- `backend/app/main.py` - אתחול FastAPI, lifespan, middlewares, ו-health/status.
- `backend/app/api/dependencies.py` - תלויות משותפות (`Settings`, `SnapshotService`, parsing לתאריכים, הורדת קבצים).
- `backend/app/api/routers/snapshot.py` - endpoints של snapshots והיסטוריה.
- `backend/app/api/routers/people.py` - endpoints של ניהול אנשים והזנה עצמאית.
- `backend/app/api/routers/locations.py` - endpoints של ניהול מיקומים.
- `backend/app/api/routers/export.py` - endpoints של הורדת XLSX/ZIP.
- `backend/app/services/snapshot_service.py` - לוגיקה עסקית של snapshots, master, ו-Excel.
- `backend/app/services/telegram_bot_service.py` - לוגיקה של בוט טלגרם.

Frontend:

- `frontend/src/App.jsx` - עמוד ראשי וניהול state.
- `frontend/src/api/client.js` - קריאות API מרוכזות.
- `frontend/src/components/PersonTable.jsx` - טבלת תצוגה ועדכונים מהירים.
- `frontend/src/components/PersonFormModal.jsx` - טופס הוספה/עריכה/מחיקה.
- `frontend/src/constants/*.js` - קבועים משותפים לסטטוסים ומיקומים.

## מה המערכת יודעת לעשות

- ניהול טבלת אנשים יומית (מיקום + סטטוס יומי + הערות).
- הוספה/עריכה/מחיקה של אנשים.
- הוספת רשימת שמות התחלתית בבת אחת.
- היסטוריה לפי תאריך + שחזור יום היסטורי ליום הנוכחי.
- הורדת קובץ XLSX ליום בודד.
- הורדת ZIP של כל קבצי XLSX בטווח תאריכים.
- ניהול רשימת מיקומים (הוספה/מחיקה).
- עבודה במצב `local`, `s3`, או `local_and_s3`.
- בוט טלגרם אופציונלי להזנה עצמאית.

## דרישות

- Python `3.9+`
- Node.js `18+`
- npm

## התקנה והרצה

### 1) הגדרת קונפיגורציה

ערוך:

- `config/app_config.yaml`
- `.env` (רק לסודות)

דוגמה ל-`.env`:

- `TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN`

ערכי ברירת מחדל מומלצים לפיתוח מקומי:

- `storage.mode: "local"`
- `storage.local_storage_dir: "./local_storage"`
- `storage.seed_people_file: "./backend/data/sample_people.csv"`
- `frontend.api_base_url: ""`
- `frontend.dev_proxy_target: "http://localhost:8000"`
- `frontend.dev_server_port: 5173`

### 2) הפעלת Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

בדיקת תקינות:

- `http://localhost:8000/api/health`

### 3) הפעלת Frontend

בטרמינל נוסף:

```powershell
cd frontend
npm install
npm run dev
```

כניסה למערכת:

- `http://localhost:5173`

## כל אפשרויות הקונפיגורציה (`config/app_config.yaml`)

### `app`

- `app.name` - שם המערכת (לוגים/זיהוי שירות).
- `app.environment` - סביבת ריצה (`development` / `production`).

### `cors`

- `cors.origins` - רשימת כתובות שמותר להן לגשת ל-API מהדפדפן.

### `frontend`

- `frontend.api_base_url` - בסיס URL ל-API בצד Frontend.
- `frontend.dev_server_port` - פורט של Vite.
- `frontend.dev_proxy_target` - יעד פרוקסי ל-`/api` בזמן פיתוח.

### `storage`

- `storage.mode` - מצב שמירה: `local` / `s3` / `local_and_s3`.
- `storage.local_storage_dir` - נתיב לשמירה מקומית של קבצי Excel.
- `storage.seed_people_file` - קובץ CSV התחלתי ליצירת master בפעם הראשונה.
- `storage.snapshot_restore_policy` - מדיניות שחזור היסטוריה ליום נוכחי:
  - `exact_snapshot`: שחזור מדויק כפי שהיה ביום ההיסטורי (כולל אנשים שכבר לא ב-master).
  - `master_only`: שחזור רק לאנשים הפעילים כרגע ב-master.

#### `storage.s3`

- `storage.s3.bucket_name` - שם הבאקט.
- `storage.s3.snapshots_prefix` - תיקייה לוגית לקבצי snapshot יומיים.
- `storage.s3.master_key` - מפתח קובץ master של אנשים ב-S3.
- `storage.s3.locations_key` - מפתח קובץ master של מיקומים ב-S3.

### `aws`

- `aws.access_key_id`
- `aws.secret_access_key`
- `aws.session_token` (אופציונלי)
- `aws.region`

הערה: שדות `aws.*` ו-`storage.s3.*` נדרשים כשעובדים במצב `s3` או `local_and_s3`.

### `telegram` (אופציונלי)

- `telegram.enabled` - הפעלה/כיבוי של הבוט.
- `telegram.bot_token` - טוקן בוט כ-Fallback בלבד (מומלץ להשאיר ריק).
- `telegram.allowed_chat_ids` - רשימת chat_id מורשים (`[]` = ללא הגבלה).
- `telegram.allowed_remote_names` - רשימת שמות מורשים להזנה מרחוק.
- `telegram.poll_timeout_seconds` - זמן polling מול Telegram.
- `telegram.poll_retry_seconds` - השהיה בין ניסיונות אחרי כשל.

עדיפות טעינת טוקן:

- קודם `TELEGRAM_BOT_TOKEN` מתוך `.env`.
- אם לא קיים, המערכת תנסה להשתמש ב-`telegram.bot_token` מתוך YAML.

התנהגות `telegram.allowed_remote_names`:

- `[]` (ריק): כל שם יכול להירשם.
- רשימה מלאה: רק שמות שנמצאים ברשימה יורשו להזין.

## קבצי Excel במערכת

### קבצים שנוצרים בזמן עבודה

- `local_storage/master/people_master.xlsx`
- `local_storage/master/locations.xlsx`
- `local_storage/snapshots/YYYY-MM-DD.xlsx`

התנהגות יצירת snapshot יומי חדש:

- אם אין קובץ לתאריך שבחרת (כולל תאריך עבר), המערכת יוצרת אותו אוטומטית.
- הקובץ החדש נבנה לפי רשימת האנשים ב-master.
- ערכי העבודה היומיים מאותחלים (למשל `daily_status` מתחיל כ-`לא הוזן`).

### קובץ people_master לדוגמה

נוסף לפרויקט קובץ דוגמה מוכן:

- `backend/data/people_master_example.xlsx`

עמודות בקובץ:

- `person_id`
- `full_name`

שימוש מומלץ:

1. אם אתה רוצה להתחיל עם הקובץ הזה במצב מקומי, העתק אותו ל:
   - `local_storage/master/people_master.xlsx`
2. אם עובדים מול S3, העלה אותו ל-key שמוגדר ב:
   - `storage.s3.master_key`

## סטטוסים במערכת

- סטטוס יומי (`daily_status`):
  - `תקין`
  - `לא תקין`
  - `לא הוזן`
- סטטוס הזנה עצמאית (`self_daily_status`):
  - `תקין`
  - `לא תקין`

## API מרכזי

- `GET /api/health`
- `GET /api/system/status`
- `GET /api/snapshot/today`
- `GET /api/snapshot/{YYYY-MM-DD}` (`create_if_missing=true` כברירת מחדל)
- `GET /api/history/dates`
- `POST /api/history/{YYYY-MM-DD}/restore-to-today`
- `GET /api/locations`
- `POST /api/locations`
- `DELETE /api/locations/{location_name}`
- `POST /api/people`
- `POST /api/people/initialize-list`
- `PATCH /api/people/{person_id}`
- `PUT /api/people/{person_id}`
- `DELETE /api/people/{person_id}`
- `POST /api/self-report`
- `GET /api/export/day/{YYYY-MM-DD}`
- `GET /api/export/range?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`

## בדיקות מהירות

```powershell
cd backend
.\.venv\Scripts\python.exe -m compileall app

cd ..\frontend
npm run build
```

## בדיקות אוטומטיות

נוספו בדיקות business logic עבור `SnapshotService` וקונפיגורציה:

- יצירת snapshot ליום חדש עם איפוס שדות יומיים
- שחזור `exact_snapshot` כולל אנשים שנמחקו מה-master
- שחזור `master_only` עם אנשים פעילים בלבד
- הוספת רשימת שמות התחלתית עם מניעת כפילויות
- יצירת snapshot אוטומטית לתאריך עבר חסר
- טעינת `.env` (כולל BOM / `export KEY=...`)
- עדיפות `TELEGRAM_BOT_TOKEN` על פני token ב-YAML
- חסימת `self_location` ארוך מדי בעדכון עצמי

הרצה:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest -q
```

קובץ בדיקות:

- `backend/tests/test_snapshot_service.py`
- `backend/tests/test_config_env.py`

## תקלות נפוצות

### `Seed people file was not found`

בדוק שהנתיב בקונפיג תואם לקובץ קיים:

- `storage.seed_people_file: "./backend/data/sample_people.csv"`

### Frontend לא מצליח לדבר עם Backend

בדוק:

- `frontend.api_base_url: ""`
- `frontend.dev_proxy_target: "http://localhost:8000"`

### שיניתי קונפיגורציה ולא קרה שינוי

צריך לבצע restart גם ל-Backend וגם ל-Frontend אחרי שינוי ב-`config/app_config.yaml`.

## העברה למחשב אחר

1. מעתיקים את כל תיקיית הפרויקט.
2. מעדכנים את `config/app_config.yaml` לפי המחשב החדש.
3. מתקינים תלות מחדש:
   - `pip install -r backend/requirements.txt`
   - `npm install` בתוך `frontend`
4. אם צריך היסטוריה קיימת, מעתיקים גם את `local_storage`.

## Scale לעומסים גבוהים

ל-MVP העבודה עם Excel נכונה ופשוטה. אם צפוי עומס גבוה (הרבה עדכונים במקביל), מומלץ לעבור ל:

1. DB תפעולי (`SQLite`/`Postgres`) לכתיבה וקריאה שוטפת.
2. יצוא קבצי XLSX כ-snapshot יומי (ולא כמקור הנתונים הראשי בזמן אמת).
3. השארת `people_master.xlsx` כיצוא/גיבוי, לא כמנוע כתיבה תפעולי.

תוכנית מעבר מפורטת:

- `DB_SCALE_PLAN.md`
