# מערכת ניהול סטטוס יומי ומיקום (FastAPI + React)

מערכת אינטרנטית לניהול אנשים, מיקומים וסטטוס יומי, עם שמירת היסטוריה בקבצי Excel (`.xlsx`).

## עיקרון קונפיגורציה

כל ההגדרות מוגדרות רק בקובץ:

- `config/app_config.yaml`

המערכת לא משתמשת ב-`.env`.

## דרישות

- Python `3.9+`
- Node.js `18+`
- npm

## הרצה

### 1) הגדרות

ערוך את הקובץ:

- `config/app_config.yaml`

שדות חשובים להפעלה מקומית:

- `storage.mode: "local"`
- `storage.local_storage_dir: "./local_storage"`
- `storage.seed_people_file: "./backend/data/sample_people.csv"`
- `frontend.api_base_url: ""`
- `frontend.dev_proxy_target: "http://localhost:8000"`
- `frontend.dev_server_port: 5173`

### 2) Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

בדיקת תקינות:

- `http://localhost:8000/api/health`

### 3) Frontend

בטרמינל נוסף:

```powershell
cd frontend
npm install
npm run dev
```

כניסה לאתר:

- `http://localhost:5173`

## מצבי שמירה

- `local` - שמירה מקומית בלבד
- `s3` - שמירה ל-S3 בלבד
- `local_and_s3` - שמירה מקומית + שכפול ל-S3

הגדרות S3 נמצאות תחת:

- `storage.s3.*`
- `aws.*`

## בוט טלגרם (אופציונלי)

הגדרות תחת:

- `telegram.enabled`
- `telegram.bot_token`
- `telegram.allowed_chat_ids`
- `telegram.allowed_remote_names`

אם הבוט לא פעיל, האתר ממשיך לעבוד רגיל ועמודות הזנה עצמאית נשארות ריקות.

## קבצי נתונים (Excel)

- `local_storage/master/people_master.xlsx`
- `local_storage/master/locations.xlsx`
- `local_storage/snapshots/YYYY-MM-DD.xlsx`

## API מרכזי

- `GET /api/health`
- `GET /api/system/status`
- `GET /api/snapshot/today`
- `GET /api/snapshot/{YYYY-MM-DD}`
- `GET /api/history/dates`
- `POST /api/history/{YYYY-MM-DD}/restore-to-today`
- `GET /api/locations`
- `POST /api/locations`
- `DELETE /api/locations/{location_name}`
- `POST /api/people`
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

## תקלות נפוצות

### Seed people file was not found

בדוק ב-`config/app_config.yaml`:

- `storage.seed_people_file: "./backend/data/sample_people.csv"`

### Frontend לא מתחבר ל-Backend

בדוק ב-`config/app_config.yaml`:

- `frontend.api_base_url: ""`
- `frontend.dev_proxy_target: "http://localhost:8000"`

### שיניתי קונפיגורציה ולא השתנה

אחרי שינוי `config/app_config.yaml` יש לבצע restart גם ל-Backend וגם ל-Frontend.

## העברה למחשב אחר

1. מעתיקים את כל תיקיית הפרויקט.
2. מעדכנים רק את `config/app_config.yaml` לפי המחשב החדש.
3. מתקינים תלות מחדש:
   - `pip install -r backend/requirements.txt`
   - `npm install` בתוך `frontend`
4. אם צריך היסטוריה קיימת, מעתיקים גם את `local_storage`.
